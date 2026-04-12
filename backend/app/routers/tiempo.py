import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.core.dependencies import get_workspace_member
from app.database import get_session
from app.models import Proyecto, RegistroTiempo, RolWorkspace, Tarea
from app.schemas import RegistroTiempoOut

router = APIRouter(
    prefix="/workspaces/{workspace_id}/proyectos/{proyecto_id}/tareas/{tarea_id}/tiempo",
    tags=["tiempo"],
)

WRITE_ROLES = (RolWorkspace.owner, RolWorkspace.admin, RolWorkspace.member)


async def _get_tarea_or_404(
    workspace_id: uuid.UUID,
    proyecto_id: uuid.UUID,
    tarea_id: uuid.UUID,
    session: AsyncSession,
) -> Tarea:
    result = await session.exec(
        select(Tarea)
        .join(Proyecto, Tarea.proyecto_id == Proyecto.id)
        .where(
            Tarea.id == tarea_id,
            Tarea.proyecto_id == proyecto_id,
            Proyecto.workspace_id == workspace_id,
        )
    )
    tarea = result.first()
    if not tarea:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tarea no encontrada")
    return tarea


@router.get("", response_model=list[RegistroTiempoOut])
async def list_registros(
    workspace_id: uuid.UUID,
    proyecto_id: uuid.UUID,
    tarea_id: uuid.UUID,
    _=Depends(get_workspace_member),
    session: AsyncSession = Depends(get_session),
):
    await _get_tarea_or_404(workspace_id, proyecto_id, tarea_id, session)
    result = await session.exec(
        select(RegistroTiempo)
        .where(RegistroTiempo.tarea_id == tarea_id)
        .order_by(RegistroTiempo.inicio.desc())
    )
    return result.all()


@router.post("/start", response_model=RegistroTiempoOut, status_code=status.HTTP_201_CREATED)
async def start_timer(
    workspace_id: uuid.UUID,
    proyecto_id: uuid.UUID,
    tarea_id: uuid.UUID,
    member=Depends(get_workspace_member),
    session: AsyncSession = Depends(get_session),
):
    if member.rol not in WRITE_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    await _get_tarea_or_404(workspace_id, proyecto_id, tarea_id, session)

    # Error si ya hay una sesión activa
    active_result = await session.exec(
        select(RegistroTiempo).where(
            RegistroTiempo.tarea_id == tarea_id,
            RegistroTiempo.fin == None,  # noqa: E711
        )
    )
    if active_result.first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya hay una sesión activa para esta tarea",
        )

    registro = RegistroTiempo(
        tarea_id=tarea_id,
        inicio=datetime.now(timezone.utc).replace(tzinfo=None),
    )
    session.add(registro)
    await session.commit()
    await session.refresh(registro)
    return registro


@router.post("/{registro_id}/stop")
async def stop_timer(
    workspace_id: uuid.UUID,
    proyecto_id: uuid.UUID,
    tarea_id: uuid.UUID,
    registro_id: uuid.UUID,
    member=Depends(get_workspace_member),
    session: AsyncSession = Depends(get_session),
):
    if member.rol not in WRITE_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    tarea = await _get_tarea_or_404(workspace_id, proyecto_id, tarea_id, session)

    result = await session.exec(
        select(RegistroTiempo).where(
            RegistroTiempo.id == registro_id,
            RegistroTiempo.tarea_id == tarea_id,
        )
    )
    registro = result.first()
    if not registro:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro no encontrado")
    if registro.fin is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="La sesión ya fue detenida")

    fin = datetime.now(timezone.utc).replace(tzinfo=None)
    duracion_segundos = (fin - registro.inicio).total_seconds()
    duracion_horas = round(duracion_segundos / 3600, 4)

    registro.fin = fin
    registro.duracion_horas = duracion_horas
    tarea.horas = round(tarea.horas + duracion_horas, 4)
    tarea.updated_at = fin

    session.add(registro)
    session.add(tarea)
    await session.commit()
    await session.refresh(registro)
    await session.refresh(tarea)

    return {"registro": RegistroTiempoOut.model_validate(registro), "tarea_horas": tarea.horas}


@router.delete("/{registro_id}", status_code=status.HTTP_200_OK)
async def delete_registro(
    workspace_id: uuid.UUID,
    proyecto_id: uuid.UUID,
    tarea_id: uuid.UUID,
    registro_id: uuid.UUID,
    member=Depends(get_workspace_member),
    session: AsyncSession = Depends(get_session),
):
    if member.rol not in WRITE_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    tarea = await _get_tarea_or_404(workspace_id, proyecto_id, tarea_id, session)

    result = await session.exec(
        select(RegistroTiempo).where(
            RegistroTiempo.id == registro_id,
            RegistroTiempo.tarea_id == tarea_id,
        )
    )
    registro = result.first()
    if not registro:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro no encontrado")

    # Si la sesión ya está cerrada, restar las horas al total de la tarea
    if registro.duracion_horas is not None:
        tarea.horas = max(0.0, round(tarea.horas - registro.duracion_horas, 4))
        tarea.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
        session.add(tarea)

    await session.delete(registro)
    await session.commit()
    await session.refresh(tarea)

    return {"tarea_horas": tarea.horas}
