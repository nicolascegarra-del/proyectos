import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.core.dependencies import get_workspace_member
from app.database import get_session
from app.models import Articulo, RolWorkspace
from app.schemas import ArticuloCreate, ArticuloOut, ArticuloUpdate

router = APIRouter(prefix="/workspaces/{workspace_id}/articulos", tags=["articulos"])

WRITE_ROLES = (RolWorkspace.owner, RolWorkspace.admin, RolWorkspace.member)


@router.get("", response_model=list[ArticuloOut])
async def list_articulos(
    workspace_id: uuid.UUID,
    limit: int = Query(200, ge=1, le=500),
    offset: int = Query(0, ge=0),
    _=Depends(get_workspace_member),
    session: AsyncSession = Depends(get_session),
):
    result = await session.exec(
        select(Articulo).where(Articulo.workspace_id == workspace_id).offset(offset).limit(limit)
    )
    return result.all()


@router.post("", response_model=ArticuloOut, status_code=status.HTTP_201_CREATED)
async def create_articulo(
    workspace_id: uuid.UUID,
    data: ArticuloCreate,
    member=Depends(get_workspace_member),
    session: AsyncSession = Depends(get_session),
):
    if member.rol not in WRITE_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    articulo = Articulo(workspace_id=workspace_id, **data.model_dump())
    session.add(articulo)
    await session.commit()
    await session.refresh(articulo)
    return articulo


@router.get("/{articulo_id}", response_model=ArticuloOut)
async def get_articulo(
    workspace_id: uuid.UUID,
    articulo_id: uuid.UUID,
    _=Depends(get_workspace_member),
    session: AsyncSession = Depends(get_session),
):
    result = await session.exec(
        select(Articulo).where(
            Articulo.id == articulo_id, Articulo.workspace_id == workspace_id
        )
    )
    articulo = result.first()
    if not articulo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Artículo no encontrado")
    return articulo


@router.put("/{articulo_id}", response_model=ArticuloOut)
async def update_articulo(
    workspace_id: uuid.UUID,
    articulo_id: uuid.UUID,
    data: ArticuloUpdate,
    member=Depends(get_workspace_member),
    session: AsyncSession = Depends(get_session),
):
    if member.rol not in WRITE_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    result = await session.exec(
        select(Articulo).where(
            Articulo.id == articulo_id, Articulo.workspace_id == workspace_id
        )
    )
    articulo = result.first()
    if not articulo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Artículo no encontrado")

    for field, value in data.model_dump(exclude_none=True).items():
        setattr(articulo, field, value)
    articulo.updated_at = datetime.now(timezone.utc)
    session.add(articulo)
    await session.commit()
    await session.refresh(articulo)
    return articulo


@router.delete("/{articulo_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_articulo(
    workspace_id: uuid.UUID,
    articulo_id: uuid.UUID,
    member=Depends(get_workspace_member),
    session: AsyncSession = Depends(get_session),
):
    if member.rol not in (RolWorkspace.owner, RolWorkspace.admin):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    result = await session.exec(
        select(Articulo).where(
            Articulo.id == articulo_id, Articulo.workspace_id == workspace_id
        )
    )
    articulo = result.first()
    if not articulo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Artículo no encontrado")

    await session.delete(articulo)
    await session.commit()
