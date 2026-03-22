import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi.errors import RateLimitExceeded
from sqlmodel import select

from app.config import settings
from app.core.limiter import limiter
from app.core.security import hash_password
from app.database import AsyncSessionLocal, create_db_and_tables
from app.models import Plan, RolWorkspace, User, Workspace, WorkspaceMember
from app.routers import (
    articulos,
    auth,
    clientes,
    configuracion,
    dashboard,
    gastos,
    presupuestos,
    proyectos,
    public,
    smtp,
    superadmin,
    sync,
    tags,
    tareas,
    workspaces,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await create_db_and_tables()
    await _seed_defaults()
    yield


async def _seed_defaults():
    async with AsyncSessionLocal() as session:
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


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
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
app.include_router(tareas.router)
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
app.mount("/uploads", StaticFiles(directory="/app/uploads"), name="uploads")


@app.get("/health")
async def health():
    return {"status": "ok", "app": settings.APP_NAME}
