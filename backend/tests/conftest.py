import asyncio
import uuid
from datetime import date, datetime, timezone
from typing import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlmodel import SQLModel

from app.core.security import create_access_token, hash_password
from app.database import get_session
from app.main import app
from app.models import (
    Configuracion,
    Plan,
    Proyecto,
    RolWorkspace,
    Tarea,
    User,
    Workspace,
    WorkspaceMember,
    Presupuesto,
    PresupuestoLinea,
    Cliente,
)

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

test_engine = create_async_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})
TestSessionLocal = sessionmaker(bind=test_engine, class_=AsyncSession, expire_on_commit=False)


async def override_get_session() -> AsyncGenerator[AsyncSession, None]:
    async with TestSessionLocal() as session:
        yield session


app.dependency_overrides[get_session] = override_get_session


@pytest_asyncio.fixture(scope="function", autouse=True)
async def setup_db():
    async with test_engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.drop_all)


@pytest_asyncio.fixture
async def session() -> AsyncGenerator[AsyncSession, None]:
    async with TestSessionLocal() as s:
        yield s


@pytest_asyncio.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac


@pytest_asyncio.fixture
async def plan(session: AsyncSession) -> Plan:
    p = Plan(
        nombre="Pro",
        max_workspaces=-1,
        max_proyectos_por_workspace=-1,
        max_tareas_por_proyecto=-1,
        max_lineas_bitacora=-1,
        max_miembros_por_workspace=-1,
        max_gastos_por_proyecto=-1,
        max_presupuestos_por_workspace=-1,
        precio=29.0,
        es_default=True,
    )
    session.add(p)
    await session.commit()
    await session.refresh(p)
    return p


@pytest_asyncio.fixture
async def user(session: AsyncSession, plan: Plan) -> User:
    u = User(
        email="test@klyp.app",
        password_hash=hash_password("testpass123"),
        nombre="Test User",
        plan_id=plan.id,
    )
    session.add(u)
    await session.commit()
    await session.refresh(u)
    return u


@pytest_asyncio.fixture
async def workspace(session: AsyncSession, user: User) -> Workspace:
    ws = Workspace(nombre="Test Workspace", owner_id=user.id)
    session.add(ws)
    await session.flush()
    member = WorkspaceMember(
        workspace_id=ws.id, user_id=user.id, rol=RolWorkspace.owner
    )
    config = Configuracion(workspace_id=ws.id)
    session.add(member)
    session.add(config)
    await session.commit()
    await session.refresh(ws)
    return ws


@pytest_asyncio.fixture
async def auth_headers(user: User) -> dict:
    token = create_access_token(str(user.id), user.email, user.is_superadmin)
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def cliente(session: AsyncSession, workspace: Workspace) -> Cliente:
    c = Cliente(workspace_id=workspace.id, nombre="Cliente Test", email="cliente@test.com")
    session.add(c)
    await session.commit()
    await session.refresh(c)
    return c


@pytest_asyncio.fixture
async def proyecto(session: AsyncSession, workspace: Workspace, cliente: Cliente) -> Proyecto:
    p = Proyecto(
        workspace_id=workspace.id,
        cliente_id=cliente.id,
        nombre="Proyecto Test",
        tarifa_hora=50.0,
    )
    session.add(p)
    await session.commit()
    await session.refresh(p)
    return p
