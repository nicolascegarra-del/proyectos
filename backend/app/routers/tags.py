import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.core.dependencies import get_workspace_member
from app.database import get_session
from app.models import RolWorkspace, Tag
from app.schemas import TagCreate, TagOut, TagUpdate

router = APIRouter(prefix="/workspaces/{workspace_id}/tags", tags=["tags"])

WRITE_ROLES = (RolWorkspace.owner, RolWorkspace.admin, RolWorkspace.member)


@router.get("", response_model=list[TagOut])
async def list_tags(
    workspace_id: uuid.UUID,
    limit: int = Query(200, ge=1, le=500),
    offset: int = Query(0, ge=0),
    _=Depends(get_workspace_member),
    session: AsyncSession = Depends(get_session),
):
    result = await session.exec(
        select(Tag).where(Tag.workspace_id == workspace_id).offset(offset).limit(limit)
    )
    return result.all()


@router.post("", response_model=TagOut, status_code=status.HTTP_201_CREATED)
async def create_tag(
    workspace_id: uuid.UUID,
    data: TagCreate,
    member=Depends(get_workspace_member),
    session: AsyncSession = Depends(get_session),
):
    if member.rol not in WRITE_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    tag = Tag(workspace_id=workspace_id, **data.model_dump())
    session.add(tag)
    await session.commit()
    await session.refresh(tag)
    return tag


@router.put("/{tag_id}", response_model=TagOut)
async def update_tag(
    workspace_id: uuid.UUID,
    tag_id: uuid.UUID,
    data: TagUpdate,
    member=Depends(get_workspace_member),
    session: AsyncSession = Depends(get_session),
):
    if member.rol not in WRITE_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    result = await session.exec(
        select(Tag).where(Tag.id == tag_id, Tag.workspace_id == workspace_id)
    )
    tag = result.first()
    if not tag:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tag no encontrado")

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
    member=Depends(get_workspace_member),
    session: AsyncSession = Depends(get_session),
):
    if member.rol not in (RolWorkspace.owner, RolWorkspace.admin):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    result = await session.exec(
        select(Tag).where(Tag.id == tag_id, Tag.workspace_id == workspace_id)
    )
    tag = result.first()
    if not tag:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tag no encontrado")

    await session.delete(tag)
    await session.commit()
