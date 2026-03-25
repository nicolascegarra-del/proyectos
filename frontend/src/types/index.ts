export type RolWorkspace = 'owner' | 'admin' | 'member' | 'viewer'
export type EstadoPago = 'pendiente' | 'facturado' | 'cobrado'
export type EstadoKanban = 'backlog' | 'todo' | 'en_progreso' | 'revision' | 'done'
export type EstadoPresupuesto = 'borrador' | 'enviado' | 'aceptado' | 'rechazado'
export type Prioridad = 'critico' | 'alto' | 'medio' | 'bajo'

export interface Plan {
  id: string
  nombre: string
  max_workspaces: number
  max_proyectos_por_workspace: number
  max_tareas_por_proyecto: number
  max_lineas_bitacora: number
  max_miembros_por_workspace: number
  max_gastos_por_proyecto: number
  max_presupuestos_por_workspace: number
  precio: number
  activo: boolean
  es_default: boolean
  created_at: string
}

export interface User {
  id: string
  email: string
  nombre: string
  avatar_url: string | null
  plan_id: string | null
  is_active: boolean
  is_superadmin: boolean
  created_at: string
}

export interface Workspace {
  id: string
  nombre: string
  owner_id: string
  created_at: string
  updated_at: string
}

export interface WorkspaceMember {
  id: string
  workspace_id: string
  user_id: string
  rol: RolWorkspace
  created_at: string
  user?: User
}

export interface SMTPConfig {
  id: string
  host: string
  port: number
  username: string
  from_email: string
  from_name: string
  use_tls: boolean
  use_ssl: boolean
}

export interface Cliente {
  id: string
  workspace_id: string
  nombre: string
  email: string | null
  created_at: string
  updated_at: string
}

export interface Sprint {
  id: string
  proyecto_id: string
  numero: number
  nombre: string
  fecha_inicio: string
  fecha_fin: string
  created_at: string
  updated_at: string
}

export interface Proyecto {
  id: string
  workspace_id: string
  cliente_id: string
  nombre: string
  tarifa_hora: number
  alerta_horas_max: number | null
  stopwatch_enabled: boolean
  retainer_horas: number | null
  public_uuid: string | null
  sprint_duracion_dias: number | null
  created_at: string
  updated_at: string
}

export interface RetainerCiclo {
  id: string
  proyecto_id: string
  horas_asignadas: number
  fecha_inicio: string
  fecha_fin: string | null
  is_active: boolean
  horas_consumidas: number
  created_at: string
}

export interface Tag {
  id: string
  workspace_id: string
  nombre: string
  color: string
}

export interface Tarea {
  id: string
  proyecto_id: string
  descripcion: string
  horas: number
  fecha: string
  estado_pago: EstadoPago
  is_locked: boolean
  es_backlog: boolean
  estado_kanban: EstadoKanban
  tag_id: string | null
  descripcion_larga: string | null
  github_url: string | null
  archivo_url: string | null
  prioridad: Prioridad | null
  complejidad: number | null
  fecha_inicio: string | null
  fecha_fin: string | null
  sprint_id: string | null
  created_at: string
  updated_at: string
  alerta_horas?: boolean
  alerta_retainer?: boolean
  subtareas_total?: number
  subtareas_completadas?: number
}

export interface ClienteStats {
  proyectos: number
  tareas: number
  horas_totales: number
  ingresos_totales: number
}

export interface Subtarea {
  id: string
  tarea_id: string
  descripcion: string
  completada: boolean
  created_at: string
  updated_at: string
}

export interface Gasto {
  id: string
  proyecto_id: string
  concepto: string
  monto: number
  fecha: string
  created_at: string
  updated_at: string
}

export interface Articulo {
  id: string
  workspace_id: string
  concepto: string
  precio_base: number
  created_at: string
  updated_at: string
}

export interface Presupuesto {
  id: string
  workspace_id: string
  cliente_id: string
  proyecto_id: string | null
  numero: string
  fecha: string
  estado: EstadoPresupuesto
  total: number
  is_locked: boolean
  created_at: string
  updated_at: string
}

export interface PresupuestoLinea {
  id: string
  presupuesto_id: string
  articulo_id: string | null
  concepto: string
  cantidad: number
  precio_unitario: number
  subtotal: number
  created_at: string
  updated_at: string
}

export interface Configuracion {
  id: string
  workspace_id: string
  email_template_subject: string
  email_template_body: string
  webhook_url: string | null
  updated_at: string
}

export interface DashboardData {
  total_horas: number
  total_ingresos: number
  total_gastos: number
  margen_neto: number
  proyectos_activos: number
  actividad_heatmap: { date: string; horas: number }[]
}

export interface TokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
}

export interface SyncConflict {
  id: string
  entity: string
  client_data: Record<string, unknown>
  server_data: Record<string, unknown>
  server_updated_at: string
}

export interface SyncResponse {
  synced_at: string
  applied: string[]
  conflicts: SyncConflict[]
  server_updates: Record<string, Record<string, unknown>[]>
}

export interface LimitError {
  message: string
  limit: number
  current: number
  resource: string
  plan: string
}

export interface ApiError {
  detail: string | LimitError
}
