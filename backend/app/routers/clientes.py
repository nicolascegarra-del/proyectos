import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.core.dependencies import get_current_user, get_workspace_member
from app.database import get_session
from app.models import Cliente, Proyecto, RolWorkspace, Tarea, User
from app.schemas import ClienteCreate, ClienteOut, ClienteStatsOut, ClienteUpdate

router = APIRouter(prefix="/workspaces/{workspace_id}/clientes", tags=["clientes"])

WRITE_ROLES = (RolWorkspace.owner, RolWorkspace.admin, RolWorkspace.member)


@router.get("", response_model=list[ClienteOut])
async def list_clientes(
    workspace_id: uuid.UUID,
    limit: int = Query(200, ge=1, le=500),
    offset: int = Query(0, ge=0),
    _=Depends(get_workspace_member),
    session: AsyncSession = Depends(get_session),
):
    result = await session.exec(
        select(Cliente).where(Cliente.workspace_id == workspace_id).offset(offset).limit(limit)
    )
    return result.all()


@router.post("", response_model=ClienteOut, status_code=status.HTTP_201_CREATED)
async def create_cliente(
    workspace_id: uuid.UUID,
    data: ClienteCreate,
    member=Depends(get_workspace_member),
    session: AsyncSession = Depends(get_session),
):
    if member.rol not in WRITE_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    cliente = Cliente(workspace_id=workspace_id, **data.model_dump())
    session.add(cliente)
    await session.commit()
    await session.refresh(cliente)
    return cliente


@router.get("/{cliente_id}", response_model=ClienteOut)
async def get_cliente(
    workspace_id: uuid.UUID,
    cliente_id: uuid.UUID,
    _=Depends(get_workspace_member),
    session: AsyncSession = Depends(get_session),
):
    result = await session.exec(
        select(Cliente).where(Cliente.id == cliente_id, Cliente.workspace_id == workspace_id)
    )
    cliente = result.first()
    if not cliente:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente no encontrado")
    return cliente


@router.put("/{cliente_id}", response_model=ClienteOut)
async def update_cliente(
    workspace_id: uuid.UUID,
    cliente_id: uuid.UUID,
    data: ClienteUpdate,
    member=Depends(get_workspace_member),
    session: AsyncSession = Depends(get_session),
):
    if member.rol not in WRITE_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    result = await session.exec(
        select(Cliente).where(Cliente.id == cliente_id, Cliente.workspace_id == workspace_id)
    )
    cliente = result.first()
    if not cliente:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente no encontrado")

    for field, value in data.model_dump(exclude_none=True).items():
        setattr(cliente, field, value)
    cliente.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    session.add(cliente)
    await session.commit()
    await session.refresh(cliente)
    return cliente


@router.delete("/{cliente_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_cliente(
    workspace_id: uuid.UUID,
    cliente_id: uuid.UUID,
    member=Depends(get_workspace_member),
    session: AsyncSession = Depends(get_session),
):
    if member.rol not in (RolWorkspace.owner, RolWorkspace.admin):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    result = await session.exec(
        select(Cliente).where(Cliente.id == cliente_id, Cliente.workspace_id == workspace_id)
    )
    cliente = result.first()
    if not cliente:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente no encontrado")

    await session.delete(cliente)
    await session.commit()


@router.get("/{cliente_id}/stats", response_model=ClienteStatsOut)
async def get_cliente_stats(
    workspace_id: uuid.UUID,
    cliente_id: uuid.UUID,
    _=Depends(get_workspace_member),
    session: AsyncSession = Depends(get_session),
):
    result = await session.exec(
        select(Cliente).where(Cliente.id == cliente_id, Cliente.workspace_id == workspace_id)
    )
    if not result.first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente no encontrado")

    proyectos_result = await session.exec(
        select(Proyecto).where(Proyecto.cliente_id == cliente_id, Proyecto.workspace_id == workspace_id)
    )
    proyectos = proyectos_result.all()
    proyecto_ids = [p.id for p in proyectos]
    tarifa_map = {p.id: p.tarifa_hora for p in proyectos}

    if not proyecto_ids:
        return ClienteStatsOut(proyectos=0, tareas=0, horas_totales=0.0, ingresos_totales=0.0)

    tareas_result = await session.exec(
        select(Tarea.proyecto_id, func.count(Tarea.id).label("n"), func.sum(Tarea.horas).label("h"))
        .where(Tarea.proyecto_id.in_(proyecto_ids))
        .group_by(Tarea.proyecto_id)
    )
    tareas_rows = tareas_result.all()

    total_tareas = sum(row.n for row in tareas_rows)
    total_horas = sum(row.h or 0 for row in tareas_rows)
    total_ingresos = sum((row.h or 0) * tarifa_map.get(row.proyecto_id, 0) for row in tareas_rows)

    return ClienteStatsOut(
        proyectos=len(proyectos),
        tareas=total_tareas,
        horas_totales=round(total_horas, 2),
        ingresos_totales=round(total_ingresos, 2),
    )
