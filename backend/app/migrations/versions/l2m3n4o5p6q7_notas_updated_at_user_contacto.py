"""v4: nota_proyecto.updated_at + user.es_contacto

- nota_proyecto.updated_at (edición de notas; backfill = created_at)
- user.es_contacto (miembros de equipo sin cuenta/login)

Revision ID: l2m3n4o5p6q7
Revises: k1l2m3n4o5p6
Create Date: 2026-06-08 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'l2m3n4o5p6q7'
down_revision: Union[str, None] = 'k1l2m3n4o5p6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── nota_proyecto.updated_at ──────────────────────────────────────────────
    op.add_column(
        'nota_proyecto',
        sa.Column('updated_at', sa.DateTime(), nullable=True),
    )
    # Backfill: las notas existentes nunca se editaron -> updated_at = created_at
    op.execute("UPDATE nota_proyecto SET updated_at = created_at")
    op.alter_column('nota_proyecto', 'updated_at', nullable=False)

    # ── user.es_contacto ──────────────────────────────────────────────────────
    op.add_column(
        'user',
        sa.Column('es_contacto', sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    # Quitamos el server_default tras el backfill: el modelo gestiona el valor.
    op.alter_column('user', 'es_contacto', server_default=None)


def downgrade() -> None:
    op.drop_column('user', 'es_contacto')
    op.drop_column('nota_proyecto', 'updated_at')
