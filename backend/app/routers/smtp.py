import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status

logger = logging.getLogger(__name__)
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.core.dependencies import get_current_user
from app.core.security import encrypt_password
from app.database import get_session
from app.models import SMTPConfig, User
from app.schemas import SMTPConfigCreate, SMTPConfigOut, SMTPConfigUpdate

router = APIRouter(prefix="/smtp", tags=["smtp"])


@router.get("", response_model=SMTPConfigOut)
async def get_smtp_config(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    result = await session.exec(
        select(SMTPConfig).where(SMTPConfig.user_id == current_user.id)
    )
    config = result.first()
    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No tienes configuración SMTP. Configúrala en Ajustes.",
        )
    return config


@router.post("", response_model=SMTPConfigOut, status_code=status.HTTP_201_CREATED)
async def create_smtp_config(
    data: SMTPConfigCreate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    existing = await session.exec(
        select(SMTPConfig).where(SMTPConfig.user_id == current_user.id)
    )
    if existing.first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya tienes una configuración SMTP. Usa PUT para actualizarla.",
        )

    config = SMTPConfig(
        user_id=current_user.id,
        host=data.host,
        port=data.port,
        username=data.username,
        password_encrypted=encrypt_password(data.password),
        from_email=data.from_email,
        from_name=data.from_name,
        use_tls=data.use_tls,
        use_ssl=data.use_ssl,
    )
    session.add(config)
    await session.commit()
    await session.refresh(config)
    return config


@router.put("", response_model=SMTPConfigOut)
async def update_smtp_config(
    data: SMTPConfigUpdate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    result = await session.exec(
        select(SMTPConfig).where(SMTPConfig.user_id == current_user.id)
    )
    config = result.first()
    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No tienes configuración SMTP",
        )

    update_data = data.model_dump(exclude_none=True)
    if "password" in update_data:
        config.password_encrypted = encrypt_password(update_data.pop("password"))

    for field, value in update_data.items():
        setattr(config, field, value)
    config.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    session.add(config)
    await session.commit()
    await session.refresh(config)
    return config


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
async def delete_smtp_config(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    result = await session.exec(
        select(SMTPConfig).where(SMTPConfig.user_id == current_user.id)
    )
    config = result.first()
    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="No tienes configuración SMTP"
        )
    await session.delete(config)
    await session.commit()


@router.post("/test", status_code=status.HTTP_204_NO_CONTENT)
async def test_smtp_config(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    from app.services.email import send_email

    result = await session.exec(
        select(SMTPConfig).where(SMTPConfig.user_id == current_user.id)
    )
    config = result.first()
    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="No tienes configuración SMTP"
        )

    try:
        await send_email(
            config,
            config.from_email,
            "Test SMTP - Klyp",
            "Si recibes este correo, tu configuración SMTP es correcta.",
        )
    except Exception as e:
        logger.error(f"SMTP test error for user {current_user.id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Error al enviar el email de prueba. Verifica la configuración SMTP.",
        )
