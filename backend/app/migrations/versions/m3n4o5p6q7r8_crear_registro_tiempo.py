"""v4: crear tabla registro_tiempo (cronómetro)

La tabla ``registro_tiempo`` formaba parte de los modelos pero nunca tuvo una
migración propia: se creaba únicamente vía ``create_all``. Esto la incorpora a
la cadena de migraciones para que ``alembic upgrade head`` desde cero produzca
el esquema completo.

Es idempotente (``IF NOT EXISTS``) para no chocar con bases de datos existentes
donde ya fue creada por ``create_all``. En SQLite (tests) es no-op: el esquema
se crea con create_all.

Revision ID: m3n4o5p6q7r8
Revises: l2m3n4o5p6q7
Create Date: 2026-06-08 00:30:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = 'm3n4o5p6q7r8'
down_revision: Union[str, None] = 'l2m3n4o5p6q7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS public.registro_tiempo (
            id uuid NOT NULL,
            tarea_id uuid NOT NULL,
            inicio timestamp without time zone NOT NULL,
            fin timestamp without time zone,
            duracion_horas double precision,
            created_at timestamp without time zone NOT NULL,
            CONSTRAINT registro_tiempo_pkey PRIMARY KEY (id),
            CONSTRAINT registro_tiempo_tarea_id_fkey
                FOREIGN KEY (tarea_id) REFERENCES public.tarea(id)
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_registro_tiempo_tarea_id "
        "ON public.registro_tiempo USING btree (tarea_id)"
    )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    op.execute("DROP TABLE IF EXISTS public.registro_tiempo CASCADE")
