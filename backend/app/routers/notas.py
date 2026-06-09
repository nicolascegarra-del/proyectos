"""Router global de notas: listado de todas las notas del workspace con filtros."""
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.core.dependencies import get_current_user, get_workspace_member
from app.database import get_session
from app.models import NotaProyecto, NotaTag, Proyecto, User
from app.schemas import NotaOut
from app.services.notas import get_tags_for_notas, to_out

router = APIRouter(
    prefix="/workspaces/{workspace_id}/notas",
    tags=["notas"],
)


@router.get("", response_model=list[NotaOut])
async def list_notas_workspace(
    workspace_id: uuid.UUID,
    proyecto_id: Optional[uuid.UUID] = Query(None, description="Filtrar por proyecto"),
    tag_id: Optional[uuid.UUID] = Query(None, description="Filtrar por etiqueta"),
    orden: str = Query("desc", pattern="^(asc|desc)$", description="Orden por fecha de creación"),
    session: AsyncSession = Depends(get_session),
    _user: User = Depends(get_current_user),
    _member=Depends(get_workspace_member),
):
    """Lista todas las notas de los proyectos del workspace, con filtros y orden."""
    # outer join con User: una nota nunca debe desaparecer del listado por tener
    # un autor huérfano (p. ej. usuario eliminado en datos antiguos). to_out
    # admite autor=None.
    query = (
        select(NotaProyecto, User, Proyecto.nombre)
        .join(User, User.id == NotaProyecto.user_id, isouter=True)
        .join(Proyecto, Proyecto.id == NotaProyecto.proyecto_id)
        .where(Proyecto.workspace_id == workspace_id)
    )
    if proyecto_id is not None:
        query = query.where(NotaProyecto.proyecto_id == proyecto_id)
    if tag_id is not None:
        query = query.join(NotaTag, NotaTag.nota_id == NotaProyecto.id).where(NotaTag.tag_id == tag_id)

    orden_col = NotaProyecto.created_at.asc() if orden == "asc" else NotaProyecto.created_at.desc()
    query = query.order_by(orden_col)

    rows = (await session.exec(query)).all()
    tags_map = await get_tags_for_notas([nota.id for nota, _, _ in rows], session)
    return [
        to_out(nota, autor, tags_map.get(nota.id, []), proyecto_nombre=proyecto_nombre)
        for nota, autor, proyecto_nombre in rows
    ]
