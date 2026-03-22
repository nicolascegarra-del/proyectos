import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.core.dependencies import get_workspace_member
from app.database import get_session
from app.models import Configuracion, RolWorkspace
from app.schemas import ConfiguracionOut, ConfiguracionUpdate

router = APIRouter(prefix="/workspaces/{workspace_id}/configuracion", tags=["configuracion"])


@router.get("", response_model=ConfiguracionOut)
async def get_configuracion(
    workspace_id: uuid.UUID,
    _=Depends(get_workspace_member),
    session: AsyncSession = Depends(get_session),
):
    result = await session.exec(
        select(Configuracion).where(Configuracion.workspace_id == workspace_id)
    )
    config = result.first()
    if not config:
        config = Configuracion(workspace_id=workspace_id)
        session.add(config)
        await session.commit()
        await session.refresh(config)
    return config


@router.put("", response_model=ConfiguracionOut)
async def update_configuracion(
    workspace_id: uuid.UUID,
    data: ConfiguracionUpdate,
    member=Depends(get_workspace_member),
    session: AsyncSession = Depends(get_session),
):
    if member.rol not in (RolWorkspace.owner, RolWorkspace.admin):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    result = await session.exec(
        select(Configuracion).where(Configuracion.workspace_id == workspace_id)
    )
    config = result.first()
    if not config:
        config = Configuracion(workspace_id=workspace_id)

    for field, value in data.model_dump(exclude_none=True).items():
        setattr(config, field, value)
    config.updated_at = datetime.now(timezone.utc)
    session.add(config)
    await session.commit()
    await session.refresh(config)
    return config
