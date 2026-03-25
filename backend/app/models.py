from __future__ import annotations
import uuid
from datetime import datetime, date, timezone
from typing import Optional
from enum import Enum
from sqlmodel import SQLModel, Field
from sqlalchemy import Index


class Plan(SQLModel, table=True):
    __tablename__ = "plan"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    nombre: str = Field(max_length=100)
    max_workspaces: int = 1
    max_proyectos_por_workspace: int = 3
    max_tareas_por_proyecto: int = 50
    max_lineas_bitacora: int = 100
    max_miembros_por_workspace: int = 5
    max_gastos_por_proyecto: int = 50
    max_presupuestos_por_workspace: int = 10
    precio: float = 0.0
    activo: bool = True
    es_default: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))


class User(SQLModel, table=True):
    __tablename__ = "user"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    email: str = Field(unique=True, index=True, max_length=255)
    password_hash: Optional[str] = None
    nombre: str = Field(max_length=255)
    avatar_url: Optional[str] = None
    plan_id: Optional[uuid.UUID] = Field(default=None, foreign_key="plan.id")
    is_active: bool = True
    is_superadmin: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))


class RefreshToken(SQLModel, table=True):
    __tablename__ = "refreshtoken"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    token: str = Field(unique=True, index=True)
    expires_at: datetime
    revoked: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))


class PasswordResetToken(SQLModel, table=True):
    __tablename__ = "passwordresettoken"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    token: str = Field(unique=True, index=True)
    expires_at: datetime
    used: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))


class Workspace(SQLModel, table=True):
    __tablename__ = "workspace"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    nombre: str = Field(max_length=255)
    owner_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))


class RolWorkspace(str, Enum):
    owner = "owner"
    admin = "admin"
    member = "member"
    viewer = "viewer"


class WorkspaceMember(SQLModel, table=True):
    __tablename__ = "workspacemember"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    workspace_id: uuid.UUID = Field(foreign_key="workspace.id", index=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    rol: RolWorkspace = RolWorkspace.member
    invited_by: Optional[uuid.UUID] = Field(default=None, foreign_key="user.id")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))


class WorkspaceInvite(SQLModel, table=True):
    __tablename__ = "workspaceinvite"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    workspace_id: uuid.UUID = Field(foreign_key="workspace.id", index=True)
    email: str = Field(max_length=255)
    rol: RolWorkspace = RolWorkspace.member
    token: str = Field(unique=True, index=True)
    invited_by: uuid.UUID = Field(foreign_key="user.id")
    expires_at: datetime
    accepted: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))


class SMTPConfig(SQLModel, table=True):
    __tablename__ = "smtpconfig"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", unique=True, index=True)
    host: str = Field(max_length=255)
    port: int = 587
    username: str = Field(max_length=255)
    password_encrypted: str
    from_email: str = Field(max_length=255)
    from_name: str = Field(max_length=255)
    use_tls: bool = True
    use_ssl: bool = False
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))


class Cliente(SQLModel, table=True):
    __tablename__ = "cliente"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    workspace_id: uuid.UUID = Field(foreign_key="workspace.id", index=True)
    nombre: str = Field(max_length=255)
    email: Optional[str] = Field(default=None, max_length=255)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))


class Proyecto(SQLModel, table=True):
    __tablename__ = "proyecto"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    workspace_id: uuid.UUID = Field(foreign_key="workspace.id", index=True)
    cliente_id: uuid.UUID = Field(foreign_key="cliente.id", index=True)
    nombre: str = Field(max_length=255)
    tarifa_hora: float = 0.0
    alerta_horas_max: Optional[float] = None
    stopwatch_enabled: bool = False
    retainer_horas: Optional[float] = None
    public_uuid: uuid.UUID = Field(default_factory=uuid.uuid4, unique=True, index=True)
    is_public: bool = False
    sprint_duracion_dias: Optional[int] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))


class RetainerCiclo(SQLModel, table=True):
    __tablename__ = "retainerciclo"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    proyecto_id: uuid.UUID = Field(foreign_key="proyecto.id", index=True)
    horas_asignadas: float
    fecha_inicio: date
    fecha_fin: Optional[date] = None
    is_active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))


class Tag(SQLModel, table=True):
    __tablename__ = "tag"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    workspace_id: uuid.UUID = Field(foreign_key="workspace.id", index=True)
    nombre: str = Field(max_length=100)
    color: str = Field(max_length=7)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))


class EstadoPago(str, Enum):
    pendiente = "pendiente"
    facturado = "facturado"
    cobrado = "cobrado"


class Prioridad(str, Enum):
    critico = "critico"
    alto = "alto"
    medio = "medio"
    bajo = "bajo"


class EstadoKanban(str, Enum):
    backlog = "backlog"
    todo = "todo"
    en_progreso = "en_progreso"
    revision = "revision"
    done = "done"


class Sprint(SQLModel, table=True):
    __tablename__ = "sprint"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    proyecto_id: uuid.UUID = Field(foreign_key="proyecto.id", index=True)
    numero: int
    nombre: str = Field(max_length=100)
    fecha_inicio: date
    fecha_fin: date
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))


class Tarea(SQLModel, table=True):
    __tablename__ = "tarea"
    __table_args__ = (
        Index("ix_tarea_proyecto_fecha", "proyecto_id", "fecha"),
        Index("ix_tarea_estado_kanban", "estado_kanban"),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    proyecto_id: uuid.UUID = Field(foreign_key="proyecto.id", index=True)
    descripcion: str
    horas: float = 0.0
    fecha: date
    estado_pago: EstadoPago = EstadoPago.pendiente
    is_locked: bool = False
    es_backlog: bool = False
    estado_kanban: EstadoKanban = EstadoKanban.todo
    tag_id: Optional[uuid.UUID] = Field(default=None, foreign_key="tag.id")
    descripcion_larga: Optional[str] = None
    github_url: Optional[str] = Field(default=None, max_length=500)
    archivo_url: Optional[str] = Field(default=None, max_length=500)
    prioridad: Optional[Prioridad] = None
    complejidad: Optional[int] = None
    fecha_inicio: Optional[date] = None
    fecha_fin: Optional[date] = None
    sprint_id: Optional[uuid.UUID] = Field(default=None, foreign_key="sprint.id", index=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))


class TipoPagoGasto(str, Enum):
    unico = "unico"
    recurrente = "recurrente"


class PeriodicidadGasto(str, Enum):
    mensual = "mensual"
    trimestral = "trimestral"
    anual = "anual"


class Gasto(SQLModel, table=True):
    __tablename__ = "gasto"
    __table_args__ = (
        Index("ix_gasto_proyecto_fecha", "proyecto_id", "fecha"),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    proyecto_id: uuid.UUID = Field(foreign_key="proyecto.id", index=True)
    concepto: str = Field(max_length=500)
    monto: float
    fecha: date
    tipo_pago: TipoPagoGasto = TipoPagoGasto.unico
    periodicidad: Optional[PeriodicidadGasto] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))


class Articulo(SQLModel, table=True):
    __tablename__ = "articulo"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    workspace_id: uuid.UUID = Field(foreign_key="workspace.id", index=True)
    concepto: str = Field(max_length=500)
    precio_base: float
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))


class EstadoPresupuesto(str, Enum):
    borrador = "borrador"
    enviado = "enviado"
    aceptado = "aceptado"
    rechazado = "rechazado"


class Presupuesto(SQLModel, table=True):
    __tablename__ = "presupuesto"
    __table_args__ = (
        Index("ix_presupuesto_workspace_estado", "workspace_id", "estado"),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    workspace_id: uuid.UUID = Field(foreign_key="workspace.id", index=True)
    cliente_id: uuid.UUID = Field(foreign_key="cliente.id", index=True)
    proyecto_id: Optional[uuid.UUID] = Field(default=None, foreign_key="proyecto.id")
    numero: str = Field(max_length=50)
    fecha: date
    estado: EstadoPresupuesto = EstadoPresupuesto.borrador
    total: float = 0.0
    is_locked: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))


class PresupuestoLinea(SQLModel, table=True):
    __tablename__ = "presupuestolinea"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    presupuesto_id: uuid.UUID = Field(foreign_key="presupuesto.id", index=True)
    articulo_id: Optional[uuid.UUID] = Field(default=None, foreign_key="articulo.id")
    concepto: str = Field(max_length=500)
    cantidad: float
    precio_unitario: float
    subtotal: float
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))


class Subtarea(SQLModel, table=True):
    __tablename__ = "subtarea"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    tarea_id: uuid.UUID = Field(foreign_key="tarea.id", index=True)
    descripcion: str = Field(max_length=500)
    completada: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))


class Comentario(SQLModel, table=True):
    __tablename__ = "comentario"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    tarea_id: uuid.UUID = Field(foreign_key="tarea.id", index=True)
    texto: str = Field(max_length=2000)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))


class Configuracion(SQLModel, table=True):
    __tablename__ = "configuracion"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    workspace_id: uuid.UUID = Field(foreign_key="workspace.id", unique=True, index=True)
    email_template_subject: str = Field(
        default="Presupuesto {{proyecto}} - {{cliente}}",
        max_length=500,
    )
    email_template_body: str = Field(
        default=(
            "Estimado/a {{cliente}},\n\n"
            "Adjunto el presupuesto para el proyecto {{proyecto}} "
            "por un total de {{total}} €.\n\n"
            "Saludos."
        )
    )
    webhook_url: Optional[str] = Field(default=None, max_length=500)
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
