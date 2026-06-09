import logging
import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger(__name__)

# Content-Security-Policy aplicada a las respuestas de la API. La SPA (HTML/JS)
# la sirve nginx con su propia CSP (ver frontend/nginx.conf). 'unsafe-inline' en
# style-src es necesario por los estilos inline de Radix UI. Endurecer iterando.
_CSP = (
    "default-src 'self'; "
    "script-src 'self'; "
    "style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data: blob:; "
    "font-src 'self' data:; "
    "connect-src 'self'; "
    "frame-ancestors 'none'; "
    "base-uri 'self'; "
    "form-action 'self'"
)

from fastapi import Depends, FastAPI, HTTPException, Query, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from slowapi.errors import RateLimitExceeded
from sqlalchemy import text
from sqlmodel import select

from app.config import settings, validate_production_secrets
from app.core.limiter import limiter
from app.core.security import decode_access_token, hash_password
from app.database import AsyncSessionLocal, create_db_and_tables, get_session
from app.models import Plan, Proyecto, RolWorkspace, Tarea, User, Workspace, WorkspaceMember

UPLOAD_DIR = Path("/app/uploads")
from app.routers import (
    articulos,
    auth,
    clientes,
    comentarios,
    configuracion,
    dashboard,
    gastos,
    kanban_estados,
    notas,
    notas_proyecto,
    presupuestos,
    proyecto_miembros,
    proyectos,
    public,
    smtp,
    sprints,
    subtareas,
    superadmin,
    sync,
    tags,
    tareas,
    tiempo,
    workspaces,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Fail-fast: en producción no arrancar con secretos por defecto/vacíos.
    validate_production_secrets(settings)
    await create_db_and_tables()
    await _seed_defaults()
    yield


async def _seed_defaults():
    async with AsyncSessionLocal() as session:
        # Con uvicorn --workers >1 todos los procesos ejecutan este seed al
        # arrancar. Contra una BD vacía eso provoca una carrera (dos workers
        # insertando el mismo superadmin -> UniqueViolationError y crash de un
        # worker). Un advisory lock transaccional serializa el seed: solo un
        # worker siembra; el resto espera y, al entrar, ve los datos ya creados
        # y los omite. Se libera al hacer commit. Solo aplica en PostgreSQL.
        if settings.DATABASE_URL.startswith("postgresql"):
            await session.execute(text("SELECT pg_advisory_xact_lock(727274)"))

        plans_result = await session.exec(select(Plan))
        if not plans_result.first():
            free_plan = Plan(
                nombre="Free",
                max_workspaces=1,
                max_proyectos_por_workspace=3,
                max_tareas_por_proyecto=50,
                max_lineas_bitacora=100,
                max_miembros_por_workspace=3,
                max_gastos_por_proyecto=30,
                max_presupuestos_por_workspace=5,
                precio=0.0,
                activo=True,
                es_default=True,
            )
            pro_plan = Plan(
                nombre="Pro",
                max_workspaces=-1,
                max_proyectos_por_workspace=-1,
                max_tareas_por_proyecto=-1,
                max_lineas_bitacora=-1,
                max_miembros_por_workspace=-1,
                max_gastos_por_proyecto=-1,
                max_presupuestos_por_workspace=-1,
                precio=29.0,
                activo=True,
                es_default=False,
            )
            enterprise_plan = Plan(
                nombre="Enterprise",
                max_workspaces=-1,
                max_proyectos_por_workspace=-1,
                max_tareas_por_proyecto=-1,
                max_lineas_bitacora=-1,
                max_miembros_por_workspace=-1,
                max_gastos_por_proyecto=-1,
                max_presupuestos_por_workspace=-1,
                precio=99.0,
                activo=True,
                es_default=False,
            )
            session.add(free_plan)
            session.add(pro_plan)
            session.add(enterprise_plan)
            await session.flush()

        superadmin_result = await session.exec(
            select(User).where(User.is_superadmin == True)
        )
        if not superadmin_result.first():
            plans_result = await session.exec(select(Plan))
            pro_plan = next(
                (p for p in plans_result.all() if p.nombre == "Pro"), None
            )
            superadmin = User(
                email=settings.SUPERADMIN_EMAIL,
                password_hash=hash_password(settings.SUPERADMIN_PASSWORD),
                nombre="Superadmin",
                is_superadmin=True,
                plan_id=pro_plan.id if pro_plan else None,
            )
            session.add(superadmin)
            await session.flush()

            workspace = Workspace(
                nombre="Admin Workspace",
                owner_id=superadmin.id,
            )
            session.add(workspace)
            await session.flush()

            member = WorkspaceMember(
                workspace_id=workspace.id,
                user_id=superadmin.id,
                rol=RolWorkspace.owner,
            )
            session.add(member)

        await session.commit()


app = FastAPI(
    title="Klyp API",
    version="1.0.0",
    description="API para gestión de proyectos, horas, gastos y presupuestos",
    lifespan=lifespan,
)

app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"detail": "Demasiados intentos. Espera un momento antes de volver a intentarlo."},
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """Captura errores no controlados: loguea el detalle internamente y devuelve
    una respuesta genérica sin stack trace ni datos sensibles al cliente."""
    logger.exception("Error no controlado en %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "Error interno del servidor."},
    )


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    response.headers["Content-Security-Policy"] = _CSP
    if settings.is_production:
        # HSTS solo en producción (en local se sirve por HTTP y rompería el acceso).
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(auth.router)
app.include_router(superadmin.router)
app.include_router(workspaces.router)
app.include_router(clientes.router)
app.include_router(proyectos.router)
app.include_router(sprints.router)
app.include_router(kanban_estados.router)
app.include_router(tareas.router)
app.include_router(subtareas.router)
app.include_router(tiempo.router)
app.include_router(comentarios.router)
app.include_router(notas_proyecto.router)
app.include_router(notas.router)
app.include_router(proyecto_miembros.router)
app.include_router(gastos.router)
app.include_router(presupuestos.router)
app.include_router(articulos.router)
app.include_router(tags.router)
app.include_router(configuracion.router)
app.include_router(smtp.router)
app.include_router(sync.router)
app.include_router(public.router)
app.include_router(dashboard.router)

os.makedirs("/app/uploads", exist_ok=True)


@app.get("/uploads/{filename}")
async def serve_upload(
    filename: str,
    request: Request,
    token: str | None = Query(default=None),
    session=Depends(get_session),
):
    """Sirve archivos adjuntos solo a usuarios autenticados y con acceso al workspace."""
    # Acepta token via query param (para links directos en <a href>) o via Bearer header
    raw_token = token
    if not raw_token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            raw_token = auth_header[7:]
    if not raw_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No autenticado")

    payload = decode_access_token(raw_token)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")

    user_id = payload.get("sub")
    user_result = await session.exec(select(User).where(User.id == uuid.UUID(user_id)))
    user = user_result.first()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario inactivo")

    # Defensa contra path traversal: el filename debe ser un único componente
    # seguro, y la ruta resuelta debe quedar estrictamente dentro de UPLOAD_DIR.
    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Archivo no encontrado")

    file_path = (UPLOAD_DIR / filename).resolve()
    if not file_path.is_relative_to(UPLOAD_DIR.resolve()) or not file_path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Archivo no encontrado")

    # Verificar que el usuario tiene acceso al workspace de la tarea
    # El filename tiene formato: {tarea_id}_{8hex}{ext}
    try:
        tarea_id = uuid.UUID(filename[:36])
    except (ValueError, IndexError):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Archivo no encontrado")

    tarea_result = await session.exec(select(Tarea).where(Tarea.id == tarea_id))
    tarea = tarea_result.first()
    if not tarea:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Archivo no encontrado")

    proyecto_result = await session.exec(select(Proyecto).where(Proyecto.id == tarea.proyecto_id))
    proyecto = proyecto_result.first()
    if not proyecto:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Archivo no encontrado")

    member_result = await session.exec(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == proyecto.workspace_id,
            WorkspaceMember.user_id == user.id,
        )
    )
    if not member_result.first():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin acceso")

    return FileResponse(file_path)


@app.get("/health")
async def health():
    return {"status": "ok", "app": settings.APP_NAME}
