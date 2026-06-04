import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.core.dependencies import get_current_superadmin
from app.core.security import generate_temp_password, hash_password
from app.database import get_session
from app.models import (
    Configuracion,
    Plan,
    Proyecto,
    RolWorkspace,
    Tarea,
    User,
    Workspace,
    WorkspaceMember,
)
from app.schemas import (
    AssignPlanRequest,
    AssignWorkspaceRequest,
    PlanCreate,
    PlanOut,
    PlanUpdate,
    ResetPasswordOut,
    SuperadminCreateUser,
    SuperadminCreateUserOut,
    SuperadminCreateWorkspace,
    SuperadminMetrics,
    SuperadminUpdateUser,
    SuperadminUserWorkspaceOut,
    UserOut,
    WorkspaceAdminOut,
    WorkspaceMemberOut,
    WorkspaceOut,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/superadmin", tags=["superadmin"])


# ── Plans ─────────────────────────────────────────────────────────────────────

@router.get("/plans", response_model=list[PlanOut])
async def list_plans(
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    _=Depends(get_current_superadmin),
    session: AsyncSession = Depends(get_session),
):
    result = await session.exec(select(Plan).offset(offset).limit(limit))
    return result.all()


@router.post("/plans", response_model=PlanOut, status_code=status.HTTP_201_CREATED)
async def create_plan(
    data: PlanCreate,
    _=Depends(get_current_superadmin),
    session: AsyncSession = Depends(get_session),
):
    if data.es_default:
        existing = await session.exec(select(Plan).where(Plan.es_default == True))
        for plan in existing.all():
            plan.es_default = False
            session.add(plan)

    plan = Plan(**data.model_dump())
    session.add(plan)
    await session.commit()
    await session.refresh(plan)
    return plan


@router.put("/plans/{plan_id}", response_model=PlanOut)
async def update_plan(
    plan_id: uuid.UUID,
    data: PlanUpdate,
    _=Depends(get_current_superadmin),
    session: AsyncSession = Depends(get_session),
):
    result = await session.exec(select(Plan).where(Plan.id == plan_id))
    plan = result.first()
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan no encontrado")

    if data.es_default:
        existing = await session.exec(select(Plan).where(Plan.es_default == True, Plan.id != plan_id))
        for p in existing.all():
            p.es_default = False
            session.add(p)

    for field, value in data.model_dump(exclude_none=True).items():
        setattr(plan, field, value)

    session.add(plan)
    await session.commit()
    await session.refresh(plan)
    return plan


@router.delete("/plans/{plan_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_plan(
    plan_id: uuid.UUID,
    _=Depends(get_current_superadmin),
    session: AsyncSession = Depends(get_session),
):
    result = await session.exec(select(Plan).where(Plan.id == plan_id))
    plan = result.first()
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan no encontrado")
    await session.delete(plan)
    await session.commit()


# ── Users ─────────────────────────────────────────────────────────────────────

@router.get("/users", response_model=list[UserOut])
async def list_users(
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    _=Depends(get_current_superadmin),
    session: AsyncSession = Depends(get_session),
):
    result = await session.exec(select(User).offset(offset).limit(limit))
    return result.all()


@router.put("/users/{user_id}/plan", response_model=UserOut)
async def assign_user_plan(
    user_id: uuid.UUID,
    data: AssignPlanRequest,
    _=Depends(get_current_superadmin),
    session: AsyncSession = Depends(get_session),
):
    result = await session.exec(select(User).where(User.id == user_id))
    user = result.first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")

    plan_result = await session.exec(select(Plan).where(Plan.id == data.plan_id))
    if not plan_result.first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan no encontrado")

    user.plan_id = data.plan_id
    user.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


@router.put("/users/{user_id}/toggle-active", response_model=UserOut)
async def toggle_user_active(
    user_id: uuid.UUID,
    _=Depends(get_current_superadmin),
    session: AsyncSession = Depends(get_session),
):
    result = await session.exec(select(User).where(User.id == user_id))
    user = result.first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")

    user.is_active = not user.is_active
    user.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


# ── Metrics ───────────────────────────────────────────────────────────────────

@router.get("/metrics", response_model=SuperadminMetrics)
async def get_metrics(
    _=Depends(get_current_superadmin),
    session: AsyncSession = Depends(get_session),
):
    total_users_result = await session.exec(select(func.count(User.id)))
    total_users = total_users_result.one()

    active_users_result = await session.exec(
        select(func.count(User.id)).where(User.is_active == True)
    )
    active_users = active_users_result.one()

    total_ws_result = await session.exec(select(func.count(Workspace.id)))
    total_workspaces = total_ws_result.one()

    plans_result = await session.exec(select(Plan))
    plans = {p.id: p for p in plans_result.all()}

    counts_result = await session.exec(
        select(User.plan_id, func.count(User.id)).group_by(User.plan_id)
    )
    counts_by_plan_id = {row[0]: row[1] for row in counts_result.all()}

    users_by_plan = [
        {"plan": p.nombre, "count": counts_by_plan_id.get(p.id, 0), "precio": p.precio}
        for p in plans.values()
    ]

    total_proyectos_result = await session.exec(select(func.count(Proyecto.id)))
    total_proyectos = total_proyectos_result.one()

    total_tareas_result = await session.exec(select(func.count(Tarea.id)))
    total_tareas = total_tareas_result.one()

    return SuperadminMetrics(
        total_users=total_users,
        active_users=active_users,
        total_workspaces=total_workspaces,
        total_proyectos=total_proyectos,
        total_tareas=total_tareas,
        users_by_plan=users_by_plan,
    )


# ── User management ───────────────────────────────────────────────────────────

@router.get("/users/{user_id}/workspaces", response_model=list[SuperadminUserWorkspaceOut])
async def get_user_workspaces(
    user_id: uuid.UUID,
    _=Depends(get_current_superadmin),
    session: AsyncSession = Depends(get_session),
):
    result = await session.exec(
        select(WorkspaceMember, Workspace)
        .join(Workspace, WorkspaceMember.workspace_id == Workspace.id)
        .where(WorkspaceMember.user_id == user_id)
    )
    rows = result.all()
    out = []
    for member, workspace in rows:
        proyectos_result = await session.exec(
            select(func.count()).where(Proyecto.workspace_id == workspace.id)
        )
        proyectos_count = proyectos_result.one() or 0
        out.append(SuperadminUserWorkspaceOut(
            workspace_id=workspace.id,
            nombre=workspace.nombre,
            rol=member.rol,
            proyectos_count=proyectos_count,
            created_at=workspace.created_at,
        ))
    return out


@router.put("/users/{user_id}", response_model=UserOut)
async def update_user(
    user_id: uuid.UUID,
    data: SuperadminUpdateUser,
    _=Depends(get_current_superadmin),
    session: AsyncSession = Depends(get_session),
):
    result = await session.exec(select(User).where(User.id == user_id))
    user = result.first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")

    if data.nombre is not None:
        user.nombre = data.nombre
    if data.email is not None:
        existing = await session.exec(select(User).where(User.email == data.email, User.id != user_id))
        if existing.first():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Este email ya está en uso")
        user.email = data.email
    if data.is_active is not None:
        user.is_active = data.is_active

    user.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: uuid.UUID,
    _=Depends(get_current_superadmin),
    session: AsyncSession = Depends(get_session),
):
    result = await session.exec(select(User).where(User.id == user_id))
    user = result.first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")
    if user.is_superadmin:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No se puede eliminar un superadmin")
    await session.delete(user)
    await session.commit()


@router.post("/users/{user_id}/reset-password", response_model=ResetPasswordOut)
async def reset_user_password(
    user_id: uuid.UUID,
    _=Depends(get_current_superadmin),
    session: AsyncSession = Depends(get_session),
):
    import secrets, string
    result = await session.exec(select(User).where(User.id == user_id))
    user = result.first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")

    alphabet = string.ascii_letters + string.digits + "!@#$%"
    new_password = (
        secrets.choice(string.ascii_uppercase) +
        secrets.choice(string.digits) +
        secrets.choice("!@#$%") +
        "".join(secrets.choice(alphabet) for _ in range(9))
    )
    user.password_hash = hash_password(new_password)
    user.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    session.add(user)
    await session.commit()
    logger.info("Password reset by superadmin for user_id=%s", user_id)
    return ResetPasswordOut(new_password=new_password)


# ── Crear usuarios ────────────────────────────────────────────────────────────

@router.post("/users", response_model=SuperadminCreateUserOut, status_code=status.HTTP_201_CREATED)
async def create_user(
    data: SuperadminCreateUser,
    _=Depends(get_current_superadmin),
    session: AsyncSession = Depends(get_session),
):
    existing = await session.exec(select(User).where(User.email == data.email))
    if existing.first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ya existe un usuario con ese email")

    plan_id = data.plan_id
    if plan_id is not None:
        plan_result = await session.exec(select(Plan).where(Plan.id == plan_id))
        if not plan_result.first():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan no encontrado")
    else:
        default_plan = await session.exec(select(Plan).where(Plan.es_default == True))
        p = default_plan.first()
        plan_id = p.id if p else None

    temp_password = generate_temp_password()
    user = User(
        email=data.email,
        nombre=data.nombre,
        password_hash=hash_password(temp_password),
        is_superadmin=data.is_superadmin,
        plan_id=plan_id,
        is_active=True,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    logger.info("User created by superadmin: %s", user.email)
    return SuperadminCreateUserOut(user=UserOut.model_validate(user), temp_password=temp_password)


# ── Workspaces ────────────────────────────────────────────────────────────────

@router.get("/workspaces", response_model=list[WorkspaceAdminOut])
async def list_all_workspaces(
    limit: int = Query(200, ge=1, le=500),
    offset: int = Query(0, ge=0),
    _=Depends(get_current_superadmin),
    session: AsyncSession = Depends(get_session),
):
    result = await session.exec(select(Workspace).offset(offset).limit(limit))
    workspaces = result.all()
    out = []
    for ws in workspaces:
        owner = (await session.exec(select(User).where(User.id == ws.owner_id))).first()
        miembros = (
            await session.exec(
                select(func.count(WorkspaceMember.id)).where(WorkspaceMember.workspace_id == ws.id)
            )
        ).one() or 0
        proyectos = (
            await session.exec(
                select(func.count(Proyecto.id)).where(Proyecto.workspace_id == ws.id)
            )
        ).one() or 0
        out.append(WorkspaceAdminOut(
            id=ws.id,
            nombre=ws.nombre,
            owner_id=ws.owner_id,
            owner_nombre=owner.nombre if owner else None,
            owner_email=owner.email if owner else None,
            miembros_count=miembros,
            proyectos_count=proyectos,
            created_at=ws.created_at,
        ))
    return out


@router.post("/workspaces", response_model=WorkspaceOut, status_code=status.HTTP_201_CREATED)
async def create_workspace_admin(
    data: SuperadminCreateWorkspace,
    _=Depends(get_current_superadmin),
    session: AsyncSession = Depends(get_session),
):
    owner = (await session.exec(select(User).where(User.id == data.owner_id))).first()
    if not owner:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario owner no encontrado")

    workspace = Workspace(nombre=data.nombre, owner_id=data.owner_id)
    session.add(workspace)
    await session.flush()
    session.add(WorkspaceMember(
        workspace_id=workspace.id, user_id=data.owner_id, rol=RolWorkspace.owner,
    ))
    session.add(Configuracion(workspace_id=workspace.id))
    await session.commit()
    await session.refresh(workspace)
    logger.info("Workspace created by superadmin: %s (owner=%s)", workspace.nombre, owner.email)
    return workspace


# ── Asignar workspaces a usuarios ─────────────────────────────────────────────

@router.post(
    "/users/{user_id}/workspaces",
    response_model=WorkspaceMemberOut,
    status_code=status.HTTP_201_CREATED,
)
async def assign_workspace(
    user_id: uuid.UUID,
    data: AssignWorkspaceRequest,
    _=Depends(get_current_superadmin),
    session: AsyncSession = Depends(get_session),
):
    user = (await session.exec(select(User).where(User.id == user_id))).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")
    ws = (await session.exec(select(Workspace).where(Workspace.id == data.workspace_id))).first()
    if not ws:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace no encontrado")

    already = (
        await session.exec(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == data.workspace_id,
                WorkspaceMember.user_id == user_id,
            )
        )
    ).first()
    if already:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="El usuario ya es miembro de este workspace")

    member = WorkspaceMember(workspace_id=data.workspace_id, user_id=user_id, rol=data.rol)
    session.add(member)
    await session.commit()
    await session.refresh(member)
    return WorkspaceMemberOut(
        id=member.id,
        workspace_id=member.workspace_id,
        user_id=member.user_id,
        rol=member.rol,
        created_at=member.created_at,
    )


@router.delete(
    "/users/{user_id}/workspaces/{workspace_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def unassign_workspace(
    user_id: uuid.UUID,
    workspace_id: uuid.UUID,
    _=Depends(get_current_superadmin),
    session: AsyncSession = Depends(get_session),
):
    member = (
        await session.exec(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == workspace_id,
                WorkspaceMember.user_id == user_id,
            )
        )
    ).first()
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="El usuario no es miembro de este workspace")
    if member.rol == RolWorkspace.owner:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No puedes quitar al owner de su propio workspace")

    await session.delete(member)
    await session.commit()
