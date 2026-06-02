import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.core.dependencies import get_current_user, get_workspace_member
from app.database import get_session
from app.models import Proyecto, RolWorkspace, Subtarea, Tarea, User
from app.schemas import SubtareaCreate, SubtareaOut, SubtareaUpdate

router = APIRouter(
    prefix="/workspaces/{workspace_id}/proyectos/{proyecto_id}/tareas/{tarea_id}/subtareas",
    tags=["subtareas"],
)

WRITE_ROLES = (RolWorkspace.owner, RolWorkspace.admin, RolWorkspace.member)


async def _get_tarea_or_404(
    workspace_id: uuid.UUID,
    proyecto_id: uuid.UUID,
    tarea_id: uuid.UUID,
    session: AsyncSession,
) -> Tarea:
    result = await session.exec(
        select(Tarea).where(Tarea.id == tarea_id, Tarea.proyecto_id == proyecto_id)
    )
    tarea = result.first()
    if not tarea:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tarea no encontrada")
    proyecto_result = await session.exec(
        select(Proyecto).where(Proyecto.id == proyecto_id, Proyecto.workspace_id == workspace_id)
    )
    if not proyecto_result.first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proyecto no encontrado")
    return tarea


@router.get("", response_model=list[SubtareaOut])
async def list_subtareas(
    workspace_id: uuid.UUID,
    proyecto_id: uuid.UUID,
    tarea_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _member=Depends(get_workspace_member),
):
    await _get_tarea_or_404(workspace_id, proyecto_id, tarea_id, session)
    result = await session.exec(
        select(Subtarea).where(Subtarea.tarea_id == tarea_id).order_by(Subtarea.created_at)
    )
    return result.all()


@router.post("", response_model=SubtareaOut, status_code=status.HTTP_201_CREATED)
async def create_subtarea(
    workspace_id: uuid.UUID,
    proyecto_id: uuid.UUID,
    tarea_id: uuid.UUID,
    data: SubtareaCreate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
    member=Depends(get_workspace_member),
):
    if member.rol not in WRITE_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permiso")
    tarea = await _get_tarea_or_404(workspace_id, proyecto_id, tarea_id, session)
    if tarea.is_locked:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="La tarea está bloqueada")
    subtarea = Subtarea(
        tarea_id=tarea_id,
        descripcion=data.descripcion,
        fecha_inicio=data.fecha_inicio,
        fecha_fin=data.fecha_fin,
        horas_estimadas=data.horas_estimadas,
    )
    session.add(subtarea)
    await session.commit()
    await session.refresh(subtarea)
    return subtarea


@router.put("/{subtarea_id}", response_model=SubtareaOut)
async def update_subtarea(
    workspace_id: uuid.UUID,
    proyecto_id: uuid.UUID,
    tarea_id: uuid.UUID,
    subtarea_id: uuid.UUID,
    data: SubtareaUpdate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
    member=Depends(get_workspace_member),
):
    if member.rol not in WRITE_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permiso")
    await _get_tarea_or_404(workspace_id, proyecto_id, tarea_id, session)
    result = await session.exec(
        select(Subtarea).where(Subtarea.id == subtarea_id, Subtarea.tarea_id == tarea_id)
    )
    subtarea = result.first()
    if not subtarea:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subtarea no encontrada")
    payload = data.model_dump(exclude_unset=True)
    for field in ("descripcion", "completada", "fecha_inicio", "fecha_fin", "horas_estimadas"):
        if field in payload:
            setattr(subtarea, field, payload[field])
    subtarea.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    session.add(subtarea)
    await session.commit()
    await session.refresh(subtarea)
    return subtarea


@router.delete("/{subtarea_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_subtarea(
    workspace_id: uuid.UUID,
    proyecto_id: uuid.UUID,
    tarea_id: uuid.UUID,
    subtarea_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
    member=Depends(get_workspace_member),
):
    if member.rol not in WRITE_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permiso")
    await _get_tarea_or_404(workspace_id, proyecto_id, tarea_id, session)
    result = await session.exec(
        select(Subtarea).where(Subtarea.id == subtarea_id, Subtarea.tarea_id == tarea_id)
    )
    subtarea = result.first()
    if not subtarea:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subtarea no encontrada")
    await session.delete(subtarea)
    await session.commit()
