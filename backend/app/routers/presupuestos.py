import uuid
from datetime import datetime, timezone, date

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.core.dependencies import get_current_user, get_workspace_member
from app.database import get_session
from app.models import (
    Configuracion,
    EstadoPresupuesto,
    Presupuesto,
    PresupuestoLinea,
    RolWorkspace,
    SMTPConfig,
    User,
    Cliente,
    Proyecto,
)
from app.schemas import (
    PresupuestoCreate,
    PresupuestoLineaCreate,
    PresupuestoLineaOut,
    PresupuestoLineaUpdate,
    PresupuestoOut,
    PresupuestoUpdate,
    SendEmailRequest,
)
from app.services.email import render_template, send_email
from app.services.limits import ResourceType, check_limit
from app.services.webhook import trigger_webhook_background

router = APIRouter(prefix="/workspaces/{workspace_id}/presupuestos", tags=["presupuestos"])

WRITE_ROLES = (RolWorkspace.owner, RolWorkspace.admin, RolWorkspace.member)


async def _next_numero(workspace_id: uuid.UUID, session: AsyncSession) -> str:
    year = datetime.now().year
    result = await session.exec(
        select(func.count(Presupuesto.id)).where(
            Presupuesto.workspace_id == workspace_id
        )
    )
    count = result.one() or 0
    return f"PRE-{year}-{count + 1:04d}"


@router.get("", response_model=list[PresupuestoOut])
async def list_presupuestos(
    workspace_id: uuid.UUID,
    limit: int = Query(200, ge=1, le=500),
    offset: int = Query(0, ge=0),
    _=Depends(get_workspace_member),
    session: AsyncSession = Depends(get_session),
):
    result = await session.exec(
        select(Presupuesto).where(Presupuesto.workspace_id == workspace_id).offset(offset).limit(limit)
    )
    return result.all()


@router.post("", response_model=PresupuestoOut, status_code=status.HTTP_201_CREATED)
async def create_presupuesto(
    workspace_id: uuid.UUID,
    data: PresupuestoCreate,
    current_user: User = Depends(get_current_user),
    member=Depends(get_workspace_member),
    session: AsyncSession = Depends(get_session),
):
    if member.rol not in WRITE_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    await check_limit(
        session, current_user, ResourceType.presupuesto, workspace_id=workspace_id
    )

    numero = await _next_numero(workspace_id, session)
    presupuesto = Presupuesto(
        workspace_id=workspace_id,
        numero=numero,
        **data.model_dump(),
    )
    session.add(presupuesto)
    await session.commit()
    await session.refresh(presupuesto)
    return presupuesto


@router.get("/{presupuesto_id}", response_model=PresupuestoOut)
async def get_presupuesto(
    workspace_id: uuid.UUID,
    presupuesto_id: uuid.UUID,
    _=Depends(get_workspace_member),
    session: AsyncSession = Depends(get_session),
):
    result = await session.exec(
        select(Presupuesto).where(
            Presupuesto.id == presupuesto_id,
            Presupuesto.workspace_id == workspace_id,
        )
    )
    p = result.first()
    if not p:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Presupuesto no encontrado")
    return p


@router.put("/{presupuesto_id}", response_model=PresupuestoOut)
async def update_presupuesto(
    workspace_id: uuid.UUID,
    presupuesto_id: uuid.UUID,
    data: PresupuestoUpdate,
    background_tasks: BackgroundTasks,
    member=Depends(get_workspace_member),
    session: AsyncSession = Depends(get_session),
):
    if member.rol not in WRITE_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    result = await session.exec(
        select(Presupuesto).where(
            Presupuesto.id == presupuesto_id,
            Presupuesto.workspace_id == workspace_id,
        )
    )
    p = result.first()
    if not p:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Presupuesto no encontrado")

    if p.is_locked:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="El presupuesto está bloqueado y no se puede editar",
        )

    prev_estado = p.estado
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(p, field, value)
    p.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    session.add(p)
    await session.commit()
    await session.refresh(p)

    if data.estado == EstadoPresupuesto.aceptado and prev_estado != EstadoPresupuesto.aceptado:
        config_result = await session.exec(
            select(Configuracion).where(Configuracion.workspace_id == workspace_id)
        )
        config = config_result.first()
        if config and config.webhook_url:
            trigger_webhook_background(
                config.webhook_url,
                "presupuesto.aceptado",
                workspace_id,
                p.id,
                {"presupuesto_id": str(p.id), "numero": p.numero, "total": p.total},
            )

    return p


@router.delete("/{presupuesto_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_presupuesto(
    workspace_id: uuid.UUID,
    presupuesto_id: uuid.UUID,
    member=Depends(get_workspace_member),
    session: AsyncSession = Depends(get_session),
):
    if member.rol not in (RolWorkspace.owner, RolWorkspace.admin):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    result = await session.exec(
        select(Presupuesto).where(
            Presupuesto.id == presupuesto_id,
            Presupuesto.workspace_id == workspace_id,
        )
    )
    p = result.first()
    if not p:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Presupuesto no encontrado")

    if p.is_locked:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="El presupuesto está bloqueado y no se puede eliminar",
        )

    await session.delete(p)
    await session.commit()


# ── Líneas ────────────────────────────────────────────────────────────────────

@router.get("/{presupuesto_id}/lineas", response_model=list[PresupuestoLineaOut])
async def list_lineas(
    workspace_id: uuid.UUID,
    presupuesto_id: uuid.UUID,
    limit: int = Query(200, ge=1, le=500),
    offset: int = Query(0, ge=0),
    _=Depends(get_workspace_member),
    session: AsyncSession = Depends(get_session),
):
    result = await session.exec(
        select(PresupuestoLinea)
        .where(PresupuestoLinea.presupuesto_id == presupuesto_id)
        .offset(offset)
        .limit(limit)
    )
    return result.all()


@router.post(
    "/{presupuesto_id}/lineas",
    response_model=PresupuestoLineaOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_linea(
    workspace_id: uuid.UUID,
    presupuesto_id: uuid.UUID,
    data: PresupuestoLineaCreate,
    member=Depends(get_workspace_member),
    session: AsyncSession = Depends(get_session),
):
    if member.rol not in WRITE_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    p_result = await session.exec(
        select(Presupuesto).where(
            Presupuesto.id == presupuesto_id,
            Presupuesto.workspace_id == workspace_id,
        )
    )
    p = p_result.first()
    if not p:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Presupuesto no encontrado")

    if p.is_locked:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="El presupuesto está bloqueado",
        )

    subtotal = data.cantidad * data.precio_unitario
    linea = PresupuestoLinea(
        presupuesto_id=presupuesto_id,
        subtotal=subtotal,
        **data.model_dump(),
    )
    session.add(linea)

    await _recalculate_total(presupuesto_id, session)
    await session.commit()
    await session.refresh(linea)
    return linea


@router.put("/{presupuesto_id}/lineas/{linea_id}", response_model=PresupuestoLineaOut)
async def update_linea(
    workspace_id: uuid.UUID,
    presupuesto_id: uuid.UUID,
    linea_id: uuid.UUID,
    data: PresupuestoLineaUpdate,
    member=Depends(get_workspace_member),
    session: AsyncSession = Depends(get_session),
):
    if member.rol not in WRITE_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    p_result = await session.exec(
        select(Presupuesto).where(
            Presupuesto.id == presupuesto_id,
            Presupuesto.workspace_id == workspace_id,
        )
    )
    p = p_result.first()
    if not p:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Presupuesto no encontrado")

    if p.is_locked:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="El presupuesto está bloqueado",
        )

    result = await session.exec(
        select(PresupuestoLinea).where(
            PresupuestoLinea.id == linea_id,
            PresupuestoLinea.presupuesto_id == presupuesto_id,
        )
    )
    linea = result.first()
    if not linea:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Línea no encontrada")

    for field, value in data.model_dump(exclude_none=True).items():
        setattr(linea, field, value)

    linea.subtotal = linea.cantidad * linea.precio_unitario
    linea.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    session.add(linea)

    await _recalculate_total(presupuesto_id, session)
    await session.commit()
    await session.refresh(linea)
    return linea


@router.delete("/{presupuesto_id}/lineas/{linea_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_linea(
    workspace_id: uuid.UUID,
    presupuesto_id: uuid.UUID,
    linea_id: uuid.UUID,
    member=Depends(get_workspace_member),
    session: AsyncSession = Depends(get_session),
):
    if member.rol not in WRITE_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    p_result = await session.exec(
        select(Presupuesto).where(
            Presupuesto.id == presupuesto_id,
            Presupuesto.workspace_id == workspace_id,
        )
    )
    p = p_result.first()
    if not p:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Presupuesto no encontrado")

    if p.is_locked:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="El presupuesto está bloqueado",
        )

    result = await session.exec(
        select(PresupuestoLinea).where(
            PresupuestoLinea.id == linea_id,
            PresupuestoLinea.presupuesto_id == presupuesto_id,
        )
    )
    linea = result.first()
    if not linea:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Línea no encontrada")

    await session.delete(linea)
    await _recalculate_total(presupuesto_id, session)
    await session.commit()


async def _recalculate_total(presupuesto_id: uuid.UUID, session: AsyncSession) -> None:
    result = await session.exec(
        select(func.sum(PresupuestoLinea.subtotal)).where(
            PresupuestoLinea.presupuesto_id == presupuesto_id
        )
    )
    total = result.one() or 0.0
    p_result = await session.exec(
        select(Presupuesto).where(Presupuesto.id == presupuesto_id)
    )
    p = p_result.first()
    if p:
        p.total = total
        p.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
        session.add(p)


# ── Email ─────────────────────────────────────────────────────────────────────

@router.post("/{presupuesto_id}/send-email", status_code=status.HTTP_204_NO_CONTENT)
async def send_presupuesto_email(
    workspace_id: uuid.UUID,
    presupuesto_id: uuid.UUID,
    data: SendEmailRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    member=Depends(get_workspace_member),
    session: AsyncSession = Depends(get_session),
):
    if member.rol not in WRITE_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    smtp_result = await session.exec(
        select(SMTPConfig).where(SMTPConfig.user_id == current_user.id)
    )
    smtp = smtp_result.first()
    if not smtp:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Configura primero tu SMTP en Configuración",
        )

    p_result = await session.exec(
        select(Presupuesto).where(
            Presupuesto.id == presupuesto_id,
            Presupuesto.workspace_id == workspace_id,
        )
    )
    p = p_result.first()
    if not p:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Presupuesto no encontrado")

    cliente_result = await session.exec(
        select(Cliente).where(Cliente.id == p.cliente_id)
    )
    cliente = cliente_result.first()

    proyecto_nombre = ""
    if p.proyecto_id:
        proy_result = await session.exec(
            select(Proyecto).where(Proyecto.id == p.proyecto_id)
        )
        proy = proy_result.first()
        if proy:
            proyecto_nombre = proy.nombre

    config_result = await session.exec(
        select(Configuracion).where(Configuracion.workspace_id == workspace_id)
    )
    config = config_result.first()

    variables = {
        "cliente": cliente.nombre if cliente else "",
        "proyecto": proyecto_nombre,
        "total": f"{p.total:.2f}",
    }

    subject = render_template(
        data.custom_subject or (config.email_template_subject if config else "Presupuesto {{proyecto}}"),
        variables,
    )
    body = render_template(
        data.custom_body or (config.email_template_body if config else "Total: {{total}} €"),
        variables,
    )

    background_tasks.add_task(send_email, smtp, data.to_email, subject, body)
