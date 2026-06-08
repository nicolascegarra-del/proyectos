import re
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.core.dependencies import get_current_user, get_workspace_member
from app.database import get_session
from app.models import NotaProyecto, NotaTag, Proyecto, RolWorkspace, User
from app.schemas import NotaCreate, NotaOut, NotaUpdate
from app.services.notas import get_tags_for_notas, to_out, validate_tags
from app.services.sanitize import sanitize_html

router = APIRouter(
    prefix="/workspaces/{workspace_id}/proyectos/{proyecto_id}/notas",
    tags=["notas-proyecto"],
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


def _sanitize_or_400(texto: str) -> str:
    """Sanitiza el HTML y rechaza notas vacías. Devuelve el texto limpio."""
    texto_limpio = sanitize_html(texto)
    plano = re.sub(r"<[^>]+>", "", texto_limpio or "").strip()
    if not texto_limpio or not plano:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="La nota no puede estar vacía")
    return texto_limpio


@router.get("", response_model=list[NotaOut])
async def list_notas(
    workspace_id: uuid.UUID,
    proyecto_id: uuid.UUID,
    tag_id: Optional[uuid.UUID] = Query(None, description="Filtrar notas que tengan esta etiqueta"),
    session: AsyncSession = Depends(get_session),
    _user: User = Depends(get_current_user),
    _member=Depends(get_workspace_member),
):
    await _get_proyecto_or_404(workspace_id, proyecto_id, session)
    query = (
        select(NotaProyecto, User)
        .join(User, User.id == NotaProyecto.user_id)
        .where(NotaProyecto.proyecto_id == proyecto_id)
    )
    if tag_id is not None:
        query = query.join(NotaTag, NotaTag.nota_id == NotaProyecto.id).where(NotaTag.tag_id == tag_id)
    query = query.order_by(NotaProyecto.created_at.desc())

    rows = (await session.exec(query)).all()
    tags_map = await get_tags_for_notas([nota.id for nota, _ in rows], session)
    return [to_out(nota, autor, tags_map.get(nota.id, [])) for nota, autor in rows]


@router.post("", response_model=NotaOut, status_code=status.HTTP_201_CREATED)
async def create_nota(
    workspace_id: uuid.UUID,
    proyecto_id: uuid.UUID,
    data: NotaCreate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
    member=Depends(get_workspace_member),
):
    if member.rol not in WRITE_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permiso")
    await _get_proyecto_or_404(workspace_id, proyecto_id, session)

    tags = await validate_tags(data.tag_ids, workspace_id, current_user.id, session)

    texto_limpio = _sanitize_or_400(data.texto)
    nota = NotaProyecto(
        proyecto_id=proyecto_id,
        user_id=current_user.id,
        texto=texto_limpio,
    )
    session.add(nota)
    await session.flush()
    for tag in tags:
        session.add(NotaTag(nota_id=nota.id, tag_id=tag.id))
    await session.commit()
    await session.refresh(nota)
    return to_out(nota, current_user, tags)


@router.patch("/{nota_id}", response_model=NotaOut)
async def update_nota(
    workspace_id: uuid.UUID,
    proyecto_id: uuid.UUID,
    nota_id: uuid.UUID,
    data: NotaUpdate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
    member=Depends(get_workspace_member),
):
    await _get_proyecto_or_404(workspace_id, proyecto_id, session)
    result = await session.exec(
        select(NotaProyecto, User)
        .join(User, User.id == NotaProyecto.user_id)
        .where(NotaProyecto.id == nota_id, NotaProyecto.proyecto_id == proyecto_id)
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nota no encontrada")
    nota, autor = row

    is_author = nota.user_id == current_user.id
    is_admin = member.rol in ADMIN_ROLES
    if not (is_author or is_admin):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Solo el autor o un admin puede editar")

    # Las etiquetas privadas son del autor de la nota, no de quien edita.
    if data.tag_ids is not None:
        tags = await validate_tags(data.tag_ids, workspace_id, nota.user_id, session)
        await session.execute(delete(NotaTag).where(NotaTag.nota_id == nota_id))
        for tag in tags:
            session.add(NotaTag(nota_id=nota.id, tag_id=tag.id))
    else:
        tags = (await get_tags_for_notas([nota.id], session)).get(nota.id, [])

    if data.texto is not None:
        nota.texto = _sanitize_or_400(data.texto)

    nota.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    session.add(nota)
    await session.commit()
    await session.refresh(nota)
    return to_out(nota, autor, tags)


@router.delete("/{nota_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_nota(
    workspace_id: uuid.UUID,
    proyecto_id: uuid.UUID,
    nota_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
    member=Depends(get_workspace_member),
):
    await _get_proyecto_or_404(workspace_id, proyecto_id, session)
    result = await session.exec(
        select(NotaProyecto).where(
            NotaProyecto.id == nota_id,
            NotaProyecto.proyecto_id == proyecto_id,
        )
    )
    nota = result.first()
    if not nota:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nota no encontrada")

    is_author = nota.user_id == current_user.id
    is_admin = member.rol in ADMIN_ROLES
    if not (is_author or is_admin):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Solo el autor o un admin puede borrar")

    await session.execute(delete(NotaTag).where(NotaTag.nota_id == nota_id))
    await session.delete(nota)
    await session.commit()
