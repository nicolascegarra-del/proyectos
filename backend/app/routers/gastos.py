import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.core.dependencies import get_current_user, get_workspace_member
from app.database import get_session
from app.models import Gasto, Proyecto, RolWorkspace, User
from app.schemas import GastoCreate, GastoOut, GastoUpdate
from app.services.limits import ResourceType, check_limit

router = APIRouter(
    prefix="/workspaces/{workspace_id}/proyectos/{proyecto_id}/gastos",
    tags=["gastos"],
)

WRITE_ROLES = (RolWorkspace.owner, RolWorkspace.admin, RolWorkspace.member)


async def _get_proyecto_or_404(
    workspace_id: uuid.UUID, proyecto_id: uuid.UUID, session: AsyncSession
) -> Proyecto:
    result = await session.exec(
        select(Proyecto).where(
            Proyecto.id == proyecto_id, Proyecto.workspace_id == workspace_id
        )
    )
    proyecto = result.first()
    if not proyecto:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Proyecto no encontrado"
        )
    return proyecto


@router.get("", response_model=list[GastoOut])
async def list_gastos(
    workspace_id: uuid.UUID,
    proyecto_id: uuid.UUID,
    limit: int = Query(200, ge=1, le=500),
    offset: int = Query(0, ge=0),
    _=Depends(get_workspace_member),
    session: AsyncSession = Depends(get_session),
):
    await _get_proyecto_or_404(workspace_id, proyecto_id, session)
    result = await session.exec(
        select(Gasto).where(Gasto.proyecto_id == proyecto_id).offset(offset).limit(limit)
    )
    return result.all()


@router.post("", response_model=GastoOut, status_code=status.HTTP_201_CREATED)
async def create_gasto(
    workspace_id: uuid.UUID,
    proyecto_id: uuid.UUID,
    data: GastoCreate,
    current_user: User = Depends(get_current_user),
    member=Depends(get_workspace_member),
    session: AsyncSession = Depends(get_session),
):
    if member.rol not in WRITE_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    await _get_proyecto_or_404(workspace_id, proyecto_id, session)
    await check_limit(session, current_user, ResourceType.gasto, proyecto_id=proyecto_id)

    gasto = Gasto(proyecto_id=proyecto_id, **data.model_dump())
    session.add(gasto)
    await session.commit()
    await session.refresh(gasto)
    return gasto


@router.get("/{gasto_id}", response_model=GastoOut)
async def get_gasto(
    workspace_id: uuid.UUID,
    proyecto_id: uuid.UUID,
    gasto_id: uuid.UUID,
    _=Depends(get_workspace_member),
    session: AsyncSession = Depends(get_session),
):
    await _get_proyecto_or_404(workspace_id, proyecto_id, session)
    result = await session.exec(
        select(Gasto).where(Gasto.id == gasto_id, Gasto.proyecto_id == proyecto_id)
    )
    gasto = result.first()
    if not gasto:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Gasto no encontrado")
    return gasto


@router.put("/{gasto_id}", response_model=GastoOut)
async def update_gasto(
    workspace_id: uuid.UUID,
    proyecto_id: uuid.UUID,
    gasto_id: uuid.UUID,
    data: GastoUpdate,
    member=Depends(get_workspace_member),
    session: AsyncSession = Depends(get_session),
):
    if member.rol not in WRITE_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    await _get_proyecto_or_404(workspace_id, proyecto_id, session)
    result = await session.exec(
        select(Gasto).where(Gasto.id == gasto_id, Gasto.proyecto_id == proyecto_id)
    )
    gasto = result.first()
    if not gasto:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Gasto no encontrado")

    for field, value in data.model_dump(exclude_none=True).items():
        setattr(gasto, field, value)
    gasto.updated_at = datetime.now(timezone.utc)
    session.add(gasto)
    await session.commit()
    await session.refresh(gasto)
    return gasto


@router.delete("/{gasto_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_gasto(
    workspace_id: uuid.UUID,
    proyecto_id: uuid.UUID,
    gasto_id: uuid.UUID,
    member=Depends(get_workspace_member),
    session: AsyncSession = Depends(get_session),
):
    if member.rol not in WRITE_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    await _get_proyecto_or_404(workspace_id, proyecto_id, session)
    result = await session.exec(
        select(Gasto).where(Gasto.id == gasto_id, Gasto.proyecto_id == proyecto_id)
    )
    gasto = result.first()
    if not gasto:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Gasto no encontrado")

    await session.delete(gasto)
    await session.commit()
