from __future__ import annotations
import ipaddress
import re
import uuid
from datetime import datetime, date
from typing import Optional, Any
from urllib.parse import urlparse
from pydantic import BaseModel, EmailStr, Field, field_validator

from app.models import (
    EstadoKanban,
    EstadoPago,
    EstadoPresupuesto,
    RolWorkspace,
)


# ── Auth ──────────────────────────────────────────────────────────────────────

_WEAK_PASSWORDS = {"changeme", "password", "12345678", "qwerty123", "admin1234"}


def _validate_password(v: str) -> str:
    if len(v) < 8:
        raise ValueError("La contraseña debe tener al menos 8 caracteres")
    if not re.search(r"[A-Z]", v):
        raise ValueError("La contraseña debe contener al menos una letra mayúscula")
    if not re.search(r"[0-9]", v):
        raise ValueError("La contraseña debe contener al menos un número")
    if not re.search(r"[^A-Za-z0-9]", v):
        raise ValueError("La contraseña debe contener al menos un carácter especial")
    if v.lower() in _WEAK_PASSWORDS:
        raise ValueError("La contraseña es demasiado común")
    return v


def _validate_webhook_url(v: Optional[str]) -> Optional[str]:
    if v is None:
        return v
    try:
        parsed = urlparse(v)
    except Exception:
        raise ValueError("URL de webhook inválida")
    if parsed.scheme != "https":
        raise ValueError("El webhook debe usar HTTPS")
    hostname = parsed.hostname or ""
    try:
        addr = ipaddress.ip_address(hostname)
        if addr.is_private or addr.is_loopback or addr.is_link_local:
            raise ValueError("El webhook no puede apuntar a una dirección privada o interna")
    except ValueError as e:
        if "El webhook" in str(e):
            raise
    return v


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    nombre: str

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        return _validate_password(v)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        return _validate_password(v)


class UserOut(BaseModel):
    id: uuid.UUID
    email: str
    nombre: str
    avatar_url: Optional[str]
    plan_id: Optional[uuid.UUID]
    is_active: bool
    is_superadmin: bool
    created_at: datetime
    model_config = {"from_attributes": True}


class UserPublicOut(BaseModel):
    """UserOut sin is_superadmin para listados de miembros."""
    id: uuid.UUID
    email: str
    nombre: str
    avatar_url: Optional[str]
    plan_id: Optional[uuid.UUID]
    is_active: bool
    created_at: datetime
    model_config = {"from_attributes": True}


class UserUpdateRequest(BaseModel):
    nombre: Optional[str] = None
    avatar_url: Optional[str] = None
    current_password: Optional[str] = None
    new_password: Optional[str] = None


# ── Plan ──────────────────────────────────────────────────────────────────────

class PlanCreate(BaseModel):
    nombre: str
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


class PlanUpdate(BaseModel):
    nombre: Optional[str] = None
    max_workspaces: Optional[int] = None
    max_proyectos_por_workspace: Optional[int] = None
    max_tareas_por_proyecto: Optional[int] = None
    max_lineas_bitacora: Optional[int] = None
    max_miembros_por_workspace: Optional[int] = None
    max_gastos_por_proyecto: Optional[int] = None
    max_presupuestos_por_workspace: Optional[int] = None
    precio: Optional[float] = None
    activo: Optional[bool] = None
    es_default: Optional[bool] = None


class PlanOut(BaseModel):
    id: uuid.UUID
    nombre: str
    max_workspaces: int
    max_proyectos_por_workspace: int
    max_tareas_por_proyecto: int
    max_lineas_bitacora: int
    max_miembros_por_workspace: int
    max_gastos_por_proyecto: int
    max_presupuestos_por_workspace: int
    precio: float
    activo: bool
    es_default: bool
    created_at: datetime
    model_config = {"from_attributes": True}


# ── Workspace ─────────────────────────────────────────────────────────────────

class WorkspaceCreate(BaseModel):
    nombre: str


class WorkspaceUpdate(BaseModel):
    nombre: str


class WorkspaceOut(BaseModel):
    id: uuid.UUID
    nombre: str
    owner_id: uuid.UUID
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class WorkspaceMemberOut(BaseModel):
    id: uuid.UUID
    workspace_id: uuid.UUID
    user_id: uuid.UUID
    rol: RolWorkspace
    created_at: datetime
    user: Optional[UserPublicOut] = None
    model_config = {"from_attributes": True}


class InviteRequest(BaseModel):
    email: EmailStr
    rol: RolWorkspace = RolWorkspace.member


class UpdateMemberRolRequest(BaseModel):
    rol: RolWorkspace


class AssignPlanRequest(BaseModel):
    plan_id: uuid.UUID


# ── SMTP ──────────────────────────────────────────────────────────────────────

class SMTPConfigCreate(BaseModel):
    host: str
    port: int = 587
    username: str
    password: str
    from_email: EmailStr
    from_name: str
    use_tls: bool = True
    use_ssl: bool = False


class SMTPConfigUpdate(BaseModel):
    host: Optional[str] = None
    port: Optional[int] = None
    username: Optional[str] = None
    password: Optional[str] = None
    from_email: Optional[EmailStr] = None
    from_name: Optional[str] = None
    use_tls: Optional[bool] = None
    use_ssl: Optional[bool] = None


class SMTPConfigOut(BaseModel):
    id: uuid.UUID
    host: str
    port: int
    username: str
    from_email: str
    from_name: str
    use_tls: bool
    use_ssl: bool
    model_config = {"from_attributes": True}


# ── Cliente ───────────────────────────────────────────────────────────────────

class ClienteCreate(BaseModel):
    nombre: str
    email: Optional[EmailStr] = None


class ClienteUpdate(BaseModel):
    nombre: Optional[str] = None
    email: Optional[EmailStr] = None


class ClienteOut(BaseModel):
    id: uuid.UUID
    workspace_id: uuid.UUID
    nombre: str
    email: Optional[str]
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


# ── Proyecto ──────────────────────────────────────────────────────────────────

class ProyectoCreate(BaseModel):
    cliente_id: uuid.UUID
    nombre: str
    tarifa_hora: float = 0.0
    alerta_horas_max: Optional[float] = None
    stopwatch_enabled: bool = False
    retainer_horas: Optional[float] = None


class ProyectoUpdate(BaseModel):
    nombre: Optional[str] = None
    cliente_id: Optional[uuid.UUID] = None
    tarifa_hora: Optional[float] = None
    alerta_horas_max: Optional[float] = None
    stopwatch_enabled: Optional[bool] = None
    retainer_horas: Optional[float] = None
    is_public: Optional[bool] = None


class ProyectoOut(BaseModel):
    id: uuid.UUID
    workspace_id: uuid.UUID
    cliente_id: uuid.UUID
    nombre: str
    tarifa_hora: float
    alerta_horas_max: Optional[float]
    stopwatch_enabled: bool
    retainer_horas: Optional[float]
    public_uuid: uuid.UUID
    is_public: bool
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


# ── RetainerCiclo ─────────────────────────────────────────────────────────────

class RetainerCicloCreate(BaseModel):
    horas_asignadas: float
    fecha_inicio: date


class RetainerCicloOut(BaseModel):
    id: uuid.UUID
    proyecto_id: uuid.UUID
    horas_asignadas: float
    fecha_inicio: date
    fecha_fin: Optional[date]
    is_active: bool
    horas_consumidas: float = 0.0
    created_at: datetime
    model_config = {"from_attributes": True}


# ── Tag ───────────────────────────────────────────────────────────────────────

class TagCreate(BaseModel):
    nombre: str
    color: str

    @field_validator("color")
    @classmethod
    def valid_hex(cls, v: str) -> str:
        if not v.startswith("#") or len(v) not in (4, 7):
            raise ValueError("Color debe ser un hex válido (#RGB o #RRGGBB)")
        return v


class TagUpdate(BaseModel):
    nombre: Optional[str] = None
    color: Optional[str] = None


class TagOut(BaseModel):
    id: uuid.UUID
    workspace_id: uuid.UUID
    nombre: str
    color: str
    model_config = {"from_attributes": True}


# ── Tarea ─────────────────────────────────────────────────────────────────────

class TareaCreate(BaseModel):
    descripcion: str
    horas: float = Field(default=0.0, ge=0, le=24)
    fecha: date
    estado_pago: EstadoPago = EstadoPago.pendiente
    es_backlog: bool = False
    estado_kanban: EstadoKanban = EstadoKanban.todo
    tag_id: Optional[uuid.UUID] = None


class TareaUpdate(BaseModel):
    descripcion: Optional[str] = None
    horas: Optional[float] = Field(default=None, ge=0, le=24)
    fecha: Optional[date] = None
    estado_pago: Optional[EstadoPago] = None
    is_locked: Optional[bool] = None
    es_backlog: Optional[bool] = None
    estado_kanban: Optional[EstadoKanban] = None
    tag_id: Optional[uuid.UUID] = None


class TareaOut(BaseModel):
    id: uuid.UUID
    proyecto_id: uuid.UUID
    descripcion: str
    horas: float
    fecha: date
    estado_pago: EstadoPago
    is_locked: bool
    es_backlog: bool
    estado_kanban: EstadoKanban
    tag_id: Optional[uuid.UUID]
    created_at: datetime
    updated_at: datetime
    alerta_horas: bool = False
    alerta_retainer: bool = False
    model_config = {"from_attributes": True}


# ── Gasto ─────────────────────────────────────────────────────────────────────

class GastoCreate(BaseModel):
    concepto: str
    monto: float = Field(gt=0)
    fecha: date


class GastoUpdate(BaseModel):
    concepto: Optional[str] = None
    monto: Optional[float] = Field(default=None, gt=0)
    fecha: Optional[date] = None


class GastoOut(BaseModel):
    id: uuid.UUID
    proyecto_id: uuid.UUID
    concepto: str
    monto: float
    fecha: date
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


# ── Artículo ──────────────────────────────────────────────────────────────────

class ArticuloCreate(BaseModel):
    concepto: str
    precio_base: float


class ArticuloUpdate(BaseModel):
    concepto: Optional[str] = None
    precio_base: Optional[float] = None


class ArticuloOut(BaseModel):
    id: uuid.UUID
    workspace_id: uuid.UUID
    concepto: str
    precio_base: float
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


# ── Presupuesto ───────────────────────────────────────────────────────────────

class PresupuestoCreate(BaseModel):
    cliente_id: uuid.UUID
    proyecto_id: Optional[uuid.UUID] = None
    fecha: date


class PresupuestoUpdate(BaseModel):
    cliente_id: Optional[uuid.UUID] = None
    proyecto_id: Optional[uuid.UUID] = None
    fecha: Optional[date] = None
    estado: Optional[EstadoPresupuesto] = None
    is_locked: Optional[bool] = None


class PresupuestoOut(BaseModel):
    id: uuid.UUID
    workspace_id: uuid.UUID
    cliente_id: uuid.UUID
    proyecto_id: Optional[uuid.UUID]
    numero: str
    fecha: date
    estado: EstadoPresupuesto
    total: float
    is_locked: bool
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class PresupuestoLineaCreate(BaseModel):
    articulo_id: Optional[uuid.UUID] = None
    concepto: str
    cantidad: float = Field(gt=0)
    precio_unitario: float = Field(ge=0)


class PresupuestoLineaUpdate(BaseModel):
    concepto: Optional[str] = None
    cantidad: Optional[float] = Field(default=None, gt=0)
    precio_unitario: Optional[float] = Field(default=None, ge=0)
    articulo_id: Optional[uuid.UUID] = None


class PresupuestoLineaOut(BaseModel):
    id: uuid.UUID
    presupuesto_id: uuid.UUID
    articulo_id: Optional[uuid.UUID]
    concepto: str
    cantidad: float
    precio_unitario: float
    subtotal: float
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class SendEmailRequest(BaseModel):
    to_email: EmailStr
    custom_subject: Optional[str] = None
    custom_body: Optional[str] = None


# ── Configuracion ─────────────────────────────────────────────────────────────

class ConfiguracionUpdate(BaseModel):
    email_template_subject: Optional[str] = None
    email_template_body: Optional[str] = None
    webhook_url: Optional[str] = None

    @field_validator("webhook_url")
    @classmethod
    def validate_webhook(cls, v: Optional[str]) -> Optional[str]:
        return _validate_webhook_url(v)


class ConfiguracionOut(BaseModel):
    id: uuid.UUID
    workspace_id: uuid.UUID
    email_template_subject: str
    email_template_body: str
    webhook_url: Optional[str]
    updated_at: datetime
    model_config = {"from_attributes": True}


# ── Sync ──────────────────────────────────────────────────────────────────────

class SyncChange(BaseModel):
    entity: str
    id: uuid.UUID
    action: str
    data: dict[str, Any]
    client_updated_at: datetime


class SyncRequest(BaseModel):
    last_sync_at: Optional[datetime] = None
    changes: list[SyncChange] = []


class SyncConflict(BaseModel):
    id: uuid.UUID
    entity: str
    client_data: dict[str, Any]
    server_data: dict[str, Any]
    server_updated_at: datetime


class SyncResponse(BaseModel):
    synced_at: datetime
    applied: list[uuid.UUID]
    conflicts: list[SyncConflict]
    server_updates: dict[str, list[dict[str, Any]]]


# ── Dashboard ─────────────────────────────────────────────────────────────────

class DashboardOut(BaseModel):
    total_horas: float
    total_ingresos: float
    total_gastos: float
    margen_neto: float
    proyectos_activos: int
    actividad_heatmap: list[dict[str, Any]]


# ── Public ────────────────────────────────────────────────────────────────────

class PublicTareaOut(BaseModel):
    id: uuid.UUID
    proyecto_id: uuid.UUID
    descripcion: str
    horas: float
    fecha: date
    estado_kanban: EstadoKanban
    tag_id: Optional[uuid.UUID]
    created_at: datetime
    model_config = {"from_attributes": True}


class PublicProyectoOut(BaseModel):
    id: uuid.UUID
    nombre: str
    cliente_nombre: str
    total_horas: float
    total_gastos: float
    tareas: list[PublicTareaOut]


# ── Superadmin ────────────────────────────────────────────────────────────────

class SuperadminMetrics(BaseModel):
    total_users: int
    active_users: int
    total_workspaces: int
    users_by_plan: list[dict[str, Any]]
