import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.core.dependencies import get_current_user, get_workspace_member
from app.database import get_session
from app.models import Proyecto, RolWorkspace, Sprint, Tarea, User
from app.schemas import SprintCreate, SprintOut, SprintUpdate

router = APIRouter(
    prefix="/workspaces/{workspace_id}/proyectos/{proyecto_id}/sprints",
    tags=["sprints"],
)

WRITE_ROLES = (RolWorkspace.owner, RolWorkspace.admin, RolWorkspace.member)


async def _get_proyecto(
    workspace_id: uuid.UUID,
    proyecto_id: uuid.UUID,
    session: AsyncSession,
) -> Proyecto:
    result = await session.exec(
        select(Proyecto).where(
            Proyecto.id == proyecto_id,
            Proyecto.workspace_id == workspace_id,
        )
    )
    proyecto = result.first()
    if not proyecto:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")
    return proyecto


@router.get("", response_model=list[SprintOut])
async def list_sprints(
    workspace_id: uuid.UUID,
    proyecto_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _member=Depends(get_workspace_member),
):
    await _get_proyecto(workspace_id, proyecto_id, session)
    result = await session.exec(
        select(Sprint)
        .where(Sprint.proyecto_id == proyecto_id)
        .order_by(Sprint.numero)
    )
    return result.all()


@router.post("", response_model=SprintOut, status_code=status.HTTP_201_CREATED)
async def create_sprint(
    workspace_id: uuid.UUID,
    proyecto_id: uuid.UUID,
    body: SprintCreate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
    member=Depends(get_workspace_member),
):
    if member.rol not in WRITE_ROLES:
        raise HTTPException(status_code=403, detail="Sin permisos")

    proyecto = await _get_proyecto(workspace_id, proyecto_id, session)

    # Save sprint duration on project if this is Sprint 1
    duracion = (body.fecha_fin - body.fecha_inicio).days + 1
    if body.numero == 1 or proyecto.sprint_duracion_dias is None:
        proyecto.sprint_duracion_dias = duracion
        proyecto.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
        session.add(proyecto)

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    sprint = Sprint(
        proyecto_id=proyecto_id,
        numero=body.numero,
        nombre=body.nombre,
        fecha_inicio=body.fecha_inicio,
        fecha_fin=body.fecha_fin,
        created_at=now,
        updated_at=now,
    )
    session.add(sprint)
    await session.commit()
    await session.refresh(sprint)
    return sprint


@router.put("/{sprint_id}", response_model=SprintOut)
async def update_sprint(
    workspace_id: uuid.UUID,
    proyecto_id: uuid.UUID,
    sprint_id: uuid.UUID,
    body: SprintUpdate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
    member=Depends(get_workspace_member),
):
    if member.rol not in WRITE_ROLES:
        raise HTTPException(status_code=403, detail="Sin permisos")

    await _get_proyecto(workspace_id, proyecto_id, session)

    result = await session.exec(
        select(Sprint).where(Sprint.id == sprint_id, Sprint.proyecto_id == proyecto_id)
    )
    sprint = result.first()
    if not sprint:
        raise HTTPException(status_code=404, detail="Sprint no encontrado")

    if body.nombre is not None:
        sprint.nombre = body.nombre
    if body.fecha_inicio is not None:
        sprint.fecha_inicio = body.fecha_inicio
    if body.fecha_fin is not None:
        sprint.fecha_fin = body.fecha_fin
    sprint.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)

    session.add(sprint)
    await session.commit()
    await session.refresh(sprint)
    return sprint


@router.delete("/{sprint_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_sprint(
    workspace_id: uuid.UUID,
    proyecto_id: uuid.UUID,
    sprint_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
    member=Depends(get_workspace_member),
):
    if member.rol not in WRITE_ROLES:
        raise HTTPException(status_code=403, detail="Sin permisos")

    await _get_proyecto(workspace_id, proyecto_id, session)

    result = await session.exec(
        select(Sprint).where(Sprint.id == sprint_id, Sprint.proyecto_id == proyecto_id)
    )
    sprint = result.first()
    if not sprint:
        raise HTTPException(status_code=404, detail="Sprint no encontrado")

    # Unassign tasks from this sprint
    tareas_result = await session.exec(
        select(Tarea).where(Tarea.sprint_id == sprint_id)
    )
    for tarea in tareas_result.all():
        tarea.sprint_id = None
        session.add(tarea)

    await session.delete(sprint)
    await session.commit()
