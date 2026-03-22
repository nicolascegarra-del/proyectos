import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.core.dependencies import get_current_user, get_workspace_member
from app.database import get_session
from app.models import (
    Articulo,
    Cliente,
    Gasto,
    Presupuesto,
    PresupuestoLinea,
    Proyecto,
    Tag,
    Tarea,
    User,
)
from app.schemas import SyncChange, SyncConflict, SyncRequest, SyncResponse

router = APIRouter(prefix="/workspaces/{workspace_id}/sync", tags=["sync"])

ENTITY_MAP = {
    "tarea": Tarea,
    "gasto": Gasto,
    "proyecto": Proyecto,
    "cliente": Cliente,
    "presupuesto": Presupuesto,
    "presupuesto_linea": PresupuestoLinea,
    "tag": Tag,
    "articulo": Articulo,
}


async def _belongs_to_workspace(obj: Any, workspace_id: uuid.UUID, session) -> bool:
    """Verifica que un objeto pertenece al workspace autenticado."""
    if hasattr(obj, "workspace_id"):
        return obj.workspace_id == workspace_id
    if hasattr(obj, "proyecto_id"):
        result = await session.exec(
            select(Proyecto).where(Proyecto.id == obj.proyecto_id)
        )
        proyecto = result.first()
        return proyecto is not None and proyecto.workspace_id == workspace_id
    if hasattr(obj, "presupuesto_id"):
        result = await session.exec(
            select(Presupuesto).where(Presupuesto.id == obj.presupuesto_id)
        )
        presupuesto = result.first()
        return presupuesto is not None and presupuesto.workspace_id == workspace_id
    return False


def _model_to_dict(obj: Any) -> dict:
    result = {}
    for col in obj.__table__.columns:
        val = getattr(obj, col.name)
        if isinstance(val, (uuid.UUID, datetime)):
            val = str(val)
        elif hasattr(val, "isoformat"):
            val = val.isoformat()
        result[col.name] = val
    return result


@router.post("", response_model=SyncResponse)
async def sync(
    workspace_id: uuid.UUID,
    data: SyncRequest,
    current_user: User = Depends(get_current_user),
    _member=Depends(get_workspace_member),
    session: AsyncSession = Depends(get_session),
):
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    applied: list[uuid.UUID] = []
    conflicts: list[SyncConflict] = []

    for change in data.changes:
        model_class = ENTITY_MAP.get(change.entity)
        if not model_class:
            continue

        result = await session.exec(
            select(model_class).where(model_class.id == change.id)
        )
        server_obj = result.first()

        # Verificar ownership: el objeto debe pertenecer al workspace autenticado
        if server_obj is not None:
            if not await _belongs_to_workspace(server_obj, workspace_id, session):
                continue

        if change.action == "delete":
            if server_obj:
                is_locked = getattr(server_obj, "is_locked", False)
                if is_locked:
                    continue
                await session.delete(server_obj)
                applied.append(change.id)
            continue

        if server_obj and hasattr(server_obj, "updated_at"):
            server_updated = server_obj.updated_at
            if server_updated.tzinfo is None:
                server_updated = server_updated.replace(tzinfo=timezone.utc)
            client_updated = change.client_updated_at
            if client_updated.tzinfo is None:
                client_updated = client_updated.replace(tzinfo=timezone.utc)

            if server_updated > client_updated:
                conflicts.append(
                    SyncConflict(
                        id=change.id,
                        entity=change.entity,
                        client_data=change.data,
                        server_data=_model_to_dict(server_obj),
                        server_updated_at=server_updated,
                    )
                )
                continue

        is_locked = server_obj and getattr(server_obj, "is_locked", False)
        if is_locked:
            continue

        if server_obj:
            for key, value in change.data.items():
                if hasattr(server_obj, key) and key not in ("id", "workspace_id", "created_at"):
                    setattr(server_obj, key, value)
            if hasattr(server_obj, "updated_at"):
                server_obj.updated_at = now
            session.add(server_obj)
        else:
            new_obj = model_class(**{k: v for k, v in change.data.items() if hasattr(model_class, k)})
            new_obj.id = change.id
            if hasattr(new_obj, "updated_at"):
                new_obj.updated_at = now
            session.add(new_obj)

        applied.append(change.id)

    await session.commit()

    server_updates: dict[str, list[dict]] = {}
    for entity_name, model_class in ENTITY_MAP.items():
        if hasattr(model_class, "workspace_id"):
            workspace_field = model_class.workspace_id
            if data.last_sync_at:
                result = await session.exec(
                    select(model_class).where(
                        workspace_field == workspace_id,
                        model_class.updated_at > data.last_sync_at,
                    )
                )
            else:
                result = await session.exec(
                    select(model_class).where(workspace_field == workspace_id)
                )
            server_updates[entity_name] = [_model_to_dict(obj) for obj in result.all()]
        elif hasattr(model_class, "proyecto_id"):
            if data.last_sync_at:
                result = await session.exec(
                    select(model_class).join(Proyecto).where(
                        Proyecto.workspace_id == workspace_id,
                        model_class.updated_at > data.last_sync_at,
                    )
                )
            else:
                result = await session.exec(
                    select(model_class).join(Proyecto).where(
                        Proyecto.workspace_id == workspace_id
                    )
                )
            server_updates[entity_name] = [_model_to_dict(obj) for obj in result.all()]

    return SyncResponse(
        synced_at=now,
        applied=applied,
        conflicts=conflicts,
        server_updates=server_updates,
    )
