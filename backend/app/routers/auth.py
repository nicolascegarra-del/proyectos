import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Cookie, Depends, HTTPException, Request, Response, status
from sqlmodel import select

from app.core.dependencies import get_current_user
from app.core.limiter import limiter
from app.core.password_reset import create_reset_token, validate_reset_token
from app.core.security import (
    create_access_token,
    create_refresh_token,
    hash_password,
    verify_password,
)
from app.database import get_session
from app.models import Cliente, PasswordResetToken, Plan, Proyecto, RefreshToken, RolWorkspace, SMTPConfig, User, Workspace, WorkspaceMember
from app.schemas import (
    ForgotPasswordRequest,
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    ResetPasswordRequest,
    TokenResponse,
    UserOut,
    UserUpdateRequest,
)
from app.services.email import send_password_reset_email
from app.config import settings
from sqlmodel.ext.asyncio.session import AsyncSession

router = APIRouter(prefix="/auth", tags=["auth"])

_COOKIE_NAME = "klyp_refresh"
_COOKIE_OPTS = dict(
    key=_COOKIE_NAME,
    httponly=True,
    samesite="lax",
    secure=settings.FRONTEND_URL.startswith("https"),
    path="/auth",
    max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
)


def _set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(value=token, **_COOKIE_OPTS)


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(_COOKIE_NAME, path="/auth")


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
async def register(
    request: Request,
    response: Response,
    data: RegisterRequest,
    session: AsyncSession = Depends(get_session),
):
    result = await session.exec(select(User).where(User.email == data.email))
    if result.first():
        # No revelar si el email existe → devolver 201 con tokens falsos sería engañoso;
        # devolvemos 409 solo porque register es un formulario conocido, pero sin detalle del email
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe una cuenta con esos datos",
        )

    default_plan = await session.exec(select(Plan).where(Plan.es_default == True))
    plan = default_plan.first()

    user = User(
        email=data.email,
        password_hash=hash_password(data.password),
        nombre=data.nombre,
        plan_id=plan.id if plan else None,
    )
    session.add(user)
    await session.flush()

    access_token = create_access_token(str(user.id), user.email)
    refresh_token_str = create_refresh_token()
    refresh_token = RefreshToken(
        user_id=user.id,
        token=refresh_token_str,
        expires_at=datetime.now(timezone.utc).replace(tzinfo=None)
        + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    )
    session.add(refresh_token)

    # Auto-setup: workspace, cliente y proyecto de ejemplo
    workspace = Workspace(nombre="Mi Workspace", owner_id=user.id)
    session.add(workspace)
    await session.flush()

    member = WorkspaceMember(workspace_id=workspace.id, user_id=user.id, rol=RolWorkspace.owner)
    session.add(member)

    cliente = Cliente(workspace_id=workspace.id, nombre="Cliente de ejemplo", email=None)
    session.add(cliente)
    await session.flush()

    proyecto = Proyecto(
        workspace_id=workspace.id,
        cliente_id=cliente.id,
        nombre="Proyecto de ejemplo",
        tarifa_hora=0.0,
    )
    session.add(proyecto)

    await session.commit()

    _set_refresh_cookie(response, refresh_token_str)
    return TokenResponse(access_token=access_token, refresh_token=refresh_token_str)


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
async def login(
    request: Request,
    response: Response,
    data: LoginRequest,
    session: AsyncSession = Depends(get_session),
):
    result = await session.exec(select(User).where(User.email == data.email))
    user = result.first()

    if not user or not user.password_hash or not verify_password(
        data.password, user.password_hash
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales incorrectas",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cuenta desactivada",
        )

    access_token = create_access_token(str(user.id), user.email)
    refresh_token_str = create_refresh_token()
    refresh_token = RefreshToken(
        user_id=user.id,
        token=refresh_token_str,
        expires_at=datetime.now(timezone.utc).replace(tzinfo=None)
        + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    )
    session.add(refresh_token)
    await session.commit()

    _set_refresh_cookie(response, refresh_token_str)
    return TokenResponse(access_token=access_token, refresh_token=refresh_token_str)


@router.post("/refresh", response_model=TokenResponse)
@limiter.limit("20/minute")
async def refresh_tokens(
    request: Request,
    response: Response,
    # Acepta cookie HttpOnly o body (retrocompatibilidad)
    cookie_token: str | None = Cookie(default=None, alias=_COOKIE_NAME),
    data: RefreshRequest | None = None,
    session: AsyncSession = Depends(get_session),
):
    token_str = cookie_token or (data.refresh_token if data else None)
    if not token_str:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token no proporcionado",
        )

    result = await session.exec(
        select(RefreshToken).where(RefreshToken.token == token_str)
    )
    token = result.first()

    if not token or token.revoked:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token inválido o revocado",
        )
    if token.expires_at < datetime.now(timezone.utc).replace(tzinfo=None):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token expirado",
        )

    result = await session.exec(select(User).where(User.id == token.user_id))
    user = result.first()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario inactivo"
        )

    token.revoked = True
    session.add(token)

    new_access = create_access_token(str(user.id), user.email)
    new_refresh_str = create_refresh_token()
    new_refresh = RefreshToken(
        user_id=user.id,
        token=new_refresh_str,
        expires_at=datetime.now(timezone.utc).replace(tzinfo=None)
        + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    )
    session.add(new_refresh)
    await session.commit()

    _set_refresh_cookie(response, new_refresh_str)
    return TokenResponse(access_token=new_access, refresh_token=new_refresh_str)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("20/minute")
async def logout(
    request: Request,
    response: Response,
    cookie_token: str | None = Cookie(default=None, alias=_COOKIE_NAME),
    data: RefreshRequest | None = None,
    session: AsyncSession = Depends(get_session),
):
    token_str = cookie_token or (data.refresh_token if data else None)
    if token_str:
        result = await session.exec(
            select(RefreshToken).where(RefreshToken.token == token_str)
        )
        token = result.first()
        if token:
            token.revoked = True
            session.add(token)
            await session.commit()
    _clear_refresh_cookie(response)


@router.post("/forgot-password", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("3/minute")
async def forgot_password(
    request: Request,
    data: ForgotPasswordRequest,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
):
    result = await session.exec(select(User).where(User.email == data.email))
    user = result.first()
    if not user:
        return

    smtp_result = await session.exec(
        select(SMTPConfig).where(SMTPConfig.user_id == user.id)
    )
    smtp = smtp_result.first()
    if not smtp:
        return

    token = await create_reset_token(user.id, session)
    reset_url = f"{settings.FRONTEND_URL}/reset-password?token={token}"

    background_tasks.add_task(
        send_password_reset_email, smtp, user.email, reset_url, settings.APP_NAME
    )


@router.post("/reset-password", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("5/minute")
async def reset_password(
    request: Request,
    data: ResetPasswordRequest,
    session: AsyncSession = Depends(get_session),
):
    reset_token = await validate_reset_token(data.token, session)
    if not reset_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token inválido o expirado",
        )

    result = await session.exec(select(User).where(User.id == reset_token.user_id))
    user = result.first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado"
        )

    user.password_hash = hash_password(data.new_password)
    user.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    reset_token.used = True
    session.add(user)
    session.add(reset_token)
    await session.commit()


@router.get("/me", response_model=UserOut)
async def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.put("/me", response_model=UserOut)
async def update_me(
    data: UserUpdateRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    if data.nombre:
        current_user.nombre = data.nombre
    if data.avatar_url is not None:
        current_user.avatar_url = data.avatar_url
    if data.new_password:
        if not data.current_password or not verify_password(
            data.current_password, current_user.password_hash or ""
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Contraseña actual incorrecta",
            )
        current_user.password_hash = hash_password(data.new_password)

    current_user.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    session.add(current_user)
    await session.commit()
    await session.refresh(current_user)
    return current_user
