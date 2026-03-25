"""add sprints

Revision ID: d4e5f6a7b8c9
Revises: c1d2e3f4a5b6
Create Date: 2026-03-25 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, None] = 'c1d2e3f4a5b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add sprint_duracion_dias to proyecto
    op.add_column('proyecto', sa.Column('sprint_duracion_dias', sa.Integer(), nullable=True))

    # 2. Create sprint table
    op.create_table(
        'sprint',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('proyecto_id', sa.Uuid(), nullable=False),
        sa.Column('numero', sa.Integer(), nullable=False),
        sa.Column('nombre', sa.String(100), nullable=False),
        sa.Column('fecha_inicio', sa.Date(), nullable=False),
        sa.Column('fecha_fin', sa.Date(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['proyecto_id'], ['proyecto.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_sprint_proyecto_id', 'sprint', ['proyecto_id'])

    # 3. Add sprint_id to tarea
    op.add_column('tarea', sa.Column('sprint_id', sa.Uuid(), nullable=True))
    op.create_foreign_key(
        'fk_tarea_sprint', 'tarea', 'sprint',
        ['sprint_id'], ['id'], ondelete='SET NULL',
    )
    op.create_index('ix_tarea_sprint_id', 'tarea', ['sprint_id'])


def downgrade() -> None:
    op.drop_index('ix_tarea_sprint_id', table_name='tarea')
    op.drop_constraint('fk_tarea_sprint', 'tarea', type_='foreignkey')
    op.drop_column('tarea', 'sprint_id')

    op.drop_index('ix_sprint_proyecto_id', table_name='sprint')
    op.drop_table('sprint')

    op.drop_column('proyecto', 'sprint_duracion_dias')
