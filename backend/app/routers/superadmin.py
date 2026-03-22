import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.core.dependencies import get_current_superadmin
from app.database import get_session
from app.models import Plan, User, Workspace, WorkspaceMember
from app.schemas import (
    AssignPlanRequest,
    PlanCreate,
    PlanOut,
    PlanUpdate,
    SuperadminMetrics,
    UserOut,
)

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
    plans = plans_result.all()

    users_by_plan = []
    for plan in plans:
        count_result = await session.exec(
            select(func.count(User.id)).where(User.plan_id == plan.id)
        )
        count = count_result.one()
        users_by_plan.append({"plan": plan.nombre, "count": count, "precio": plan.precio})

    return SuperadminMetrics(
        total_users=total_users,
        active_users=active_users,
        total_workspaces=total_workspaces,
        users_by_plan=users_by_plan,
    )
