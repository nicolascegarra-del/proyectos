"""Helpers compartidos para notas de proyecto (listado por proyecto y global)."""
import uuid

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.models import NotaProyecto, NotaTag, Tag, User
from app.schemas import NotaOut, TagOut


async def validate_tags(
    tag_ids: list[uuid.UUID],
    workspace_id: uuid.UUID,
    user_id: uuid.UUID,
    session: AsyncSession,
) -> list[Tag]:
    """Valida que las etiquetas existan y pertenezcan al usuario en el workspace."""
    unique = list(dict.fromkeys(tag_ids or []))
    if not unique:
        return []
    rows = await session.exec(
        select(Tag).where(
            Tag.id.in_(unique),
            Tag.workspace_id == workspace_id,
            Tag.user_id == user_id,
        )
    )
    found = rows.all()
    if len(found) != len(unique):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Una o más etiquetas no existen o no te pertenecen",
        )
    return found


async def get_tags_for_notas(
    nota_ids: list[uuid.UUID], session: AsyncSession
) -> dict[uuid.UUID, list[Tag]]:
    """Carga las etiquetas de varias notas en una sola query (evita N+1)."""
    if not nota_ids:
        return {}
    rows = await session.exec(
        select(NotaTag.nota_id, Tag)
        .join(Tag, Tag.id == NotaTag.tag_id)
        .where(NotaTag.nota_id.in_(nota_ids))
    )
    out: dict[uuid.UUID, list[Tag]] = {}
    for nota_id, tag in rows.all():
        out.setdefault(nota_id, []).append(tag)
    return out


def to_out(
    nota: NotaProyecto,
    autor: User | None,
    tags: list[Tag],
    proyecto_nombre: str | None = None,
) -> NotaOut:
    out = NotaOut.model_validate(nota)
    out.tags = [TagOut.model_validate(t) for t in tags]
    out.proyecto_nombre = proyecto_nombre
    if autor:
        out.autor_nombre = autor.nombre
        out.autor_email = autor.email
        out.autor_avatar_url = autor.avatar_url
    return out
