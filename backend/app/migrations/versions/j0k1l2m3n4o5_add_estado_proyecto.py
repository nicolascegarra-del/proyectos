"""v3: estado, descripcion, fecha_inicio y fecha_fin_estimada en Proyecto

Revision ID: j0k1l2m3n4o5
Revises: i9j0k1l2m3n4
Create Date: 2026-06-02 00:05:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'j0k1l2m3n4o5'
down_revision: Union[str, None] = 'i9j0k1l2m3n4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('proyecto', sa.Column('estado', sa.String(20), nullable=False, server_default='activo'))
    op.add_column('proyecto', sa.Column('descripcion', sa.String(1000), nullable=True))
    op.add_column('proyecto', sa.Column('fecha_inicio', sa.Date(), nullable=True))
    op.add_column('proyecto', sa.Column('fecha_fin_estimada', sa.Date(), nullable=True))
    op.create_index('ix_proyecto_estado', 'proyecto', ['estado'])


def downgrade() -> None:
    op.drop_index('ix_proyecto_estado', table_name='proyecto')
    op.drop_column('proyecto', 'fecha_fin_estimada')
    op.drop_column('proyecto', 'fecha_inicio')
    op.drop_column('proyecto', 'descripcion')
    op.drop_column('proyecto', 'estado')
