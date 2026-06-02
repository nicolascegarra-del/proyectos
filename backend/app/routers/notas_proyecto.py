import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.core.dependencies import get_current_user, get_workspace_member
from app.database import get_session
from app.models import NotaProyecto, Proyecto, RolWorkspace, User
from app.schemas import NotaCreate, NotaOut

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


def _to_out(nota: NotaProyecto, autor: User | None) -> NotaOut:
    out = NotaOut.model_validate(nota)
    if autor:
        out.autor_nombre = autor.nombre
        out.autor_email = autor.email
        out.autor_avatar_url = autor.avatar_url
    return out


@router.get("", response_model=list[NotaOut])
async def list_notas(
    workspace_id: uuid.UUID,
    proyecto_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    _user: User = Depends(get_current_user),
    _member=Depends(get_workspace_member),
):
    await _get_proyecto_or_404(workspace_id, proyecto_id, session)
    result = await session.exec(
        select(NotaProyecto, User)
        .join(User, User.id == NotaProyecto.user_id)
        .where(NotaProyecto.proyecto_id == proyecto_id)
        .order_by(NotaProyecto.created_at.desc())
    )
    return [_to_out(nota, autor) for nota, autor in result.all()]


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

    nota = NotaProyecto(
        proyecto_id=proyecto_id,
        user_id=current_user.id,
        texto=data.texto.strip(),
    )
    session.add(nota)
    await session.commit()
    await session.refresh(nota)
    return _to_out(nota, current_user)


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

    await session.delete(nota)
    await session.commit()
