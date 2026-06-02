import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.core.dependencies import get_current_user, get_workspace_member
from app.database import get_session
from app.models import (
    Proyecto,
    ProyectoMiembro,
    RolWorkspace,
    User,
    WorkspaceMember,
)
from app.schemas import (
    ProyectoMiembroCreate,
    ProyectoMiembroOut,
    ProyectoMiembroUpdate,
    UserPublicOut,
)

router = APIRouter(
    prefix="/workspaces/{workspace_id}/proyectos/{proyecto_id}/miembros",
    tags=["proyecto-miembros"],
)

WRITE_ROLES = (RolWorkspace.owner, RolWorkspace.admin, RolWorkspace.member)
ADMIN_ROLES = (RolWorkspace.owner, RolWorkspace.admin)


async def _get_proyecto_or_404(
    workspace_id: uuid.UUID,
    proyecto_id: uuid.UUID,
    session: AsyncSession,
) -> Proyecto:
    result = await session.exec(
        select(Proyecto).where(Proyecto.id == proyecto_id, Proyecto.workspace_id == workspace_id)
    )
    proyecto = result.first()
    if not proyecto:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proyecto no encontrado")
    return proyecto


def _to_out(miembro: ProyectoMiembro, user: User | None) -> ProyectoMiembroOut:
    out = ProyectoMiembroOut.model_validate(miembro)
    if user:
        out.user = UserPublicOut.model_validate(user)
    return out


@router.get("", response_model=list[ProyectoMiembroOut])
async def list_miembros(
    workspace_id: uuid.UUID,
    proyecto_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    _user: User = Depends(get_current_user),
    _member=Depends(get_workspace_member),
):
    await _get_proyecto_or_404(workspace_id, proyecto_id, session)
    result = await session.exec(
        select(ProyectoMiembro, User)
        .join(User, User.id == ProyectoMiembro.user_id)
        .where(ProyectoMiembro.proyecto_id == proyecto_id)
        .order_by(ProyectoMiembro.created_at)
    )
    return [_to_out(m, u) for m, u in result.all()]


@router.post("", response_model=ProyectoMiembroOut, status_code=status.HTTP_201_CREATED)
async def add_miembro(
    workspace_id: uuid.UUID,
    proyecto_id: uuid.UUID,
    data: ProyectoMiembroCreate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
    member=Depends(get_workspace_member),
):
    if member.rol not in ADMIN_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Solo owner/admin del workspace")
    await _get_proyecto_or_404(workspace_id, proyecto_id, session)

    # El user debe ser miembro del workspace
    ws_member_result = await session.exec(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == data.user_id,
        )
    )
    if not ws_member_result.first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El usuario debe pertenecer al workspace antes de añadirlo al proyecto",
        )

    # Duplicado
    existing_result = await session.exec(
        select(ProyectoMiembro).where(
            ProyectoMiembro.proyecto_id == proyecto_id,
            ProyectoMiembro.user_id == data.user_id,
        )
    )
    if existing_result.first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="El usuario ya pertenece al equipo del proyecto",
        )

    miembro = ProyectoMiembro(
        proyecto_id=proyecto_id,
        user_id=data.user_id,
        horas_semana=data.horas_semana,
    )
    session.add(miembro)
    await session.commit()
    await session.refresh(miembro)

    user_result = await session.exec(select(User).where(User.id == data.user_id))
    user = user_result.first()
    return _to_out(miembro, user)


@router.put("/{miembro_id}", response_model=ProyectoMiembroOut)
async def update_miembro(
    workspace_id: uuid.UUID,
    proyecto_id: uuid.UUID,
    miembro_id: uuid.UUID,
    data: ProyectoMiembroUpdate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
    member=Depends(get_workspace_member),
):
    if member.rol not in ADMIN_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Solo owner/admin del workspace")
    await _get_proyecto_or_404(workspace_id, proyecto_id, session)

    result = await session.exec(
        select(ProyectoMiembro).where(
            ProyectoMiembro.id == miembro_id,
            ProyectoMiembro.proyecto_id == proyecto_id,
        )
    )
    miembro = result.first()
    if not miembro:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Miembro no encontrado")

    payload = data.model_dump(exclude_unset=True)
    if "horas_semana" in payload and payload["horas_semana"] is not None:
        miembro.horas_semana = payload["horas_semana"]
    miembro.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    session.add(miembro)
    await session.commit()
    await session.refresh(miembro)

    user_result = await session.exec(select(User).where(User.id == miembro.user_id))
    return _to_out(miembro, user_result.first())


@router.delete("/{miembro_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_miembro(
    workspace_id: uuid.UUID,
    proyecto_id: uuid.UUID,
    miembro_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
    member=Depends(get_workspace_member),
):
    if member.rol not in ADMIN_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Solo owner/admin del workspace")
    await _get_proyecto_or_404(workspace_id, proyecto_id, session)

    result = await session.exec(
        select(ProyectoMiembro).where(
            ProyectoMiembro.id == miembro_id,
            ProyectoMiembro.proyecto_id == proyecto_id,
        )
    )
    miembro = result.first()
    if not miembro:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Miembro no encontrado")

    await session.delete(miembro)
    await session.commit()
