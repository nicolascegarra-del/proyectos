import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.core.dependencies import get_current_user, get_workspace_member
from app.database import get_session
from app.models import (
    Configuracion,
    Plan,
    RolWorkspace,
    SMTPConfig,
    User,
    Workspace,
    WorkspaceInvite,
    WorkspaceMember,
)
from app.schemas import (
    CreateAndAddUserOut,
    CreateAndAddUserRequest,
    DirectAddMemberRequest,
    InviteRequest,
    UpdateMemberRolRequest,
    UserOut,
    UserPublicOut,
    WorkspaceCreate,
    WorkspaceMemberOut,
    WorkspaceOut,
    WorkspaceUpdate,
)
from app.services.email import send_workspace_invite_email
from app.services.limits import ResourceType, check_limit

router = APIRouter(prefix="/workspaces", tags=["workspaces"])


@router.get("", response_model=list[WorkspaceOut])
async def list_workspaces(
    limit: int = Query(200, ge=1, le=500),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    result = await session.exec(
        select(Workspace)
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
        .where(WorkspaceMember.user_id == current_user.id)
        .offset(offset)
        .limit(limit)
    )
    return result.all()


@router.post("", response_model=WorkspaceOut, status_code=status.HTTP_201_CREATED)
async def create_workspace(
    data: WorkspaceCreate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    await check_limit(session, current_user, ResourceType.workspace)

    workspace = Workspace(nombre=data.nombre, owner_id=current_user.id)
    session.add(workspace)
    await session.flush()

    member = WorkspaceMember(
        workspace_id=workspace.id,
        user_id=current_user.id,
        rol=RolWorkspace.owner,
    )
    session.add(member)

    config = Configuracion(workspace_id=workspace.id)
    session.add(config)

    await session.commit()
    await session.refresh(workspace)
    return workspace


@router.get("/{workspace_id}", response_model=WorkspaceOut)
async def get_workspace(
    workspace_id: uuid.UUID,
    _=Depends(get_workspace_member),
    session: AsyncSession = Depends(get_session),
):
    result = await session.exec(select(Workspace).where(Workspace.id == workspace_id))
    workspace = result.first()
    if not workspace:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace no encontrado")
    return workspace


@router.put("/{workspace_id}", response_model=WorkspaceOut)
async def update_workspace(
    workspace_id: uuid.UUID,
    data: WorkspaceUpdate,
    member=Depends(get_workspace_member),
    session: AsyncSession = Depends(get_session),
):
    if member.rol not in (RolWorkspace.owner, RolWorkspace.admin):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    result = await session.exec(select(Workspace).where(Workspace.id == workspace_id))
    workspace = result.first()
    if not workspace:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace no encontrado")

    workspace.nombre = data.nombre
    workspace.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    session.add(workspace)
    await session.commit()
    await session.refresh(workspace)
    return workspace


@router.delete("/{workspace_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workspace(
    workspace_id: uuid.UUID,
    member=Depends(get_workspace_member),
    session: AsyncSession = Depends(get_session),
):
    if member.rol != RolWorkspace.owner:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Solo el owner puede borrar el workspace")

    result = await session.exec(select(Workspace).where(Workspace.id == workspace_id))
    workspace = result.first()
    if not workspace:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace no encontrado")

    await session.delete(workspace)
    await session.commit()


# ── Members ───────────────────────────────────────────────────────────────────

@router.get("/{workspace_id}/members", response_model=list[WorkspaceMemberOut])
async def list_members(
    workspace_id: uuid.UUID,
    _=Depends(get_workspace_member),
    session: AsyncSession = Depends(get_session),
):
    result = await session.exec(
        select(WorkspaceMember, User)
        .join(User, WorkspaceMember.user_id == User.id)
        .where(WorkspaceMember.workspace_id == workspace_id)
    )
    rows = result.all()
    return [
        WorkspaceMemberOut(
            id=m.id,
            workspace_id=m.workspace_id,
            user_id=m.user_id,
            rol=m.rol,
            created_at=m.created_at,
            user=UserPublicOut.model_validate(user) if user else None,
        )
        for m, user in rows
    ]


@router.put("/{workspace_id}/members/{user_id}", response_model=WorkspaceMemberOut)
async def update_member_rol(
    workspace_id: uuid.UUID,
    user_id: uuid.UUID,
    data: UpdateMemberRolRequest,
    member=Depends(get_workspace_member),
    session: AsyncSession = Depends(get_session),
):
    if member.rol not in (RolWorkspace.owner, RolWorkspace.admin):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    result = await session.exec(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == user_id,
        )
    )
    target = result.first()
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Miembro no encontrado")

    if target.rol == RolWorkspace.owner and member.rol != RolWorkspace.owner:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No puedes cambiar el rol del owner")

    target.rol = data.rol
    session.add(target)
    await session.commit()
    await session.refresh(target)
    return WorkspaceMemberOut(
        id=target.id,
        workspace_id=target.workspace_id,
        user_id=target.user_id,
        rol=target.rol,
        created_at=target.created_at,
    )


@router.delete("/{workspace_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    workspace_id: uuid.UUID,
    user_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    member=Depends(get_workspace_member),
    session: AsyncSession = Depends(get_session),
):
    if member.rol not in (RolWorkspace.owner, RolWorkspace.admin) and current_user.id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    result = await session.exec(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == user_id,
        )
    )
    target = result.first()
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Miembro no encontrado")

    if target.rol == RolWorkspace.owner:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No puedes eliminar al owner")

    await session.delete(target)
    await session.commit()


# ── Admin direct management ───────────────────────────────────────────────────

@router.post("/{workspace_id}/members/direct-add", response_model=WorkspaceMemberOut, status_code=status.HTTP_201_CREATED)
async def direct_add_member(
    workspace_id: uuid.UUID,
    data: DirectAddMemberRequest,
    current_user: User = Depends(get_current_user),
    member=Depends(get_workspace_member),
    session: AsyncSession = Depends(get_session),
):
    if member.rol not in (RolWorkspace.owner, RolWorkspace.admin):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    await check_limit(session, current_user, ResourceType.miembro, workspace_id=workspace_id)

    user_result = await session.exec(select(User).where(User.email == data.email))
    target_user = user_result.first()
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No existe ningún usuario con ese email")

    already = await session.exec(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == target_user.id,
        )
    )
    if already.first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="El usuario ya es miembro de este workspace")

    new_member = WorkspaceMember(
        workspace_id=workspace_id,
        user_id=target_user.id,
        rol=data.rol,
        invited_by=current_user.id,
    )
    session.add(new_member)
    await session.commit()
    await session.refresh(new_member)
    return WorkspaceMemberOut(
        id=new_member.id,
        workspace_id=new_member.workspace_id,
        user_id=new_member.user_id,
        rol=new_member.rol,
        created_at=new_member.created_at,
        user=UserPublicOut.model_validate(target_user),
    )


@router.post("/{workspace_id}/members/create-user", response_model=CreateAndAddUserOut, status_code=status.HTTP_201_CREATED)
async def create_and_add_user(
    workspace_id: uuid.UUID,
    data: CreateAndAddUserRequest,
    current_user: User = Depends(get_current_user),
    member=Depends(get_workspace_member),
    session: AsyncSession = Depends(get_session),
):
    if member.rol not in (RolWorkspace.owner, RolWorkspace.admin):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    await check_limit(session, current_user, ResourceType.miembro, workspace_id=workspace_id)

    existing = await session.exec(select(User).where(User.email == data.email))
    if existing.first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ya existe un usuario con ese email")

    import string
    from app.core.security import hash_password
    alphabet = string.ascii_letters + string.digits + "!@#$%"
    temp_password = (
        secrets.choice(string.ascii_uppercase)
        + secrets.choice(string.digits)
        + secrets.choice("!@#$%")
        + "".join(secrets.choice(alphabet) for _ in range(9))
    )

    default_plan = await session.exec(
        select(Plan).where(Plan.es_default == True)
    )
    plan = default_plan.first()

    new_user = User(
        email=data.email,
        nombre=data.nombre,
        password_hash=hash_password(temp_password),
        plan_id=plan.id if plan else None,
        is_active=True,
    )
    session.add(new_user)
    await session.flush()

    new_member = WorkspaceMember(
        workspace_id=workspace_id,
        user_id=new_user.id,
        rol=data.rol,
        invited_by=current_user.id,
    )
    session.add(new_member)
    await session.commit()
    await session.refresh(new_user)

    return CreateAndAddUserOut(
        user=UserPublicOut.model_validate(new_user),
        temp_password=temp_password,
    )


@router.put("/{workspace_id}/members/{user_id}/password", response_model=dict)
async def reset_member_password(
    workspace_id: uuid.UUID,
    user_id: uuid.UUID,
    member=Depends(get_workspace_member),
    session: AsyncSession = Depends(get_session),
):
    if member.rol not in (RolWorkspace.owner, RolWorkspace.admin):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    target_member = await session.exec(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == user_id,
        )
    )
    wm = target_member.first()
    if not wm:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Miembro no encontrado")

    if wm.rol == RolWorkspace.owner and member.rol != RolWorkspace.owner:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No puedes cambiar la contraseña del owner")

    user_result = await session.exec(select(User).where(User.id == user_id))
    target_user = user_result.first()
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")

    if target_user.is_superadmin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No puedes cambiar la contraseña de un superadmin")

    import string
    from app.core.security import hash_password
    alphabet = string.ascii_letters + string.digits + "!@#$%"
    new_password = (
        secrets.choice(string.ascii_uppercase)
        + secrets.choice(string.digits)
        + secrets.choice("!@#$%")
        + "".join(secrets.choice(alphabet) for _ in range(9))
    )
    target_user.password_hash = hash_password(new_password)
    session.add(target_user)
    await session.commit()
    return {"new_password": new_password}


# ── Invites ───────────────────────────────────────────────────────────────────

@router.post("/{workspace_id}/invite", status_code=status.HTTP_204_NO_CONTENT)
async def invite_member(
    workspace_id: uuid.UUID,
    data: InviteRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    member=Depends(get_workspace_member),
    session: AsyncSession = Depends(get_session),
):
    if member.rol not in (RolWorkspace.owner, RolWorkspace.admin):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    await check_limit(session, current_user, ResourceType.miembro, workspace_id=workspace_id)

    existing_user = await session.exec(select(User).where(User.email == data.email))
    if existing_user.first():
        already_member = await session.exec(
            select(WorkspaceMember)
            .join(User, User.id == WorkspaceMember.user_id)
            .where(
                WorkspaceMember.workspace_id == workspace_id,
                User.email == data.email,
            )
        )
        if already_member.first():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="El usuario ya es miembro de este workspace",
            )

    token = secrets.token_urlsafe(32)
    invite = WorkspaceInvite(
        workspace_id=workspace_id,
        email=data.email,
        rol=data.rol,
        token=token,
        invited_by=current_user.id,
        expires_at=datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=7),
    )
    session.add(invite)
    await session.commit()

    smtp_result = await session.exec(
        select(SMTPConfig).where(SMTPConfig.user_id == current_user.id)
    )
    smtp = smtp_result.first()
    if smtp:
        ws_result = await session.exec(
            select(Workspace).where(Workspace.id == workspace_id)
        )
        workspace = ws_result.first()
        invite_url = f"{settings.FRONTEND_URL}/invites/{token}"
        background_tasks.add_task(
            send_workspace_invite_email,
            smtp,
            data.email,
            workspace.nombre,
            current_user.nombre,
            invite_url,
            data.rol.value,
        )


@router.post("/invites/{token}/accept", status_code=status.HTTP_204_NO_CONTENT)
async def accept_invite(
    token: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    result = await session.exec(
        select(WorkspaceInvite).where(WorkspaceInvite.token == token)
    )
    invite = result.first()
    if not invite:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invitación no encontrada")

    if invite.accepted:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invitación ya aceptada")

    if current_user.email.lower() != invite.email.lower():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Este token de invitación no es para tu cuenta",
        )

    if invite.expires_at < datetime.now(timezone.utc).replace(tzinfo=None):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invitación expirada")

    already = await session.exec(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == invite.workspace_id,
            WorkspaceMember.user_id == current_user.id,
        )
    )
    if already.first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya eres miembro de este workspace",
        )

    member = WorkspaceMember(
        workspace_id=invite.workspace_id,
        user_id=current_user.id,
        rol=invite.rol,
        invited_by=invite.invited_by,
    )
    invite.accepted = True
    session.add(member)
    session.add(invite)
    await session.commit()


from app.config import settings
