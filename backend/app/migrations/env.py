import asyncio
import os
from logging.config import fileConfig

from sqlalchemy.ext.asyncio import create_async_engine
from sqlmodel import SQLModel

from alembic import context

# Import all models so SQLModel.metadata is populated
from app.models import (  # noqa: F401
    Articulo,
    Cliente,
    Configuracion,
    Gasto,
    PasswordResetToken,
    Plan,
    Presupuesto,
    PresupuestoLinea,
    Proyecto,
    RefreshToken,
    RetainerCiclo,
    NotaTag,
    RolWorkspace,
    SMTPConfig,
    Tag,
    Tarea,
    TareaTag,
    User,
    Workspace,
    WorkspaceInvite,
    WorkspaceMember,
)

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = SQLModel.metadata


def get_url():
    return os.environ.get(
        "DATABASE_URL",
        "postgresql+asyncpg://klyp:klyp_local_dev_2026@localhost:5432/klyp",
    )


def run_migrations_offline():
    url = get_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection):
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online():
    connectable = create_async_engine(get_url(), echo=False)
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
