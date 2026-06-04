"""v3: etiquetas privadas por usuario y multietiqueta en tareas/notas

- tag.user_id (etiquetas privadas del usuario que las crea)
- tablas N-a-N tarea_tag y nota_tag
- migración de tarea.tag_id (single) -> tarea_tag (multi)
- migración de nota_proyecto.tipo -> etiqueta por autor + nota_tag
- eliminación de tarea.tag_id y nota_proyecto.tipo

Revision ID: k1l2m3n4o5p6
Revises: j0k1l2m3n4o5
Create Date: 2026-06-04 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'k1l2m3n4o5p6'
down_revision: Union[str, None] = 'j0k1l2m3n4o5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── 1. tag.user_id ────────────────────────────────────────────────────────
    op.add_column('tag', sa.Column('user_id', sa.Uuid(), nullable=True))
    # Backfill: las etiquetas existentes pasan a ser del owner del workspace.
    op.execute(
        """
        UPDATE tag
        SET user_id = w.owner_id
        FROM workspace w
        WHERE w.id = tag.workspace_id
        """
    )
    op.alter_column('tag', 'user_id', nullable=False)
    op.create_foreign_key('fk_tag_user', 'tag', 'user', ['user_id'], ['id'], ondelete='CASCADE')
    op.create_index('ix_tag_user_id', 'tag', ['user_id'])
    op.create_index('ix_tag_user_workspace', 'tag', ['user_id', 'workspace_id'])

    # ── 2. tarea_tag ──────────────────────────────────────────────────────────
    op.create_table(
        'tarea_tag',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('tarea_id', sa.Uuid(), nullable=False),
        sa.Column('tag_id', sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(['tarea_id'], ['tarea.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['tag_id'], ['tag.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_tarea_tag_tarea_id', 'tarea_tag', ['tarea_id'])
    op.create_index('ix_tarea_tag_tag_id', 'tarea_tag', ['tag_id'])
    op.create_index('ix_tarea_tag_unique', 'tarea_tag', ['tarea_id', 'tag_id'], unique=True)

    # ── 3. nota_tag ───────────────────────────────────────────────────────────
    op.create_table(
        'nota_tag',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('nota_id', sa.Uuid(), nullable=False),
        sa.Column('tag_id', sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(['nota_id'], ['nota_proyecto.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['tag_id'], ['tag.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_nota_tag_nota_id', 'nota_tag', ['nota_id'])
    op.create_index('ix_nota_tag_tag_id', 'nota_tag', ['tag_id'])
    op.create_index('ix_nota_tag_unique', 'nota_tag', ['nota_id', 'tag_id'], unique=True)

    # ── 4. Migrar tarea.tag_id -> tarea_tag, luego eliminar la columna ────────
    op.execute(
        """
        INSERT INTO tarea_tag (id, tarea_id, tag_id)
        SELECT gen_random_uuid(), id, tag_id
        FROM tarea
        WHERE tag_id IS NOT NULL
        """
    )
    op.drop_column('tarea', 'tag_id')

    # ── 5. Migrar nota_proyecto.tipo -> etiqueta por autor + nota_tag ─────────
    # 5a. Crear las etiquetas faltantes por (autor, workspace, tipo).
    op.execute(
        """
        INSERT INTO tag (id, workspace_id, user_id, nombre, color, created_at)
        SELECT gen_random_uuid(), sub.workspace_id, sub.user_id, sub.nombre, sub.color, now()
        FROM (
            SELECT DISTINCT p.workspace_id AS workspace_id,
                   n.user_id AS user_id,
                   n.tipo AS nombre,
                   CASE n.tipo
                       WHEN 'reunion'    THEN '#EAB308'
                       WHEN 'decision'   THEN '#3B82F6'
                       WHEN 'bloqueante' THEN '#EF4444'
                       WHEN 'acuerdo'    THEN '#22C55E'
                       ELSE '#6B7280'
                   END AS color
            FROM nota_proyecto n
            JOIN proyecto p ON p.id = n.proyecto_id
        ) sub
        WHERE NOT EXISTS (
            SELECT 1 FROM tag t
            WHERE t.workspace_id = sub.workspace_id
              AND t.user_id = sub.user_id
              AND t.nombre = sub.nombre
        )
        """
    )
    # 5b. Enlazar cada nota con su etiqueta equivalente.
    op.execute(
        """
        INSERT INTO nota_tag (id, nota_id, tag_id)
        SELECT gen_random_uuid(), n.id, t.id
        FROM nota_proyecto n
        JOIN proyecto p ON p.id = n.proyecto_id
        JOIN tag t ON t.workspace_id = p.workspace_id
                  AND t.user_id = n.user_id
                  AND t.nombre = n.tipo
        WHERE NOT EXISTS (
            SELECT 1 FROM nota_tag nt WHERE nt.nota_id = n.id AND nt.tag_id = t.id
        )
        """
    )
    op.drop_column('nota_proyecto', 'tipo')


def downgrade() -> None:
    # Restaurar nota_proyecto.tipo (best-effort: primera etiqueta enlazada).
    op.add_column(
        'nota_proyecto',
        sa.Column('tipo', sa.String(20), nullable=False, server_default='general'),
    )
    op.execute(
        """
        UPDATE nota_proyecto n
        SET tipo = t.nombre
        FROM nota_tag nt
        JOIN tag t ON t.id = nt.tag_id
        WHERE nt.nota_id = n.id
          AND t.nombre IN ('general', 'reunion', 'decision', 'bloqueante', 'acuerdo')
        """
    )

    # Restaurar tarea.tag_id (best-effort: primera etiqueta enlazada).
    op.add_column('tarea', sa.Column('tag_id', sa.Uuid(), nullable=True))
    op.create_foreign_key('fk_tarea_tag', 'tarea', 'tag', ['tag_id'], ['id'])
    op.execute(
        """
        UPDATE tarea
        SET tag_id = sub.tag_id
        FROM (
            SELECT DISTINCT ON (tarea_id) tarea_id, tag_id
            FROM tarea_tag
            ORDER BY tarea_id, id
        ) sub
        WHERE sub.tarea_id = tarea.id
        """
    )

    op.drop_index('ix_nota_tag_unique', table_name='nota_tag')
    op.drop_index('ix_nota_tag_tag_id', table_name='nota_tag')
    op.drop_index('ix_nota_tag_nota_id', table_name='nota_tag')
    op.drop_table('nota_tag')

    op.drop_index('ix_tarea_tag_unique', table_name='tarea_tag')
    op.drop_index('ix_tarea_tag_tag_id', table_name='tarea_tag')
    op.drop_index('ix_tarea_tag_tarea_id', table_name='tarea_tag')
    op.drop_table('tarea_tag')

    op.drop_index('ix_tag_user_workspace', table_name='tag')
    op.drop_index('ix_tag_user_id', table_name='tag')
    op.drop_constraint('fk_tag_user', 'tag', type_='foreignkey')
    op.drop_column('tag', 'user_id')
