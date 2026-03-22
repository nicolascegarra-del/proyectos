import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.core.dependencies import get_current_user, get_workspace_member
from app.database import get_session
from app.models import Cliente, Proyecto, RetainerCiclo, RolWorkspace, Tarea, User
from app.schemas import (
    ProyectoCreate,
    ProyectoOut,
    ProyectoUpdate,
    RetainerCicloCreate,
    RetainerCicloOut,
)
from app.services.limits import ResourceType, check_limit

router = APIRouter(prefix="/workspaces/{workspace_id}/proyectos", tags=["proyectos"])

WRITE_ROLES = (RolWorkspace.owner, RolWorkspace.admin, RolWorkspace.member)


@router.get("", response_model=list[ProyectoOut])
async def list_proyectos(
    workspace_id: uuid.UUID,
    limit: int = Query(200, ge=1, le=500),
    offset: int = Query(0, ge=0),
    _=Depends(get_workspace_member),
    session: AsyncSession = Depends(get_session),
):
    result = await session.exec(
        select(Proyecto).where(Proyecto.workspace_id == workspace_id).offset(offset).limit(limit)
    )
    return result.all()


@router.post("", response_model=ProyectoOut, status_code=status.HTTP_201_CREATED)
async def create_proyecto(
    workspace_id: uuid.UUID,
    data: ProyectoCreate,
    current_user: User = Depends(get_current_user),
    member=Depends(get_workspace_member),
    session: AsyncSession = Depends(get_session),
):
    if member.rol not in WRITE_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    await check_limit(
        session, current_user, ResourceType.proyecto, workspace_id=workspace_id
    )

    cliente_result = await session.exec(
        select(Cliente).where(
            Cliente.id == data.cliente_id, Cliente.workspace_id == workspace_id
        )
    )
    if not cliente_result.first():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cliente no encontrado en este workspace",
        )

    proyecto = Proyecto(workspace_id=workspace_id, **data.model_dump())
    session.add(proyecto)
    await session.commit()
    await session.refresh(proyecto)
    return proyecto


@router.get("/{proyecto_id}", response_model=ProyectoOut)
async def get_proyecto(
    workspace_id: uuid.UUID,
    proyecto_id: uuid.UUID,
    _=Depends(get_workspace_member),
    session: AsyncSession = Depends(get_session),
):
    result = await session.exec(
        select(Proyecto).where(
            Proyecto.id == proyecto_id, Proyecto.workspace_id == workspace_id
        )
    )
    proyecto = result.first()
    if not proyecto:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proyecto no encontrado")
    return proyecto


@router.put("/{proyecto_id}", response_model=ProyectoOut)
async def update_proyecto(
    workspace_id: uuid.UUID,
    proyecto_id: uuid.UUID,
    data: ProyectoUpdate,
    member=Depends(get_workspace_member),
    session: AsyncSession = Depends(get_session),
):
    if member.rol not in WRITE_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    result = await session.exec(
        select(Proyecto).where(
            Proyecto.id == proyecto_id, Proyecto.workspace_id == workspace_id
        )
    )
    proyecto = result.first()
    if not proyecto:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proyecto no encontrado")

    for field, value in data.model_dump(exclude_none=True).items():
        setattr(proyecto, field, value)
    proyecto.updated_at = datetime.now(timezone.utc)
    session.add(proyecto)
    await session.commit()
    await session.refresh(proyecto)
    return proyecto


@router.delete("/{proyecto_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_proyecto(
    workspace_id: uuid.UUID,
    proyecto_id: uuid.UUID,
    member=Depends(get_workspace_member),
    session: AsyncSession = Depends(get_session),
):
    if member.rol not in (RolWorkspace.owner, RolWorkspace.admin):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    result = await session.exec(
        select(Proyecto).where(
            Proyecto.id == proyecto_id, Proyecto.workspace_id == workspace_id
        )
    )
    proyecto = result.first()
    if not proyecto:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proyecto no encontrado")

    await session.delete(proyecto)
    await session.commit()


# ── Retainer Ciclos ───────────────────────────────────────────────────────────

@router.get("/{proyecto_id}/retainer-ciclos", response_model=list[RetainerCicloOut])
async def list_retainer_ciclos(
    workspace_id: uuid.UUID,
    proyecto_id: uuid.UUID,
    _=Depends(get_workspace_member),
    session: AsyncSession = Depends(get_session),
):
    result = await session.exec(
        select(RetainerCiclo).where(RetainerCiclo.proyecto_id == proyecto_id)
    )
    ciclos = result.all()
    if not ciclos:
        return []

    # Batch: fetch all tasks once instead of N+1 queries per ciclo
    tareas_result = await session.exec(
        select(Tarea.fecha, Tarea.horas).where(Tarea.proyecto_id == proyecto_id)
    )
    tareas = tareas_result.all()

    out = []
    for ciclo in ciclos:
        horas = sum(
            t.horas for t in tareas
            if t.fecha >= ciclo.fecha_inicio and (ciclo.fecha_fin is None or t.fecha <= ciclo.fecha_fin)
        )
        item = RetainerCicloOut.model_validate(ciclo)
        item.horas_consumidas = horas
        out.append(item)
    return out


@router.post(
    "/{proyecto_id}/retainer-ciclos",
    response_model=RetainerCicloOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_retainer_ciclo(
    workspace_id: uuid.UUID,
    proyecto_id: uuid.UUID,
    data: RetainerCicloCreate,
    member=Depends(get_workspace_member),
    session: AsyncSession = Depends(get_session),
):
    if member.rol not in WRITE_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    active = await session.exec(
        select(RetainerCiclo).where(
            RetainerCiclo.proyecto_id == proyecto_id,
            RetainerCiclo.is_active == True,
        )
    )
    if active.first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ya existe un ciclo activo para este proyecto. Ciérralo antes de abrir uno nuevo.",
        )

    ciclo = RetainerCiclo(proyecto_id=proyecto_id, **data.model_dump())
    session.add(ciclo)
    await session.commit()
    await session.refresh(ciclo)
    item = RetainerCicloOut.model_validate(ciclo)
    item.horas_consumidas = 0.0
    return item


@router.post("/{proyecto_id}/retainer-ciclos/{ciclo_id}/cerrar", response_model=RetainerCicloOut)
async def cerrar_retainer_ciclo(
    workspace_id: uuid.UUID,
    proyecto_id: uuid.UUID,
    ciclo_id: uuid.UUID,
    member=Depends(get_workspace_member),
    session: AsyncSession = Depends(get_session),
):
    if member.rol not in WRITE_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    result = await session.exec(
        select(RetainerCiclo).where(
            RetainerCiclo.id == ciclo_id,
            RetainerCiclo.proyecto_id == proyecto_id,
        )
    )
    ciclo = result.first()
    if not ciclo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ciclo no encontrado")

    from datetime import date
    ciclo.fecha_fin = date.today()
    ciclo.is_active = False
    session.add(ciclo)
    await session.commit()
    await session.refresh(ciclo)
    horas = await _get_horas_ciclo(ciclo, session)
    item = RetainerCicloOut.model_validate(ciclo)
    item.horas_consumidas = horas
    return item


async def _get_horas_ciclo(ciclo: RetainerCiclo, session: AsyncSession) -> float:
    query = select(func.sum(Tarea.horas)).where(
        Tarea.proyecto_id == ciclo.proyecto_id,
        Tarea.fecha >= ciclo.fecha_inicio,
    )
    if ciclo.fecha_fin:
        query = query.where(Tarea.fecha <= ciclo.fecha_fin)
    result = await session.exec(query)
    return result.one() or 0.0
