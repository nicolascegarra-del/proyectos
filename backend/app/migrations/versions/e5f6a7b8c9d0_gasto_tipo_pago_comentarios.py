"""gasto tipo_pago y tabla comentario

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-03-26 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e5f6a7b8c9d0'
down_revision: Union[str, None] = 'd4e5f6a7b8c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Añadir tipo_pago y periodicidad a gasto
    op.add_column('gasto', sa.Column('tipo_pago', sa.String(20), nullable=False, server_default='unico'))
    op.add_column('gasto', sa.Column('periodicidad', sa.String(20), nullable=True))

    # 2. Crear tabla comentario
    op.create_table(
        'comentario',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('tarea_id', sa.Uuid(), nullable=False),
        sa.Column('texto', sa.String(2000), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['tarea_id'], ['tarea.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_comentario_tarea_id', 'comentario', ['tarea_id'])


def downgrade() -> None:
    op.drop_index('ix_comentario_tarea_id', table_name='comentario')
    op.drop_table('comentario')
    op.drop_column('gasto', 'periodicidad')
    op.drop_column('gasto', 'tipo_pago')
