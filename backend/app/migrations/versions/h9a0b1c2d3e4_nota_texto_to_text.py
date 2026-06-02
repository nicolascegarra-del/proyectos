"""v3: nota_proyecto.texto a TEXT (sin límite) para soportar HTML enriquecido

Revision ID: h9a0b1c2d3e4
Revises: h8i9j0k1l2m3
Create Date: 2026-06-02 00:03:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'h9a0b1c2d3e4'
down_revision: Union[str, None] = 'h8i9j0k1l2m3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        'nota_proyecto', 'texto',
        existing_type=sa.String(length=4000),
        type_=sa.Text(),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        'nota_proyecto', 'texto',
        existing_type=sa.Text(),
        type_=sa.String(length=4000),
        existing_nullable=False,
    )
