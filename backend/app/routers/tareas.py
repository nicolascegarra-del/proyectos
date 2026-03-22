import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.core.dependencies import get_current_user, get_workspace_member
from app.database import get_session
from app.models import (
    Configuracion,
    EstadoPago,
    Proyecto,
    RetainerCiclo,
    RolWorkspace,
    Tarea,
    User,
)
from app.schemas import TareaCreate, TareaOut, TareaUpdate
from app.services.limits import ResourceType, check_limit
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
    return result.all()


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

    tarea = Tarea(proyecto_id=proyecto_id, **data.model_dump())
    session.add(tarea)
    await session.commit()
    await session.refresh(tarea)

    alerta_horas, alerta_retainer = await _check_alerts(proyecto, session)

    out = TareaOut.model_validate(tarea)
    out.alerta_horas = alerta_horas
    out.alerta_retainer = alerta_retainer
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
    return tarea


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

    prev_estado_pago = tarea.estado_pago
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(tarea, field, value)
    tarea.updated_at = datetime.now(timezone.utc)
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
    out = TareaOut.model_validate(tarea)
    out.alerta_horas = alerta_horas
    out.alerta_retainer = alerta_retainer
    return out


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
