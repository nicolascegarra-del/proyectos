"""v3: assigned_to en Tarea (asignación de tarea a un miembro del proyecto)

Revision ID: g7h8i9j0k1l2
Revises: a1b2c3d4e5f6
Create Date: 2026-06-02 00:01:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'g7h8i9j0k1l2'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('tarea', sa.Column('assigned_to', sa.Uuid(), nullable=True))
    op.create_foreign_key(
        'fk_tarea_assigned_to_user', 'tarea', 'user',
        ['assigned_to'], ['id'], ondelete='SET NULL',
    )
    op.create_index('ix_tarea_assigned_to', 'tarea', ['assigned_to'])


def downgrade() -> None:
    op.drop_index('ix_tarea_assigned_to', table_name='tarea')
    op.drop_constraint('fk_tarea_assigned_to_user', 'tarea', type_='foreignkey')
    op.drop_column('tarea', 'assigned_to')
