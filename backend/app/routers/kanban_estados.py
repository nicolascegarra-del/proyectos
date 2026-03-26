import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.core.dependencies import get_workspace_member
from app.database import get_session
from app.models import KanbanEstado, Proyecto, RolWorkspace, Tarea
from app.schemas import KanbanEstadoCreate, KanbanEstadoOut, KanbanEstadoUpdate, KanbanReorderRequest

router = APIRouter(
    prefix="/workspaces/{workspace_id}/proyectos/{proyecto_id}/kanban-estados",
    tags=["kanban-estados"],
)

WRITE_ROLES = (RolWorkspace.owner, RolWorkspace.admin, RolWorkspace.member)


async def _get_proyecto_or_404(workspace_id: uuid.UUID, proyecto_id: uuid.UUID, session: AsyncSession) -> Proyecto:
    result = await session.exec(
        select(Proyecto).where(Proyecto.id == proyecto_id, Proyecto.workspace_id == workspace_id)
    )
    proyecto = result.first()
    if not proyecto:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proyecto no encontrado")
    return proyecto


async def _get_estado_or_404(proyecto_id: uuid.UUID, estado_id: uuid.UUID, session: AsyncSession) -> KanbanEstado:
    result = await session.exec(
        select(KanbanEstado).where(KanbanEstado.id == estado_id, KanbanEstado.proyecto_id == proyecto_id)
    )
    estado = result.first()
    if not estado:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Estado no encontrado")
    return estado


@router.get("", response_model=list[KanbanEstadoOut])
async def list_kanban_estados(
    workspace_id: uuid.UUID,
    proyecto_id: uuid.UUID,
    _=Depends(get_workspace_member),
    session: AsyncSession = Depends(get_session),
):
    await _get_proyecto_or_404(workspace_id, proyecto_id, session)
    result = await session.exec(
        select(KanbanEstado)
        .where(KanbanEstado.proyecto_id == proyecto_id)
        .order_by(KanbanEstado.orden)
    )
    return result.all()


@router.post("", response_model=KanbanEstadoOut, status_code=status.HTTP_201_CREATED)
async def create_kanban_estado(
    workspace_id: uuid.UUID,
    proyecto_id: uuid.UUID,
    data: KanbanEstadoCreate,
    member=Depends(get_workspace_member),
    session: AsyncSession = Depends(get_session),
):
    if member.rol not in WRITE_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    await _get_proyecto_or_404(workspace_id, proyecto_id, session)

    # Assign next orden
    result = await session.exec(
        select(KanbanEstado)
        .where(KanbanEstado.proyecto_id == proyecto_id)
        .order_by(KanbanEstado.orden.desc())  # type: ignore[arg-type]
    )
    existing = result.all()
    next_orden = (existing[0].orden + 1) if existing else 1

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    estado = KanbanEstado(
        proyecto_id=proyecto_id,
        nombre=data.nombre,
        color=data.color,
        es_final=data.es_final,
        orden=next_orden,
        created_at=now,
        updated_at=now,
    )
    session.add(estado)
    await session.commit()
    await session.refresh(estado)
    return estado


@router.put("/{estado_id}", response_model=KanbanEstadoOut)
async def update_kanban_estado(
    workspace_id: uuid.UUID,
    proyecto_id: uuid.UUID,
    estado_id: uuid.UUID,
    data: KanbanEstadoUpdate,
    member=Depends(get_workspace_member),
    session: AsyncSession = Depends(get_session),
):
    if member.rol not in WRITE_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    await _get_proyecto_or_404(workspace_id, proyecto_id, session)
    estado = await _get_estado_or_404(proyecto_id, estado_id, session)

    for field, value in data.model_dump(exclude_none=True).items():
        setattr(estado, field, value)
    estado.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)

    session.add(estado)
    await session.commit()
    await session.refresh(estado)
    return estado


@router.delete("/{estado_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_kanban_estado(
    workspace_id: uuid.UUID,
    proyecto_id: uuid.UUID,
    estado_id: uuid.UUID,
    member=Depends(get_workspace_member),
    session: AsyncSession = Depends(get_session),
):
    if member.rol not in WRITE_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    await _get_proyecto_or_404(workspace_id, proyecto_id, session)
    estado = await _get_estado_or_404(proyecto_id, estado_id, session)

    # Prevent deleting if it's the only estado
    count_result = await session.exec(
        select(KanbanEstado).where(KanbanEstado.proyecto_id == proyecto_id)
    )
    if len(count_result.all()) <= 1:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No se puede eliminar el único estado del proyecto")

    # Check if tasks use this estado
    tareas_result = await session.exec(
        select(Tarea).where(Tarea.estado_kanban == estado_id).limit(1)
    )
    if tareas_result.first():
        count_result2 = await session.exec(
            select(Tarea).where(Tarea.estado_kanban == estado_id)
        )
        n = len(count_result2.all())
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Hay {n} tarea{'s' if n != 1 else ''} con este estado. Reasígnalas antes de eliminar.",
        )

    await session.delete(estado)
    await session.commit()


@router.put("/reorder/bulk", response_model=list[KanbanEstadoOut])
async def reorder_kanban_estados(
    workspace_id: uuid.UUID,
    proyecto_id: uuid.UUID,
    data: KanbanReorderRequest,
    member=Depends(get_workspace_member),
    session: AsyncSession = Depends(get_session),
):
    if member.rol not in WRITE_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    await _get_proyecto_or_404(workspace_id, proyecto_id, session)

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    updated = []
    for orden, estado_id in enumerate(data.ids, start=1):
        estado = await _get_estado_or_404(proyecto_id, estado_id, session)
        estado.orden = orden
        estado.updated_at = now
        session.add(estado)
        updated.append(estado)

    await session.commit()
    for e in updated:
        await session.refresh(e)
    return sorted(updated, key=lambda e: e.orden)
