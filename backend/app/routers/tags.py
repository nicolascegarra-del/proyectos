import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.core.dependencies import get_current_user, get_workspace_member
from app.database import get_session
from app.models import NotaTag, RolWorkspace, Tag, TareaTag, User
from app.schemas import TagCreate, TagOut, TagUpdate

router = APIRouter(prefix="/workspaces/{workspace_id}/tags", tags=["tags"])

# Etiquetas por defecto que se crean automáticamente para cada usuario en cada workspace.
DEFAULT_TAGS: tuple[tuple[str, str], ...] = (
    ("General", "#6B7280"),
    ("Reunión", "#EAB308"),
    ("Bloqueo", "#EF4444"),
)


async def _seed_default_tags(
    workspace_id: uuid.UUID, user_id: uuid.UUID, session: AsyncSession
) -> list[Tag]:
    """Crea las etiquetas por defecto del usuario en el workspace y las devuelve."""
    tags = [
        Tag(workspace_id=workspace_id, user_id=user_id, nombre=nombre, color=color)
        for nombre, color in DEFAULT_TAGS
    ]
    session.add_all(tags)
    await session.commit()
    for tag in tags:
        await session.refresh(tag)
    return tags


@router.get("", response_model=list[TagOut])
async def list_tags(
    workspace_id: uuid.UUID,
    limit: int = Query(200, ge=1, le=500),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    _=Depends(get_workspace_member),
    session: AsyncSession = Depends(get_session),
):
    result = await session.exec(
        select(Tag)
        .where(Tag.workspace_id == workspace_id, Tag.user_id == current_user.id)
        .order_by(Tag.created_at)
        .offset(offset)
        .limit(limit)
    )
    tags = result.all()
    # Primer acceso del usuario a este workspace: sembrar las etiquetas por defecto.
    if not tags and offset == 0:
        tags = await _seed_default_tags(workspace_id, current_user.id, session)
    return tags


@router.post("", response_model=TagOut, status_code=status.HTTP_201_CREATED)
async def create_tag(
    workspace_id: uuid.UUID,
    data: TagCreate,
    current_user: User = Depends(get_current_user),
    member=Depends(get_workspace_member),
    session: AsyncSession = Depends(get_session),
):
    if member.rol == RolWorkspace.viewer:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    tag = Tag(workspace_id=workspace_id, user_id=current_user.id, **data.model_dump())
    session.add(tag)
    await session.commit()
    await session.refresh(tag)
    return tag


@router.put("/{tag_id}", response_model=TagOut)
async def update_tag(
    workspace_id: uuid.UUID,
    tag_id: uuid.UUID,
    data: TagUpdate,
    current_user: User = Depends(get_current_user),
    _=Depends(get_workspace_member),
    session: AsyncSession = Depends(get_session),
):
    result = await session.exec(
        select(Tag).where(
            Tag.id == tag_id,
            Tag.workspace_id == workspace_id,
            Tag.user_id == current_user.id,
        )
    )
    tag = result.first()
    if not tag:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Etiqueta no encontrada")

    for field, value in data.model_dump(exclude_none=True).items():
        setattr(tag, field, value)
    session.add(tag)
    await session.commit()
    await session.refresh(tag)
    return tag


@router.delete("/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tag(
    workspace_id: uuid.UUID,
    tag_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    _=Depends(get_workspace_member),
    session: AsyncSession = Depends(get_session),
):
    result = await session.exec(
        select(Tag).where(
            Tag.id == tag_id,
            Tag.workspace_id == workspace_id,
            Tag.user_id == current_user.id,
        )
    )
    tag = result.first()
    if not tag:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Etiqueta no encontrada")

    # Eliminar las asociaciones en tareas/notas antes de borrar la etiqueta
    # (SQLite, usado en tests, no aplica ON DELETE CASCADE por defecto).
    await session.execute(delete(TareaTag).where(TareaTag.tag_id == tag_id))
    await session.execute(delete(NotaTag).where(NotaTag.tag_id == tag_id))
    await session.delete(tag)
    await session.commit()
