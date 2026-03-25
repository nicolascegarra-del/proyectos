"""add gantt dates to tarea

Revision ID: b3c4d5e6f7a8
Revises: e0ddf04c438a
Create Date: 2026-03-25 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b3c4d5e6f7a8'
down_revision: Union[str, None] = 'e0ddf04c438a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('tarea', sa.Column('fecha_inicio', sa.Date(), nullable=True))
    op.add_column('tarea', sa.Column('fecha_fin', sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column('tarea', 'fecha_fin')
    op.drop_column('tarea', 'fecha_inicio')
