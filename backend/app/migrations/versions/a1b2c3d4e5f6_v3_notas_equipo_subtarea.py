"""v3: notas de proyecto, equipo de proyecto y campos de fecha/horas en subtarea

Revision ID: a1b2c3d4e5f6
Revises: f6a7b8c9d0e1
Create Date: 2026-06-02 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = 'f6a7b8c9d0e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. nota_proyecto
    op.create_table(
        'nota_proyecto',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('proyecto_id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('texto', sa.String(4000), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['proyecto_id'], ['proyecto.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_nota_proyecto_proyecto_id', 'nota_proyecto', ['proyecto_id'])
    op.create_index('ix_nota_proyecto_user_id', 'nota_proyecto', ['user_id'])
    op.create_index('ix_nota_proyecto_created', 'nota_proyecto', ['proyecto_id', 'created_at'])

    # 2. proyecto_miembro
    op.create_table(
        'proyecto_miembro',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('proyecto_id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('horas_semana', sa.Float(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['proyecto_id'], ['proyecto.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_proyecto_miembro_proyecto_id', 'proyecto_miembro', ['proyecto_id'])
    op.create_index('ix_proyecto_miembro_user_id', 'proyecto_miembro', ['user_id'])
    op.create_index(
        'ix_proyecto_miembro_unique', 'proyecto_miembro',
        ['proyecto_id', 'user_id'], unique=True,
    )

    # 3. subtarea: nuevas columnas
    op.add_column('subtarea', sa.Column('fecha_inicio', sa.Date(), nullable=True))
    op.add_column('subtarea', sa.Column('fecha_fin', sa.Date(), nullable=True))
    op.add_column('subtarea', sa.Column('horas_estimadas', sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column('subtarea', 'horas_estimadas')
    op.drop_column('subtarea', 'fecha_fin')
    op.drop_column('subtarea', 'fecha_inicio')

    op.drop_index('ix_proyecto_miembro_unique', table_name='proyecto_miembro')
    op.drop_index('ix_proyecto_miembro_user_id', table_name='proyecto_miembro')
    op.drop_index('ix_proyecto_miembro_proyecto_id', table_name='proyecto_miembro')
    op.drop_table('proyecto_miembro')

    op.drop_index('ix_nota_proyecto_created', table_name='nota_proyecto')
    op.drop_index('ix_nota_proyecto_user_id', table_name='nota_proyecto')
    op.drop_index('ix_nota_proyecto_proyecto_id', table_name='nota_proyecto')
    op.drop_table('nota_proyecto')
