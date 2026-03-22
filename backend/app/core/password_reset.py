import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.core.security import generate_secure_token
from app.models import PasswordResetToken


async def create_reset_token(user_id: uuid.UUID, session: AsyncSession) -> str:
    existing = await session.exec(
        select(PasswordResetToken).where(
            PasswordResetToken.user_id == user_id,
            PasswordResetToken.used == False,
        )
    )
    for token in existing.all():
        token.used = True
        session.add(token)

    token_str = generate_secure_token()
    reset_token = PasswordResetToken(
        user_id=user_id,
        token=token_str,
        expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
    )
    session.add(reset_token)
    await session.commit()
    return token_str


async def validate_reset_token(
    token: str, session: AsyncSession
) -> PasswordResetToken | None:
    result = await session.exec(
        select(PasswordResetToken).where(PasswordResetToken.token == token)
    )
    reset_token = result.first()
    if not reset_token:
        return None
    if reset_token.used:
        return None
    if reset_token.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        return None
    return reset_token
