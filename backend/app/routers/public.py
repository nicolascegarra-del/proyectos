import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.core.limiter import limiter
from app.database import get_session
from app.models import Cliente, Gasto, Proyecto, Tarea
from app.schemas import PublicProyectoOut, PublicTareaOut

router = APIRouter(prefix="/public", tags=["public"])


@router.get("/proyecto/{public_uuid}", response_model=PublicProyectoOut)
@limiter.limit("30/minute")
async def get_public_proyecto(
    request: Request,
    public_uuid: uuid.UUID,
    session: AsyncSession = Depends(get_session),
):
    result = await session.exec(
        select(Proyecto).where(Proyecto.public_uuid == public_uuid)
    )
    proyecto = result.first()
    if not proyecto:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Proyecto no encontrado",
        )
    if not proyecto.is_public:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Este proyecto no es público",
        )

    cliente_result = await session.exec(
        select(Cliente).where(Cliente.id == proyecto.cliente_id)
    )
    cliente = cliente_result.first()

    tareas_result = await session.exec(
        select(Tarea).where(Tarea.proyecto_id == proyecto.id)
    )
    tareas = tareas_result.all()

    gastos_result = await session.exec(
        select(Gasto).where(Gasto.proyecto_id == proyecto.id)
    )
    gastos = gastos_result.all()

    total_horas_result = await session.exec(
        select(func.sum(Tarea.horas)).where(Tarea.proyecto_id == proyecto.id)
    )
    total_horas = total_horas_result.one() or 0.0

    total_gastos_result = await session.exec(
        select(func.sum(Gasto.monto)).where(Gasto.proyecto_id == proyecto.id)
    )
    total_gastos = total_gastos_result.one() or 0.0

    return PublicProyectoOut(
        id=proyecto.id,
        nombre=proyecto.nombre,
        cliente_nombre=cliente.nombre if cliente else "",
        total_horas=total_horas,
        total_gastos=total_gastos,
        tareas=[PublicTareaOut.model_validate(t) for t in tareas],
    )
