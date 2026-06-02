import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

import sqlalchemy
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

UPLOAD_DIR = Path("/app/uploads")
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".zip", ".txt", ".md"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB

from app.core.dependencies import get_current_user, get_workspace_member
from app.database import get_session
from app.models import (
    Configuracion,
    EstadoPago,
    KanbanEstado,
    Proyecto,
    RetainerCiclo,
    RolWorkspace,
    Subtarea,
    Tag,
    Tarea,
    User,
)
from app.schemas import TareaCreate, TareaOut, TareaUpdate
from app.services.limits import ResourceType, check_limit
from app.services.sanitize import sanitize_html
from app.services.webhook import trigger_webhook_background

router = APIRouter(prefix="/workspaces/{workspace_id}/proyectos/{proyecto_id}/tareas", tags=["tareas"])

WRITE_ROLES = (RolWorkspace.owner, RolWorkspace.admin, RolWorkspace.member)


async def _get_proyecto_or_404(workspace_id: uuid.UUID, proyecto_id: uuid.UUID, session: AsyncSession) -> Proyecto:
    result = await session.exec(
        select(Proyecto).where(Proyecto.id == proyecto_id, Proyecto.workspace_id == workspace_id)
    )
    proyecto = result.first()
    if not proyecto:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proyecto no encontrado")
    return proyecto


async def _get_subtarea_counts(tarea_ids: list[uuid.UUID], session: AsyncSession) -> dict[uuid.UUID, tuple[int, int]]:
    """Returns {tarea_id: (total, completadas)} for the given tarea ids."""
    if not tarea_ids:
        return {}
    rows = await session.exec(
        select(
            Subtarea.tarea_id,
            func.count(Subtarea.id).label("total"),
            func.sum(func.cast(Subtarea.completada, sqlalchemy.Integer)).label("hechas"),
        )
        .where(Subtarea.tarea_id.in_(tarea_ids))
        .group_by(Subtarea.tarea_id)
    )
    return {row.tarea_id: (row.total, int(row.hechas or 0)) for row in rows}


async def _check_alerts(proyecto: Proyecto, session: AsyncSession) -> tuple[bool, bool]:
    total_horas_result = await session.exec(
        select(func.sum(Tarea.horas)).where(Tarea.proyecto_id == proyecto.id)
    )
    total_horas = total_horas_result.one() or 0.0

    alerta_horas = bool(
        proyecto.alerta_horas_max and total_horas >= proyecto.alerta_horas_max
    )

    alerta_retainer = False
    ciclo_result = await session.exec(
        select(RetainerCiclo).where(
            RetainerCiclo.proyecto_id == proyecto.id,
            RetainerCiclo.is_active == True,
        )
    )
    ciclo = ciclo_result.first()
    if ciclo:
        horas_ciclo_result = await session.exec(
            select(func.sum(Tarea.horas)).where(
                Tarea.proyecto_id == proyecto.id,
                Tarea.fecha >= ciclo.fecha_inicio,
            )
        )
        horas_ciclo = horas_ciclo_result.one() or 0.0
        alerta_retainer = horas_ciclo >= ciclo.horas_asignadas

    return alerta_horas, alerta_retainer


@router.get("", response_model=list[TareaOut])
async def list_tareas(
    workspace_id: uuid.UUID,
    proyecto_id: uuid.UUID,
    limit: int = Query(200, ge=1, le=500),
    offset: int = Query(0, ge=0),
    _=Depends(get_workspace_member),
    session: AsyncSession = Depends(get_session),
):
    await _get_proyecto_or_404(workspace_id, proyecto_id, session)
    result = await session.exec(
        select(Tarea).where(Tarea.proyecto_id == proyecto_id).offset(offset).limit(limit)
    )
    tareas = result.all()
    counts = await _get_subtarea_counts([t.id for t in tareas], session)
    outs = []
    for t in tareas:
        out = TareaOut.model_validate(t)
        total, hechas = counts.get(t.id, (0, 0))
        out.subtareas_total = total
        out.subtareas_completadas = hechas
        outs.append(out)
    return outs


@router.post("", response_model=TareaOut, status_code=status.HTTP_201_CREATED)
async def create_tarea(
    workspace_id: uuid.UUID,
    proyecto_id: uuid.UUID,
    data: TareaCreate,
    current_user: User = Depends(get_current_user),
    member=Depends(get_workspace_member),
    session: AsyncSession = Depends(get_session),
):
    if member.rol not in WRITE_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    proyecto = await _get_proyecto_or_404(workspace_id, proyecto_id, session)
    await check_limit(
        session, current_user, ResourceType.tarea, proyecto_id=proyecto_id
    )

    if data.tag_id:
        tag_result = await session.exec(
            select(Tag).where(Tag.id == data.tag_id, Tag.workspace_id == workspace_id)
        )
        if not tag_result.first():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tag no encontrado en este workspace")

    # Resolver estado_kanban: si no se provee, usar el primer estado del proyecto
    estado_kanban_id = data.estado_kanban
    if estado_kanban_id is None:
        first_estado_result = await session.exec(
            select(KanbanEstado)
            .where(KanbanEstado.proyecto_id == proyecto_id)
            .order_by(KanbanEstado.orden)
        )
        first_estado = first_estado_result.first()
        if not first_estado:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El proyecto no tiene estados Kanban configurados")
        estado_kanban_id = first_estado.id

    tarea_data = data.model_dump()
    subtareas_payload = tarea_data.pop("subtareas", []) or []
    tarea_data["estado_kanban"] = estado_kanban_id
    tarea_data["descripcion_larga"] = sanitize_html(tarea_data.get("descripcion_larga"))
    tarea = Tarea(proyecto_id=proyecto_id, **tarea_data)
    session.add(tarea)
    await session.flush()

    for sub in subtareas_payload:
        if not sub.get("descripcion") or not sub["descripcion"].strip():
            continue
        session.add(
            Subtarea(
                tarea_id=tarea.id,
                descripcion=sub["descripcion"].strip(),
                fecha_inicio=sub.get("fecha_inicio"),
                fecha_fin=sub.get("fecha_fin"),
                horas_estimadas=sub.get("horas_estimadas"),
            )
        )

    await session.commit()
    await session.refresh(tarea)

    alerta_horas, alerta_retainer = await _check_alerts(proyecto, session)
    counts = await _get_subtarea_counts([tarea.id], session)

    out = TareaOut.model_validate(tarea)
    out.alerta_horas = alerta_horas
    out.alerta_retainer = alerta_retainer
    total, hechas = counts.get(tarea.id, (0, 0))
    out.subtareas_total = total
    out.subtareas_completadas = hechas
    return out


@router.get("/{tarea_id}", response_model=TareaOut)
async def get_tarea(
    workspace_id: uuid.UUID,
    proyecto_id: uuid.UUID,
    tarea_id: uuid.UUID,
    _=Depends(get_workspace_member),
    session: AsyncSession = Depends(get_session),
):
    await _get_proyecto_or_404(workspace_id, proyecto_id, session)
    result = await session.exec(
        select(Tarea).where(Tarea.id == tarea_id, Tarea.proyecto_id == proyecto_id)
    )
    tarea = result.first()
    if not tarea:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tarea no encontrada")
    counts = await _get_subtarea_counts([tarea.id], session)
    out = TareaOut.model_validate(tarea)
    total, hechas = counts.get(tarea.id, (0, 0))
    out.subtareas_total = total
    out.subtareas_completadas = hechas
    return out


@router.put("/{tarea_id}", response_model=TareaOut)
async def update_tarea(
    workspace_id: uuid.UUID,
    proyecto_id: uuid.UUID,
    tarea_id: uuid.UUID,
    data: TareaUpdate,
    member=Depends(get_workspace_member),
    session: AsyncSession = Depends(get_session),
):
    if member.rol not in WRITE_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    proyecto = await _get_proyecto_or_404(workspace_id, proyecto_id, session)
    result = await session.exec(
        select(Tarea).where(Tarea.id == tarea_id, Tarea.proyecto_id == proyecto_id)
    )
    tarea = result.first()
    if not tarea:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tarea no encontrada")

    if tarea.is_locked:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="La tarea está bloqueada y no se puede editar",
        )

    if data.tag_id:
        tag_result = await session.exec(
            select(Tag).where(Tag.id == data.tag_id, Tag.workspace_id == workspace_id)
        )
        if not tag_result.first():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tag no encontrado en este workspace")

    prev_estado_pago = tarea.estado_pago
    # Handle nullable fields that can be explicitly cleared to None
    if 'sprint_id' in data.model_fields_set:
        tarea.sprint_id = data.sprint_id
    payload = data.model_dump(exclude_none=True)
    if "descripcion_larga" in payload:
        payload["descripcion_larga"] = sanitize_html(payload["descripcion_larga"])
    for field, value in payload.items():
        if field == 'sprint_id':
            continue  # already handled above
        setattr(tarea, field, value)
    tarea.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    session.add(tarea)
    await session.commit()
    await session.refresh(tarea)

    if (
        data.estado_pago == EstadoPago.cobrado
        and prev_estado_pago != EstadoPago.cobrado
    ):
        config_result = await session.exec(
            select(Configuracion).where(Configuracion.workspace_id == workspace_id)
        )
        config = config_result.first()
        if config and config.webhook_url:
            trigger_webhook_background(
                config.webhook_url,
                "tarea.cobrada",
                workspace_id,
                tarea.id,
                {"tarea_id": str(tarea.id), "proyecto_id": str(proyecto_id), "horas": tarea.horas},
            )

    alerta_horas, alerta_retainer = await _check_alerts(proyecto, session)
    counts = await _get_subtarea_counts([tarea.id], session)
    out = TareaOut.model_validate(tarea)
    out.alerta_horas = alerta_horas
    out.alerta_retainer = alerta_retainer
    total, hechas = counts.get(tarea.id, (0, 0))
    out.subtareas_total = total
    out.subtareas_completadas = hechas
    return out


@router.post("/{tarea_id}/upload", response_model=TareaOut)
async def upload_archivo(
    workspace_id: uuid.UUID,
    proyecto_id: uuid.UUID,
    tarea_id: uuid.UUID,
    file: UploadFile = File(...),
    member=Depends(get_workspace_member),
    session: AsyncSession = Depends(get_session),
):
    if member.rol not in WRITE_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    await _get_proyecto_or_404(workspace_id, proyecto_id, session)
    result = await session.exec(
        select(Tarea).where(Tarea.id == tarea_id, Tarea.proyecto_id == proyecto_id)
    )
    tarea = result.first()
    if not tarea:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tarea no encontrada")

    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Extensión no permitida: {ext}")

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="El archivo supera los 10 MB")

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    safe_name = f"{tarea_id}_{uuid.uuid4().hex[:8]}{ext}"
    (UPLOAD_DIR / safe_name).write_bytes(content)

    tarea.archivo_url = f"/uploads/{safe_name}"
    tarea.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    session.add(tarea)
    await session.commit()
    await session.refresh(tarea)
    return tarea


@router.delete("/{tarea_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tarea(
    workspace_id: uuid.UUID,
    proyecto_id: uuid.UUID,
    tarea_id: uuid.UUID,
    member=Depends(get_workspace_member),
    session: AsyncSession = Depends(get_session),
):
    if member.rol not in WRITE_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    await _get_proyecto_or_404(workspace_id, proyecto_id, session)
    result = await session.exec(
        select(Tarea).where(Tarea.id == tarea_id, Tarea.proyecto_id == proyecto_id)
    )
    tarea = result.first()
    if not tarea:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tarea no encontrada")

    if tarea.is_locked:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="La tarea está bloqueada y no se puede eliminar",
        )

    await session.delete(tarea)
    await session.commit()
