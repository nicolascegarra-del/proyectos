import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.core.dependencies import get_current_user, get_workspace_member
from app.database import get_session
from app.models import Comentario, Proyecto, RolWorkspace, Tarea, User
from app.schemas import ComentarioCreate, ComentarioOut, ComentarioUpdate

router = APIRouter(
    prefix="/workspaces/{workspace_id}/proyectos/{proyecto_id}/tareas/{tarea_id}/comentarios",
    tags=["comentarios"],
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


@router.get("", response_model=list[ComentarioOut])
async def list_comentarios(
    workspace_id: uuid.UUID,
    proyecto_id: uuid.UUID,
    tarea_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _member=Depends(get_workspace_member),
):
    await _get_tarea_or_404(workspace_id, proyecto_id, tarea_id, session)
    result = await session.exec(
        select(Comentario).where(Comentario.tarea_id == tarea_id).order_by(Comentario.created_at)
    )
    return result.all()


@router.post("", response_model=ComentarioOut, status_code=status.HTTP_201_CREATED)
async def create_comentario(
    workspace_id: uuid.UUID,
    proyecto_id: uuid.UUID,
    tarea_id: uuid.UUID,
    data: ComentarioCreate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
    member=Depends(get_workspace_member),
):
    if member.rol not in WRITE_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permiso")
    await _get_tarea_or_404(workspace_id, proyecto_id, tarea_id, session)
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    comentario = Comentario(tarea_id=tarea_id, texto=data.texto, created_at=now, updated_at=now)
    session.add(comentario)
    await session.commit()
    await session.refresh(comentario)
    return comentario


@router.put("/{comentario_id}", response_model=ComentarioOut)
async def update_comentario(
    workspace_id: uuid.UUID,
    proyecto_id: uuid.UUID,
    tarea_id: uuid.UUID,
    comentario_id: uuid.UUID,
    data: ComentarioUpdate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
    member=Depends(get_workspace_member),
):
    if member.rol not in WRITE_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permiso")
    await _get_tarea_or_404(workspace_id, proyecto_id, tarea_id, session)
    result = await session.exec(
        select(Comentario).where(Comentario.id == comentario_id, Comentario.tarea_id == tarea_id)
    )
    comentario = result.first()
    if not comentario:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comentario no encontrado")
    if data.texto is not None:
        comentario.texto = data.texto
    comentario.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    session.add(comentario)
    await session.commit()
    await session.refresh(comentario)
    return comentario


@router.delete("/{comentario_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_comentario(
    workspace_id: uuid.UUID,
    proyecto_id: uuid.UUID,
    tarea_id: uuid.UUID,
    comentario_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
    member=Depends(get_workspace_member),
):
    if member.rol not in WRITE_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permiso")
    await _get_tarea_or_404(workspace_id, proyecto_id, tarea_id, session)
    result = await session.exec(
        select(Comentario).where(Comentario.id == comentario_id, Comentario.tarea_id == tarea_id)
    )
    comentario = result.first()
    if not comentario:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comentario no encontrado")
    await session.delete(comentario)
    await session.commit()
