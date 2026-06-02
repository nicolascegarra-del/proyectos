"""v3: tipo en NotaProyecto (general | reunion | decision | bloqueante | acuerdo)

Revision ID: i9j0k1l2m3n4
Revises: h9a0b1c2d3e4
Create Date: 2026-06-02 00:04:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'i9j0k1l2m3n4'
down_revision: Union[str, None] = 'h9a0b1c2d3e4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'nota_proyecto',
        sa.Column('tipo', sa.String(20), nullable=False, server_default='general'),
    )


def downgrade() -> None:
    op.drop_column('nota_proyecto', 'tipo')
