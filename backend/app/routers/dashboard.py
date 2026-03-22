import uuid
from datetime import datetime, date, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.core.dependencies import get_workspace_member
from app.database import get_session
from app.models import Gasto, Proyecto, Tarea
from app.schemas import DashboardOut

router = APIRouter(prefix="/workspaces/{workspace_id}/dashboard", tags=["dashboard"])


@router.get("", response_model=DashboardOut)
async def get_dashboard(
    workspace_id: uuid.UUID,
    _=Depends(get_workspace_member),
    session: AsyncSession = Depends(get_session),
):
    proyectos_result = await session.exec(
        select(Proyecto).where(Proyecto.workspace_id == workspace_id)
    )
    proyectos = proyectos_result.all()
    proyecto_ids = [p.id for p in proyectos]

    if not proyecto_ids:
        return DashboardOut(
            total_horas=0,
            total_ingresos=0,
            total_gastos=0,
            margen_neto=0,
            proyectos_activos=0,
            actividad_heatmap=[],
        )

    horas_result = await session.exec(
        select(func.sum(Tarea.horas)).where(Tarea.proyecto_id.in_(proyecto_ids))
    )
    total_horas = horas_result.one() or 0.0

    gastos_result = await session.exec(
        select(func.sum(Gasto.monto)).where(Gasto.proyecto_id.in_(proyecto_ids))
    )
    total_gastos = gastos_result.one() or 0.0

    tareas_ingresos_result = await session.exec(
        select(Tarea.horas, Proyecto.tarifa_hora)
        .join(Proyecto, Proyecto.id == Tarea.proyecto_id)
        .where(Tarea.proyecto_id.in_(proyecto_ids))
    )
    total_ingresos = sum(h * t for h, t in tareas_ingresos_result.all() if h is not None and t is not None)

    margen_neto = total_ingresos - total_gastos

    today = date.today()
    year_ago = today - timedelta(days=365)
    heatmap_result = await session.exec(
        select(Tarea.fecha, func.sum(Tarea.horas))
        .where(
            Tarea.proyecto_id.in_(proyecto_ids),
            Tarea.fecha >= year_ago,
        )
        .group_by(Tarea.fecha)
    )
    heatmap_raw = heatmap_result.all()
    actividad_heatmap = [
        {"date": str(row[0]), "horas": row[1]} for row in heatmap_raw
    ]

    return DashboardOut(
        total_horas=total_horas,
        total_ingresos=total_ingresos,
        total_gastos=total_gastos,
        margen_neto=margen_neto,
        proyectos_activos=len(proyectos),
        actividad_heatmap=actividad_heatmap,
    )
