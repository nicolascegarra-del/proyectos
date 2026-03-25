"""add subtarea table

Revision ID: c1d2e3f4a5b6
Revises: b3c4d5e6f7a8
Create Date: 2026-03-25 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c1d2e3f4a5b6'
down_revision: Union[str, None] = 'b3c4d5e6f7a8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'subtarea',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('tarea_id', sa.Uuid(), nullable=False),
        sa.Column('descripcion', sa.String(length=500), nullable=False),
        sa.Column('completada', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['tarea_id'], ['tarea.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_subtarea_tarea_id', 'subtarea', ['tarea_id'])


def downgrade() -> None:
    op.drop_index('ix_subtarea_tarea_id', table_name='subtarea')
    op.drop_table('subtarea')
