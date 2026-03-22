import uuid
from enum import Enum

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func
from sqlmodel import select

from app.models import (
    Articulo,
    Cliente,
    Gasto,
    Plan,
    Presupuesto,
    PresupuestoLinea,
    Proyecto,
    Tarea,
    User,
    Workspace,
    WorkspaceMember,
)


class ResourceType(str, Enum):
    workspace = "workspace"
    proyecto = "proyecto"
    tarea = "tarea"
    linea_bitacora = "linea_bitacora"
    miembro = "miembro"
    gasto = "gasto"
    presupuesto = "presupuesto"


async def get_user_plan(user: User, session: AsyncSession) -> Plan | None:
    if not user.plan_id:
        return None
    result = await session.exec(select(Plan).where(Plan.id == user.plan_id))
    return result.first()


async def check_limit(
    session: AsyncSession,
    user: User,
    resource_type: ResourceType,
    workspace_id: uuid.UUID | None = None,
    proyecto_id: uuid.UUID | None = None,
) -> None:
    plan = await get_user_plan(user, session)
    if not plan:
        return

    if resource_type == ResourceType.workspace:
        result = await session.exec(
            select(func.count(WorkspaceMember.id)).where(
                WorkspaceMember.user_id == user.id
            )
        )
        count = result.one()
        limit = plan.max_workspaces
        label = "workspaces"

    elif resource_type == ResourceType.proyecto and workspace_id:
        result = await session.exec(
            select(func.count(Proyecto.id)).where(
                Proyecto.workspace_id == workspace_id
            )
        )
        count = result.one()
        limit = plan.max_proyectos_por_workspace
        label = "proyectos en este workspace"

    elif resource_type == ResourceType.tarea and proyecto_id:
        result = await session.exec(
            select(func.count(Tarea.id)).where(Tarea.proyecto_id == proyecto_id)
        )
        count = result.one()
        limit = plan.max_tareas_por_proyecto
        label = "tareas en este proyecto"

    elif resource_type == ResourceType.miembro and workspace_id:
        result = await session.exec(
            select(func.count(WorkspaceMember.id)).where(
                WorkspaceMember.workspace_id == workspace_id
            )
        )
        count = result.one()
        limit = plan.max_miembros_por_workspace
        label = "miembros en este workspace"

    elif resource_type == ResourceType.gasto and proyecto_id:
        result = await session.exec(
            select(func.count(Gasto.id)).where(Gasto.proyecto_id == proyecto_id)
        )
        count = result.one()
        limit = plan.max_gastos_por_proyecto
        label = "gastos en este proyecto"

    elif resource_type == ResourceType.presupuesto and workspace_id:
        result = await session.exec(
            select(func.count(Presupuesto.id)).where(
                Presupuesto.workspace_id == workspace_id
            )
        )
        count = result.one()
        limit = plan.max_presupuestos_por_workspace
        label = "presupuestos en este workspace"

    else:
        return

    if limit != -1 and count >= limit:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail={
                "message": f"Has alcanzado el límite de {limit} {label} en tu plan '{plan.nombre}'. Actualiza tu plan para continuar.",
                "limit": limit,
                "current": count,
                "resource": resource_type.value,
                "plan": plan.nombre,
            },
        )
