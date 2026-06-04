import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from cryptography.fernet import Fernet
from fastapi import HTTPException
from jose import JWTError, jwt
from passlib.context import CryptContext

from app.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(user_id: str, email: str, is_superadmin: bool = False) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    payload = {
        "sub": user_id,
        "email": email,
        "exp": expire,
        "type": "access",
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_refresh_token() -> str:
    return secrets.token_urlsafe(64)


def decode_access_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        if payload.get("type") != "access":
            return None
        return payload
    except JWTError:
        return None


def generate_secure_token() -> str:
    return secrets.token_urlsafe(32)


def generate_temp_password() -> str:
    """Genera una contraseña temporal fuerte (mayúscula + dígito + especial + aleatorio)."""
    import string

    alphabet = string.ascii_letters + string.digits + "!@#$%"
    return (
        secrets.choice(string.ascii_uppercase)
        + secrets.choice(string.digits)
        + secrets.choice("!@#$%")
        + "".join(secrets.choice(alphabet) for _ in range(9))
    )


def _get_fernet() -> Fernet:
    if not settings.FERNET_KEY:
        raise HTTPException(
            status_code=500,
            detail="Cifrado no disponible: FERNET_KEY no está configurada en el servidor.",
        )
    try:
        return Fernet(settings.FERNET_KEY.encode())
    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Cifrado no disponible: FERNET_KEY inválida en el servidor.",
        )


def encrypt_password(plain: str) -> str:
    return _get_fernet().encrypt(plain.encode()).decode()


def decrypt_password(encrypted: str) -> str:
    try:
        return _get_fernet().decrypt(encrypted.encode()).decode()
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Error al descifrar la credencial SMTP.",
        )
