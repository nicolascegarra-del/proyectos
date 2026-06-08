"""initial

Esquema base del proyecto (estado del commit inicial). Crea los tipos ENUM,
tablas, claves primarias/foráneas e índices base. Las migraciones posteriores
aplican cambios incrementales sobre esta base.

Históricamente este fichero estaba vacío y el esquema base se creaba con
``SQLModel.metadata.create_all`` en el arranque, por lo que ``alembic upgrade head``
desde una base de datos vacía fallaba en el primer ALTER (la tabla no existía).
Al materializar aquí el esquema base, la cadena de migraciones es autosuficiente
y ``create_all(checkfirst=True)`` posterior queda como no-op.

El DDL se ejecuta solo en PostgreSQL; en SQLite (tests) el esquema se sigue
creando con create_all, así que esta migración es un no-op en ese motor.

Revision ID: e0ddf04c438a
Revises:
Create Date: 2026-03-23 13:17:28.383662

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'e0ddf04c438a'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Esquema base, volcado con pg_dump del create_all de los modelos iniciales.
_BASE_DDL = r"""
CREATE TYPE public.estadokanban AS ENUM (
    'backlog',
    'todo',
    'en_progreso',
    'revision',
    'done'
);
CREATE TYPE public.estadopago AS ENUM (
    'pendiente',
    'facturado',
    'cobrado'
);
CREATE TYPE public.estadopresupuesto AS ENUM (
    'borrador',
    'enviado',
    'aceptado',
    'rechazado'
);
CREATE TYPE public.prioridad AS ENUM (
    'critico',
    'alto',
    'medio',
    'bajo'
);
CREATE TYPE public.rolworkspace AS ENUM (
    'owner',
    'admin',
    'member',
    'viewer'
);
CREATE TABLE public.articulo (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    concepto character varying(500) NOT NULL,
    precio_base double precision NOT NULL,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL
);
CREATE TABLE public.cliente (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    nombre character varying(255) NOT NULL,
    email character varying(255),
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL
);
CREATE TABLE public.configuracion (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    email_template_subject character varying(500) NOT NULL,
    email_template_body character varying NOT NULL,
    webhook_url character varying(500),
    updated_at timestamp without time zone NOT NULL
);
CREATE TABLE public.gasto (
    id uuid NOT NULL,
    proyecto_id uuid NOT NULL,
    concepto character varying(500) NOT NULL,
    monto double precision NOT NULL,
    fecha date NOT NULL,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL
);
CREATE TABLE public.passwordresettoken (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    token character varying NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    used boolean NOT NULL,
    created_at timestamp without time zone NOT NULL
);
CREATE TABLE public.plan (
    id uuid NOT NULL,
    nombre character varying(100) NOT NULL,
    max_workspaces integer NOT NULL,
    max_proyectos_por_workspace integer NOT NULL,
    max_tareas_por_proyecto integer NOT NULL,
    max_lineas_bitacora integer NOT NULL,
    max_miembros_por_workspace integer NOT NULL,
    max_gastos_por_proyecto integer NOT NULL,
    max_presupuestos_por_workspace integer NOT NULL,
    precio double precision NOT NULL,
    activo boolean NOT NULL,
    es_default boolean NOT NULL,
    created_at timestamp without time zone NOT NULL
);
CREATE TABLE public.presupuesto (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    cliente_id uuid NOT NULL,
    proyecto_id uuid,
    numero character varying(50) NOT NULL,
    fecha date NOT NULL,
    estado public.estadopresupuesto NOT NULL,
    total double precision NOT NULL,
    is_locked boolean NOT NULL,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL
);
CREATE TABLE public.presupuestolinea (
    id uuid NOT NULL,
    presupuesto_id uuid NOT NULL,
    articulo_id uuid,
    concepto character varying(500) NOT NULL,
    cantidad double precision NOT NULL,
    precio_unitario double precision NOT NULL,
    subtotal double precision NOT NULL,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL
);
CREATE TABLE public.proyecto (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    cliente_id uuid NOT NULL,
    nombre character varying(255) NOT NULL,
    tarifa_hora double precision NOT NULL,
    alerta_horas_max double precision,
    stopwatch_enabled boolean NOT NULL,
    retainer_horas double precision,
    public_uuid uuid NOT NULL,
    is_public boolean NOT NULL,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL
);
CREATE TABLE public.refreshtoken (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    token character varying NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    revoked boolean NOT NULL,
    created_at timestamp without time zone NOT NULL
);
CREATE TABLE public.retainerciclo (
    id uuid NOT NULL,
    proyecto_id uuid NOT NULL,
    horas_asignadas double precision NOT NULL,
    fecha_inicio date NOT NULL,
    fecha_fin date,
    is_active boolean NOT NULL,
    created_at timestamp without time zone NOT NULL
);
CREATE TABLE public.smtpconfig (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    host character varying(255) NOT NULL,
    port integer NOT NULL,
    username character varying(255) NOT NULL,
    password_encrypted character varying NOT NULL,
    from_email character varying(255) NOT NULL,
    from_name character varying(255) NOT NULL,
    use_tls boolean NOT NULL,
    use_ssl boolean NOT NULL,
    updated_at timestamp without time zone NOT NULL
);
CREATE TABLE public.tag (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    nombre character varying(100) NOT NULL,
    color character varying(7) NOT NULL,
    created_at timestamp without time zone NOT NULL
);
CREATE TABLE public.tarea (
    id uuid NOT NULL,
    proyecto_id uuid NOT NULL,
    descripcion character varying NOT NULL,
    horas double precision NOT NULL,
    fecha date NOT NULL,
    estado_pago public.estadopago NOT NULL,
    is_locked boolean NOT NULL,
    es_backlog boolean NOT NULL,
    estado_kanban public.estadokanban NOT NULL,
    tag_id uuid,
    descripcion_larga character varying,
    github_url character varying(500),
    archivo_url character varying(500),
    prioridad public.prioridad,
    complejidad integer,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL
);
CREATE TABLE public."user" (
    id uuid NOT NULL,
    email character varying(255) NOT NULL,
    password_hash character varying,
    nombre character varying(255) NOT NULL,
    avatar_url character varying,
    plan_id uuid,
    is_active boolean NOT NULL,
    is_superadmin boolean NOT NULL,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL
);
CREATE TABLE public.workspace (
    id uuid NOT NULL,
    nombre character varying(255) NOT NULL,
    owner_id uuid NOT NULL,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL
);
CREATE TABLE public.workspaceinvite (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    email character varying(255) NOT NULL,
    rol public.rolworkspace NOT NULL,
    token character varying NOT NULL,
    invited_by uuid NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    accepted boolean NOT NULL,
    created_at timestamp without time zone NOT NULL
);
CREATE TABLE public.workspacemember (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    rol public.rolworkspace NOT NULL,
    invited_by uuid,
    created_at timestamp without time zone NOT NULL
);
ALTER TABLE ONLY public.articulo
    ADD CONSTRAINT articulo_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.cliente
    ADD CONSTRAINT cliente_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.configuracion
    ADD CONSTRAINT configuracion_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.gasto
    ADD CONSTRAINT gasto_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.passwordresettoken
    ADD CONSTRAINT passwordresettoken_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.plan
    ADD CONSTRAINT plan_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.presupuesto
    ADD CONSTRAINT presupuesto_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.presupuestolinea
    ADD CONSTRAINT presupuestolinea_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.proyecto
    ADD CONSTRAINT proyecto_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.refreshtoken
    ADD CONSTRAINT refreshtoken_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.retainerciclo
    ADD CONSTRAINT retainerciclo_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.smtpconfig
    ADD CONSTRAINT smtpconfig_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.tag
    ADD CONSTRAINT tag_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.tarea
    ADD CONSTRAINT tarea_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public."user"
    ADD CONSTRAINT user_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.workspace
    ADD CONSTRAINT workspace_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.workspaceinvite
    ADD CONSTRAINT workspaceinvite_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.workspacemember
    ADD CONSTRAINT workspacemember_pkey PRIMARY KEY (id);
CREATE INDEX ix_articulo_workspace_id ON public.articulo USING btree (workspace_id);
CREATE INDEX ix_cliente_workspace_id ON public.cliente USING btree (workspace_id);
CREATE UNIQUE INDEX ix_configuracion_workspace_id ON public.configuracion USING btree (workspace_id);
CREATE INDEX ix_gasto_proyecto_fecha ON public.gasto USING btree (proyecto_id, fecha);
CREATE INDEX ix_gasto_proyecto_id ON public.gasto USING btree (proyecto_id);
CREATE UNIQUE INDEX ix_passwordresettoken_token ON public.passwordresettoken USING btree (token);
CREATE INDEX ix_passwordresettoken_user_id ON public.passwordresettoken USING btree (user_id);
CREATE INDEX ix_presupuesto_cliente_id ON public.presupuesto USING btree (cliente_id);
CREATE INDEX ix_presupuesto_workspace_estado ON public.presupuesto USING btree (workspace_id, estado);
CREATE INDEX ix_presupuesto_workspace_id ON public.presupuesto USING btree (workspace_id);
CREATE INDEX ix_presupuestolinea_presupuesto_id ON public.presupuestolinea USING btree (presupuesto_id);
CREATE INDEX ix_proyecto_cliente_id ON public.proyecto USING btree (cliente_id);
CREATE UNIQUE INDEX ix_proyecto_public_uuid ON public.proyecto USING btree (public_uuid);
CREATE INDEX ix_proyecto_workspace_id ON public.proyecto USING btree (workspace_id);
CREATE UNIQUE INDEX ix_refreshtoken_token ON public.refreshtoken USING btree (token);
CREATE INDEX ix_refreshtoken_user_id ON public.refreshtoken USING btree (user_id);
CREATE INDEX ix_retainerciclo_proyecto_id ON public.retainerciclo USING btree (proyecto_id);
CREATE UNIQUE INDEX ix_smtpconfig_user_id ON public.smtpconfig USING btree (user_id);
CREATE INDEX ix_tag_workspace_id ON public.tag USING btree (workspace_id);
CREATE INDEX ix_tarea_estado_kanban ON public.tarea USING btree (estado_kanban);
CREATE INDEX ix_tarea_proyecto_fecha ON public.tarea USING btree (proyecto_id, fecha);
CREATE INDEX ix_tarea_proyecto_id ON public.tarea USING btree (proyecto_id);
CREATE UNIQUE INDEX ix_user_email ON public."user" USING btree (email);
CREATE INDEX ix_workspace_owner_id ON public.workspace USING btree (owner_id);
CREATE UNIQUE INDEX ix_workspaceinvite_token ON public.workspaceinvite USING btree (token);
CREATE INDEX ix_workspaceinvite_workspace_id ON public.workspaceinvite USING btree (workspace_id);
CREATE INDEX ix_workspacemember_user_id ON public.workspacemember USING btree (user_id);
CREATE INDEX ix_workspacemember_workspace_id ON public.workspacemember USING btree (workspace_id);
ALTER TABLE ONLY public.articulo
    ADD CONSTRAINT articulo_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspace(id);
ALTER TABLE ONLY public.cliente
    ADD CONSTRAINT cliente_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspace(id);
ALTER TABLE ONLY public.configuracion
    ADD CONSTRAINT configuracion_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspace(id);
ALTER TABLE ONLY public.gasto
    ADD CONSTRAINT gasto_proyecto_id_fkey FOREIGN KEY (proyecto_id) REFERENCES public.proyecto(id);
ALTER TABLE ONLY public.passwordresettoken
    ADD CONSTRAINT passwordresettoken_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id);
ALTER TABLE ONLY public.presupuesto
    ADD CONSTRAINT presupuesto_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.cliente(id);
ALTER TABLE ONLY public.presupuesto
    ADD CONSTRAINT presupuesto_proyecto_id_fkey FOREIGN KEY (proyecto_id) REFERENCES public.proyecto(id);
ALTER TABLE ONLY public.presupuesto
    ADD CONSTRAINT presupuesto_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspace(id);
ALTER TABLE ONLY public.presupuestolinea
    ADD CONSTRAINT presupuestolinea_articulo_id_fkey FOREIGN KEY (articulo_id) REFERENCES public.articulo(id);
ALTER TABLE ONLY public.presupuestolinea
    ADD CONSTRAINT presupuestolinea_presupuesto_id_fkey FOREIGN KEY (presupuesto_id) REFERENCES public.presupuesto(id);
ALTER TABLE ONLY public.proyecto
    ADD CONSTRAINT proyecto_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.cliente(id);
ALTER TABLE ONLY public.proyecto
    ADD CONSTRAINT proyecto_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspace(id);
ALTER TABLE ONLY public.refreshtoken
    ADD CONSTRAINT refreshtoken_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id);
ALTER TABLE ONLY public.retainerciclo
    ADD CONSTRAINT retainerciclo_proyecto_id_fkey FOREIGN KEY (proyecto_id) REFERENCES public.proyecto(id);
ALTER TABLE ONLY public.smtpconfig
    ADD CONSTRAINT smtpconfig_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id);
ALTER TABLE ONLY public.tag
    ADD CONSTRAINT tag_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspace(id);
ALTER TABLE ONLY public.tarea
    ADD CONSTRAINT tarea_proyecto_id_fkey FOREIGN KEY (proyecto_id) REFERENCES public.proyecto(id);
ALTER TABLE ONLY public.tarea
    ADD CONSTRAINT tarea_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.tag(id);
ALTER TABLE ONLY public."user"
    ADD CONSTRAINT user_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.plan(id);
ALTER TABLE ONLY public.workspace
    ADD CONSTRAINT workspace_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public."user"(id);
ALTER TABLE ONLY public.workspaceinvite
    ADD CONSTRAINT workspaceinvite_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES public."user"(id);
ALTER TABLE ONLY public.workspaceinvite
    ADD CONSTRAINT workspaceinvite_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspace(id);
ALTER TABLE ONLY public.workspacemember
    ADD CONSTRAINT workspacemember_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES public."user"(id);
ALTER TABLE ONLY public.workspacemember
    ADD CONSTRAINT workspacemember_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id);
ALTER TABLE ONLY public.workspacemember
    ADD CONSTRAINT workspacemember_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspace(id);
"""

# Tablas y tipos creados arriba (para el downgrade).
_TABLES = [
    "articulo", "cliente", "configuracion", "gasto", "passwordresettoken",
    "plan", "presupuesto", "presupuestolinea", "proyecto", "refreshtoken",
    "retainerciclo", "smtpconfig", "tag", "tarea", "user", "workspace",
    "workspaceinvite", "workspacemember",
]
_TYPES = ["estadokanban", "estadopago", "estadopresupuesto", "prioridad", "rolworkspace"]


def _statements(sql: str) -> list[str]:
    """Divide el DDL en sentencias individuales (no hay ';' embebidos)."""
    return [s.strip() for s in sql.split(";") if s.strip()]


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    # Idempotencia: si el esquema base ya existe (BD construida con create_all
    # sin stamp de Alembic, p.ej. instalaciones previas), no lo recreamos para
    # no chocar con tablas/tipos ya presentes.
    if sa.inspect(bind).has_table("user"):
        return
    for stmt in _statements(_BASE_DDL):
        op.execute(stmt)


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    for table in _TABLES:
        op.execute(f'DROP TABLE IF EXISTS public."{table}" CASCADE')
    for enum in _TYPES:
        op.execute(f'DROP TYPE IF EXISTS public."{enum}" CASCADE')
