"""kanban estados dinámicos por proyecto

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-03-26 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f6a7b8c9d0e1'
down_revision: Union[str, None] = 'e5f6a7b8c9d0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Crear tabla kanban_estado
    op.create_table(
        'kanban_estado',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('proyecto_id', sa.Uuid(), nullable=False),
        sa.Column('nombre', sa.String(50), nullable=False),
        sa.Column('orden', sa.Integer(), nullable=False),
        sa.Column('color', sa.String(20), nullable=False, server_default='#6B7280'),
        sa.Column('es_final', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['proyecto_id'], ['proyecto.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_kanban_estado_proyecto_id', 'kanban_estado', ['proyecto_id'])

    # 2. Insertar 5 estados por defecto para cada proyecto existente
    op.execute("""
        INSERT INTO kanban_estado (id, proyecto_id, nombre, orden, color, es_final, created_at, updated_at)
        SELECT gen_random_uuid(), p.id, 'Backlog',      1, '#6B7280', false, NOW(), NOW() FROM proyecto p
        UNION ALL
        SELECT gen_random_uuid(), p.id, 'Por hacer',    2, '#3B82F6', false, NOW(), NOW() FROM proyecto p
        UNION ALL
        SELECT gen_random_uuid(), p.id, 'En progreso',  3, '#8B5CF6', false, NOW(), NOW() FROM proyecto p
        UNION ALL
        SELECT gen_random_uuid(), p.id, 'Revisión',     4, '#F59E0B', false, NOW(), NOW() FROM proyecto p
        UNION ALL
        SELECT gen_random_uuid(), p.id, 'Hecho',        5, '#10B981', true,  NOW(), NOW() FROM proyecto p
    """)

    # 3. Añadir columna temporal kanban_estado_id en tarea
    op.add_column('tarea', sa.Column('kanban_estado_id', sa.Uuid(), nullable=True))

    # 4. Rellenar kanban_estado_id en base al valor del enum antiguo y el proyecto de la tarea
    op.execute("""
        UPDATE tarea t
        SET kanban_estado_id = ke.id
        FROM kanban_estado ke
        WHERE ke.proyecto_id = t.proyecto_id
          AND ke.nombre = CASE t.estado_kanban::TEXT
              WHEN 'backlog'     THEN 'Backlog'
              WHEN 'todo'        THEN 'Por hacer'
              WHEN 'en_progreso' THEN 'En progreso'
              WHEN 'revision'    THEN 'Revisión'
              WHEN 'done'        THEN 'Hecho'
              ELSE 'Por hacer'
          END
    """)

    # 5. Para tareas que no tengan estado asignado (por si acaso), asignar el primer estado del proyecto
    op.execute("""
        UPDATE tarea t
        SET kanban_estado_id = (
            SELECT ke.id FROM kanban_estado ke
            WHERE ke.proyecto_id = t.proyecto_id
            ORDER BY ke.orden
            LIMIT 1
        )
        WHERE t.kanban_estado_id IS NULL
    """)

    # 6. Hacer NOT NULL
    op.alter_column('tarea', 'kanban_estado_id', nullable=False)

    # 7. Eliminar columna antigua
    op.drop_column('tarea', 'estado_kanban')

    # 8. Renombrar nueva columna
    op.alter_column('tarea', 'kanban_estado_id', new_column_name='estado_kanban')

    # 9. Crear índice en la nueva columna
    op.create_index('ix_tarea_estado_kanban', 'tarea', ['estado_kanban'])

    # 10. Eliminar el tipo enum antiguo de PostgreSQL
    op.execute('DROP TYPE IF EXISTS estadokanban')


def downgrade() -> None:
    # Recrear el enum y restaurar la columna (datos de vuelta al enum más cercano)
    op.execute("""
        CREATE TYPE estadokanban AS ENUM ('backlog', 'todo', 'en_progreso', 'revision', 'done')
    """)

    op.drop_index('ix_tarea_estado_kanban', table_name='tarea')
    op.add_column('tarea', sa.Column('estado_kanban_old', sa.String(20), nullable=True))

    op.execute("""
        UPDATE tarea t
        SET estado_kanban_old = CASE ke.nombre
            WHEN 'Backlog'      THEN 'backlog'
            WHEN 'Por hacer'    THEN 'todo'
            WHEN 'En progreso'  THEN 'en_progreso'
            WHEN 'Revisión'     THEN 'revision'
            WHEN 'Hecho'        THEN 'done'
            ELSE 'todo'
        END
        FROM kanban_estado ke
        WHERE ke.id = t.estado_kanban
    """)

    op.drop_column('tarea', 'estado_kanban')
    op.alter_column('tarea', 'estado_kanban_old', new_column_name='estado_kanban')

    op.execute("""
        ALTER TABLE tarea
        ALTER COLUMN estado_kanban TYPE estadokanban
        USING estado_kanban::estadokanban
    """)

    op.drop_index('ix_kanban_estado_proyecto_id', table_name='kanban_estado')
    op.drop_table('kanban_estado')
