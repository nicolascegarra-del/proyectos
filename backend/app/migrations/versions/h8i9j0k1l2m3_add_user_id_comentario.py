"""v3: user_id en Comentario (autor del comentario)

Revision ID: h8i9j0k1l2m3
Revises: g7h8i9j0k1l2
Create Date: 2026-06-02 00:02:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'h8i9j0k1l2m3'
down_revision: Union[str, None] = 'g7h8i9j0k1l2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('comentario', sa.Column('user_id', sa.Uuid(), nullable=True))
    op.create_foreign_key(
        'fk_comentario_user_id_user', 'comentario', 'user',
        ['user_id'], ['id'], ondelete='SET NULL',
    )
    op.create_index('ix_comentario_user_id', 'comentario', ['user_id'])


def downgrade() -> None:
    op.drop_index('ix_comentario_user_id', table_name='comentario')
    op.drop_constraint('fk_comentario_user_id_user', 'comentario', type_='foreignkey')
    op.drop_column('comentario', 'user_id')
