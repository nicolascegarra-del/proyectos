import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from '@tanstack/react-router'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { api, getErrorMessage } from '@/lib/api'
import type { Gasto, KanbanEstado, Proyecto, RetainerCiclo, Sprint, Tag, Tarea } from '@/types'
import { KanbanBoard } from '@/components/kanban/KanbanBoard'
import { GanttView } from '@/components/gantt/GanttView'
import { Stopwatch } from '@/components/stopwatch/Stopwatch'
import { TareaModal } from '@/components/tareas/TareaModal'
import { formatEUR, formatHoras, today } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { AlertDialog } from '@/components/ui/alert-dialog'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DatePicker } from '@/components/ui/date-picker'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertTriangle, ArrowLeft, ChevronDown, ChevronUp, Copy, Download, FileSpreadsheet, Pencil, Plus, Settings2, Trash2, X } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { exportSprintsExcel, exportSprintsPDF, exportTareasExcel, exportGastosExcel } from '@/lib/export'
import { toast } from '@/components/ui/use-toast'
import { enqueueSync, db, upsertLocal } from '@/lib/db'
import { useSyncStore } from '@/store/syncStore'
import { useAuthStore } from '@/store/authStore'
import { NotasTab } from '@/components/proyectos/NotasTab'
import { EquipoTab } from '@/components/proyectos/EquipoTab'
import type { RolWorkspace, WorkspaceMember } from '@/types'

export default function ProyectoDetailPage() {
  const { proyectoId } = useParams({ strict: false }) as { proyectoId: string }
  const currentWorkspace = useWorkspaceStore((s) => s.currentWorkspace)
  const online = useSyncStore((s) => s.online)
  const { incrementPending } = useSyncStore()
  const navigate = useNavigate()
  const currentUser = useAuthStore((s) => s.user)
  const [currentRol, setCurrentRol] = useState<RolWorkspace | undefined>()

  const [proyecto, setProyecto] = useState<Proyecto | null>(null)
  const [tareas, setTareas] = useState<Tarea[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [ciclo, setCiclo] = useState<RetainerCiclo | null>(null)
  const [loading, setLoading] = useState(true)

  // Modal de tarea: null = cerrado, 'new' = crear, Tarea = editar
  const [modalTarea, setModalTarea] = useState<Tarea | 'new' | null>(null)

  // Kanban estados
  const [kanbanEstados, setKanbanEstados] = useState<KanbanEstado[]>([])
  const [kanbanSprintFilter, setKanbanSprintFilter] = useState<string>('all')
  const [estadosModalOpen, setEstadosModalOpen] = useState(false)
  const [editingEstado, setEditingEstado] = useState<KanbanEstado | null>(null)
  const [newEstadoNombre, setNewEstadoNombre] = useState('')
  const [savingEstado, setSavingEstado] = useState(false)

  // Sprints
  const [sprints, setSprints] = useState<Sprint[]>([])
  const [sprintModal, setSprintModal] = useState<Sprint | 'new' | null>(null)
  const [sprintForm, setSprintForm] = useState({ nombre: '', fecha_inicio: '', duracion: '14' })
  const [savingSprint, setSavingSprint] = useState(false)
  const [deletingSprint, setDeletingSprint] = useState<Sprint | null>(null)

  // Gastos
  const [gastos, setGastos] = useState<Gasto[]>([])
  const [gastoModal, setGastoModal] = useState<Gasto | 'new' | null>(null)
  const [deletingGasto, setDeletingGasto] = useState<Gasto | null>(null)
  const [gastoForm, setGastoForm] = useState({ concepto: '', monto: '', fecha: today(), tipo_pago: 'unico' as 'unico' | 'recurrente', periodicidad: '' })
  const [savingGasto, setSavingGasto] = useState(false)
  const gastoConceptoRef = useRef<HTMLInputElement>(null)

  const load = async () => {
    if (!currentWorkspace) return
    setLoading(true)
    try {
      const [pRes, tRes, tagRes, gRes, sRes, keRes] = await Promise.all([
        api.get<Proyecto>(`/workspaces/${currentWorkspace.id}/proyectos/${proyectoId}`),
        api.get<Tarea[]>(`/workspaces/${currentWorkspace.id}/proyectos/${proyectoId}/tareas`),
        api.get<Tag[]>(`/workspaces/${currentWorkspace.id}/tags`),
        api.get<Gasto[]>(`/workspaces/${currentWorkspace.id}/proyectos/${proyectoId}/gastos`),
        api.get<Sprint[]>(`/workspaces/${currentWorkspace.id}/proyectos/${proyectoId}/sprints`),
        api.get<KanbanEstado[]>(`/workspaces/${currentWorkspace.id}/proyectos/${proyectoId}/kanban-estados`),
      ])
      setProyecto(pRes.data)
      setTareas(applyKanbanOrder(tRes.data))
      setTags(tagRes.data)
      setGastos(gRes.data)
      setSprints(sRes.data)
      setKanbanEstados(keRes.data)

      const ciclosRes = await api.get<RetainerCiclo[]>(
        `/workspaces/${currentWorkspace.id}/proyectos/${proyectoId}/retainer-ciclos`,
      )
      const active = ciclosRes.data.find((c) => c.is_active) ?? null
      setCiclo(active)

      if (currentUser) {
        try {
          const wsMembers = await api.get<WorkspaceMember[]>(`/workspaces/${currentWorkspace.id}/members`)
          const me = wsMembers.data.find(m => m.user_id === currentUser.id)
          setCurrentRol(me?.rol)
        } catch {
          // sin permisos para listar miembros: dejamos rol undefined
        }
      }
    } catch (err) {
      toast({ title: getErrorMessage(err), variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [proyectoId, currentWorkspace?.id])

  const handleTareaSaved = async (saved: Tarea) => {
    setTareas((prev) =>
      prev.some((t) => t.id === saved.id)
        ? prev.map((t) => (t.id === saved.id ? saved : t))
        : [...prev, saved],
    )
    await upsertLocal(db.tareas, saved)
    if (saved.alerta_horas) toast({ title: 'Has alcanzado el límite de horas del proyecto' })
    if (saved.alerta_retainer) toast({ title: 'Has superado la bolsa de horas del retainer' })
  }

  const handleTareaDeleted = (id: string) => {
    setTareas((prev) => prev.filter((t) => t.id !== id))
  }

  const handleStopwatchStop = async (horas: number) => {
    if (!currentWorkspace) return
    const taskData = {
      descripcion: 'Tiempo registrado con cronómetro',
      horas,
      fecha: today(),
    }
    if (online) {
      try {
        const { data } = await api.post<Tarea>(
          `/workspaces/${currentWorkspace.id}/proyectos/${proyectoId}/tareas`,
          taskData,
        )
        setTareas((t) => [...t, data])
        await upsertLocal(db.tareas, data)
        toast({ title: `Registradas ${formatHoras(horas)}` })
      } catch (err) {
        toast({ title: getErrorMessage(err), variant: 'destructive' })
      }
    } else {
      const localTask: Tarea = {
        id: crypto.randomUUID(),
        proyecto_id: proyectoId,
        descripcion: taskData.descripcion,
        horas: taskData.horas,
        fecha: taskData.fecha,
        estado_pago: 'pendiente',
        is_locked: false,
        es_backlog: false,
        estado_kanban: 'todo',
        tag_id: null,
        descripcion_larga: null,
        github_url: null,
        archivo_url: null,
        prioridad: null,
        complejidad: null,
        fecha_inicio: null,
        fecha_fin: null,
        sprint_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      setTareas((t) => [...t, localTask])
      await upsertLocal(db.tareas, localTask, false)
      await enqueueSync('tarea', localTask.id, 'create', localTask as unknown as Record<string, unknown>)
      incrementPending()
      toast({ title: `Guardado offline: ${formatHoras(horas)}` })
    }
  }

  const handleMoveCard = async (tareaId: string, newEstado: string) => {
    if (!currentWorkspace) return
    const prevEstado = tareas.find((t) => t.id === tareaId)?.estado_kanban
    setTareas((t) =>
      t.map((task) =>
        task.id === tareaId ? { ...task, estado_kanban: newEstado } : task,
      ),
    )
    if (online) {
      try {
        await api.put(
          `/workspaces/${currentWorkspace.id}/proyectos/${proyectoId}/tareas/${tareaId}`,
          { estado_kanban: newEstado },
        )
      } catch {
        if (prevEstado) {
          setTareas((t) =>
            t.map((task) =>
              task.id === tareaId ? { ...task, estado_kanban: prevEstado } : task,
            ),
          )
        }
        toast({ title: 'Error al mover la tarea', variant: 'destructive' })
      }
    } else {
      await enqueueSync('tarea', tareaId, 'update', { estado_kanban: newEstado })
      incrementPending()
    }
  }

  const getKanbanOrder = (): Record<string, string[]> => {
    try {
      return JSON.parse(localStorage.getItem(`kanban_order_${proyectoId}`) ?? '{}')
    } catch {
      return {}
    }
  }

  const saveKanbanOrder = (estadoId: string, orderedIds: string[]) => {
    const current = getKanbanOrder()
    localStorage.setItem(`kanban_order_${proyectoId}`, JSON.stringify({ ...current, [estadoId]: orderedIds }))
  }

  const applyKanbanOrder = (rawTareas: Tarea[]): Tarea[] => {
    const order = getKanbanOrder()
    const estadoIds = [...new Set(rawTareas.map((t) => t.estado_kanban))]
    const result: Tarea[] = []
    for (const estadoId of estadoIds) {
      const colTareas = rawTareas.filter((t) => t.estado_kanban === estadoId)
      const ids = order[estadoId]
      if (!ids) { result.push(...colTareas); continue }
      const indexed = new Map(colTareas.map((t) => [t.id, t]))
      const ordered = ids.flatMap((id) => indexed.has(id) ? [indexed.get(id)!] : [])
      const rest = colTareas.filter((t) => !ids.includes(t.id))
      result.push(...ordered, ...rest)
    }
    return result
  }

  const handleReorderCards = (estadoId: string, orderedIds: string[]) => {
    saveKanbanOrder(estadoId, orderedIds)
    setTareas((prev) => {
      const others = prev.filter((t) => t.estado_kanban !== estadoId)
      const colTareas = prev.filter((t) => t.estado_kanban === estadoId)
      const indexed = new Map(colTareas.map((t) => [t.id, t]))
      const reordered = orderedIds.flatMap((id) => indexed.has(id) ? [indexed.get(id)!] : [])
      return [...others, ...reordered]
    })
  }

  // ── Kanban estados handlers ──────────────────────────────────────────────────
  const handleCreateEstado = async () => {
    if (!currentWorkspace || !newEstadoNombre.trim()) return
    setSavingEstado(true)
    try {
      const res = await api.post<KanbanEstado>(
        `/workspaces/${currentWorkspace.id}/proyectos/${proyectoId}/kanban-estados`,
        { nombre: newEstadoNombre.trim(), color: '#6B7280', es_final: false },
      )
      setKanbanEstados((prev) => [...prev, res.data])
      setNewEstadoNombre('')
    } catch (err) {
      toast({ title: getErrorMessage(err), variant: 'destructive' })
    } finally {
      setSavingEstado(false)
    }
  }

  const handleUpdateEstado = async (estado: KanbanEstado, patch: Partial<KanbanEstado>) => {
    if (!currentWorkspace) return
    const updated = { ...estado, ...patch }
    setKanbanEstados((prev) => prev.map((e) => (e.id === estado.id ? updated : e)))
    try {
      await api.put(
        `/workspaces/${currentWorkspace.id}/proyectos/${proyectoId}/kanban-estados/${estado.id}`,
        patch,
      )
    } catch (err) {
      setKanbanEstados((prev) => prev.map((e) => (e.id === estado.id ? estado : e)))
      toast({ title: getErrorMessage(err), variant: 'destructive' })
    }
  }

  const handleDeleteEstado = async (estado: KanbanEstado) => {
    if (!currentWorkspace) return
    try {
      await api.delete(
        `/workspaces/${currentWorkspace.id}/proyectos/${proyectoId}/kanban-estados/${estado.id}`,
      )
      setKanbanEstados((prev) => prev.filter((e) => e.id !== estado.id))
    } catch (err) {
      toast({ title: getErrorMessage(err), variant: 'destructive' })
    }
  }

  const handleMoveEstado = async (estado: KanbanEstado, direction: 'up' | 'down') => {
    if (!currentWorkspace) return
    const sorted = [...kanbanEstados].sort((a, b) => a.orden - b.orden)
    const idx = sorted.findIndex((e) => e.id === estado.id)
    if (direction === 'up' && idx === 0) return
    if (direction === 'down' && idx === sorted.length - 1) return
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    const newOrder = sorted.map((e) => e.id)
    ;[newOrder[idx], newOrder[swapIdx]] = [newOrder[swapIdx], newOrder[idx]]
    const reordered = newOrder.map((id, i) => {
      const e = kanbanEstados.find((e) => e.id === id)!
      return { ...e, orden: i + 1 }
    })
    setKanbanEstados(reordered)
    try {
      await api.put(
        `/workspaces/${currentWorkspace.id}/proyectos/${proyectoId}/kanban-estados/reorder/bulk`,
        { ids: newOrder },
      )
    } catch (err) {
      setKanbanEstados(sorted)
      toast({ title: getErrorMessage(err), variant: 'destructive' })
    }
  }

  const openSprintModal = (s: Sprint | 'new') => {
    if (s === 'new') {
      const lastSprint = sprints[sprints.length - 1]
      const duracion = String(proyecto?.sprint_duracion_dias ?? 14)
      if (lastSprint) {
        const next = new Date(lastSprint.fecha_fin)
        next.setDate(next.getDate() + 1)
        setSprintForm({ nombre: `Sprint ${sprints.length + 1}`, fecha_inicio: next.toISOString().split('T')[0], duracion })
      } else {
        setSprintForm({ nombre: 'Sprint 1', fecha_inicio: today(), duracion })
      }
    } else {
      const dur = Math.round((new Date(s.fecha_fin).getTime() - new Date(s.fecha_inicio).getTime()) / 86400000) + 1
      setSprintForm({ nombre: s.nombre, fecha_inicio: s.fecha_inicio, duracion: String(dur) })
    }
    setSprintModal(s)
  }

  const handleSprintSave = async () => {
    if (!currentWorkspace || !proyecto) return
    const duracion = parseInt(sprintForm.duracion)
    if (!sprintForm.nombre || !sprintForm.fecha_inicio || isNaN(duracion) || duracion < 1) return
    const end = new Date(sprintForm.fecha_inicio)
    end.setDate(end.getDate() + duracion - 1)
    const fecha_fin = end.toISOString().split('T')[0]
    setSavingSprint(true)
    try {
      if (sprintModal === 'new') {
        const { data } = await api.post<Sprint>(
          `/workspaces/${currentWorkspace.id}/proyectos/${proyectoId}/sprints`,
          { numero: sprints.length + 1, nombre: sprintForm.nombre, fecha_inicio: sprintForm.fecha_inicio, fecha_fin },
        )
        setSprints((prev) => [...prev, data])
        setProyecto((prev) => prev ? { ...prev, sprint_duracion_dias: duracion } : prev)
        toast({ title: 'Sprint creado' })
      } else {
        const { data } = await api.put<Sprint>(
          `/workspaces/${currentWorkspace.id}/proyectos/${proyectoId}/sprints/${(sprintModal as Sprint).id}`,
          { nombre: sprintForm.nombre, fecha_inicio: sprintForm.fecha_inicio, fecha_fin },
        )
        setSprints((prev) => prev.map((s) => (s.id === data.id ? data : s)))
        toast({ title: 'Sprint actualizado' })
      }
      setSprintModal(null)
    } catch (err) {
      toast({ title: getErrorMessage(err), variant: 'destructive' })
    } finally {
      setSavingSprint(false)
    }
  }

  const handleSprintDelete = async () => {
    if (!currentWorkspace || !deletingSprint) return
    try {
      await api.delete(`/workspaces/${currentWorkspace.id}/proyectos/${proyectoId}/sprints/${deletingSprint.id}`)
      setSprints((prev) => prev.filter((s) => s.id !== deletingSprint.id))
      setTareas((prev) => prev.map((t) => t.sprint_id === deletingSprint.id ? { ...t, sprint_id: null } : t))
      toast({ title: 'Sprint eliminado' })
    } catch (err) {
      toast({ title: getErrorMessage(err), variant: 'destructive' })
    } finally {
      setDeletingSprint(null)
    }
  }

  const handleAssignSprint = async (tareaId: string, sprintId: string | null) => {
    if (!currentWorkspace) return
    setTareas((prev) => prev.map((t) => t.id === tareaId ? { ...t, sprint_id: sprintId } : t))
    try {
      await api.put(
        `/workspaces/${currentWorkspace.id}/proyectos/${proyectoId}/tareas/${tareaId}`,
        { sprint_id: sprintId },
      )
    } catch (err) {
      toast({ title: getErrorMessage(err), variant: 'destructive' })
      await load()
    }
  }

  const openGastoModal = (g: Gasto | 'new') => {
    if (g === 'new') {
      setGastoForm({ concepto: '', monto: '', fecha: today(), tipo_pago: 'unico', periodicidad: '' })
    } else {
      setGastoForm({ concepto: g.concepto, monto: String(g.monto), fecha: g.fecha, tipo_pago: g.tipo_pago, periodicidad: g.periodicidad ?? '' })
    }
    setGastoModal(g)
    setTimeout(() => gastoConceptoRef.current?.focus(), 50)
  }

  const handleGastoSave = async () => {
    if (!currentWorkspace) return
    const concepto = gastoForm.concepto.trim()
    const monto = parseFloat(gastoForm.monto)
    if (!concepto || isNaN(monto) || monto <= 0) {
      toast({ title: 'Concepto y monto válido son obligatorios', variant: 'destructive' })
      return
    }
    setSavingGasto(true)
    try {
      const gastoPayload = {
        concepto, monto, fecha: gastoForm.fecha,
        tipo_pago: gastoForm.tipo_pago,
        periodicidad: gastoForm.tipo_pago === 'recurrente' && gastoForm.periodicidad ? gastoForm.periodicidad : null,
      }
    if (gastoModal === 'new') {
        const { data } = await api.post<Gasto>(
          `/workspaces/${currentWorkspace.id}/proyectos/${proyectoId}/gastos`,
          gastoPayload,
        )
        setGastos((prev) => [data, ...prev])
        toast({ title: 'Gasto creado' })
      } else if (gastoModal) {
        const { data } = await api.put<Gasto>(
          `/workspaces/${currentWorkspace.id}/proyectos/${proyectoId}/gastos/${gastoModal.id}`,
          gastoPayload,
        )
        setGastos((prev) => prev.map((g) => (g.id === data.id ? data : g)))
        toast({ title: 'Gasto actualizado' })
      }
      setGastoModal(null)
    } catch (err) {
      toast({ title: getErrorMessage(err), variant: 'destructive' })
    } finally {
      setSavingGasto(false)
    }
  }

  const handleGastoDelete = async () => {
    if (!currentWorkspace || !deletingGasto) return
    try {
      await api.delete(
        `/workspaces/${currentWorkspace.id}/proyectos/${proyectoId}/gastos/${deletingGasto.id}`,
      )
      setGastos((prev) => prev.filter((g) => g.id !== deletingGasto.id))
      toast({ title: 'Gasto eliminado' })
    } catch (err) {
      toast({ title: getErrorMessage(err), variant: 'destructive' })
    } finally {
      setDeletingGasto(null)
    }
  }

  const copyPublicLink = () => {
    if (!proyecto || !proyecto.public_uuid) return
    const url = `${window.location.origin}/p/${proyecto.public_uuid}`
    navigator.clipboard.writeText(url)
    toast({ title: 'Link público copiado' })
  }

  if (loading || !proyecto) {
    return (
      <div className="space-y-4 max-w-6xl">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded" />
          <Skeleton className="h-6 w-48" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
        </div>
        <Skeleton className="h-96 rounded-lg" />
      </div>
    )
  }

  const totalHoras = tareas.reduce((s, t) => s + t.horas, 0)
  const retainerPct = ciclo ? Math.min((ciclo.horas_consumidas / ciclo.horas_asignadas) * 100, 100) : 0

  return (
    <div className="space-y-4 max-w-6xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => navigate({ to: '/proyectos' })}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold truncate">{proyecto.nombre}</h1>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {proyecto.public_uuid && (
            <Button variant="outline" size="sm" className="h-9" onClick={copyPublicLink}>
              <Copy className="mr-1.5 h-3.5 w-3.5" />
              Link público
            </Button>
          )}
          <Button size="sm" className="h-9" onClick={() => setModalTarea('new')}>
            <Plus className="mr-1.5 h-4 w-4" />
            Tarea
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <div className="bg-card border border-border rounded-lg p-3">
          <p className="text-xs text-muted-foreground">Horas totales</p>
          <p className="font-semibold">{formatHoras(totalHoras)}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <p className="text-xs text-muted-foreground">Tarifa/hora</p>
          <p className="font-semibold">{formatEUR(proyecto.tarifa_hora)}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <p className="text-xs text-muted-foreground">Ingresos</p>
          <p className="font-semibold">{formatEUR(totalHoras * proyecto.tarifa_hora)}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <p className="text-xs text-muted-foreground">Tareas</p>
          <p className="font-semibold">{tareas.length}</p>
        </div>
      </div>

      {ciclo && (
        <div className="bg-card border border-border rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Retainer activo</span>
            <span className="text-muted-foreground">
              {formatHoras(ciclo.horas_consumidas)} / {formatHoras(ciclo.horas_asignadas)}
            </span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${retainerPct >= 100 ? 'bg-red-500' : retainerPct >= 80 ? 'bg-yellow-500' : 'bg-primary'}`}
              style={{ width: `${retainerPct}%` }}
            />
          </div>
          {retainerPct >= 80 && (
            <p className="flex items-center gap-1.5 text-xs text-yellow-500">
              <AlertTriangle className="h-3.5 w-3.5" />
              {retainerPct >= 100 ? 'Has superado la bolsa de horas' : 'Casi has agotado la bolsa de horas'}
            </p>
          )}
        </div>
      )}

      {proyecto.stopwatch_enabled && (
        <Stopwatch onStop={handleStopwatchStop} />
      )}

      <Tabs defaultValue="kanban">
        <TabsList className="h-9">
          <TabsTrigger value="kanban" className="text-sm">Kanban</TabsTrigger>
          <TabsTrigger value="lista" className="text-sm">Lista</TabsTrigger>
          <TabsTrigger value="gantt" className="text-sm">Gantt</TabsTrigger>
          <TabsTrigger value="sprints" className="text-sm">Sprints</TabsTrigger>
          <TabsTrigger value="gastos" className="text-sm">Gastos</TabsTrigger>
          <TabsTrigger value="equipo" className="text-sm">Equipo</TabsTrigger>
          <TabsTrigger value="notas" className="text-sm">Notas</TabsTrigger>
        </TabsList>
        <TabsContent value="kanban" className="mt-3">
          <div className="space-y-3">
            <div className="flex items-center gap-2 justify-between">
              <div className="flex items-center gap-2">
                {sprints.length > 0 && (
                  <Select value={kanbanSprintFilter} onValueChange={setKanbanSprintFilter}>
                    <SelectTrigger className="h-8 w-auto text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los sprints</SelectItem>
                      {sprints.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setEstadosModalOpen(true)} title="Gestionar estados">
                <Settings2 className="h-4 w-4" />
              </Button>
            </div>
            <KanbanBoard
              tareas={tareas.filter((t) => !t.es_backlog && (kanbanSprintFilter === 'all' || t.sprint_id === kanbanSprintFilter))}
              tags={tags}
              estados={kanbanEstados}
              onMoveCard={handleMoveCard}
              onReorderCards={handleReorderCards}
              onCardClick={(t) => setModalTarea(t)}
            />
          </div>
        </TabsContent>
        <TabsContent value="gantt" className="mt-3">
          <GanttView
            tareas={tareas}
            tags={tags}
            sprints={sprints}
            kanbanEstados={kanbanEstados}
            onTaskClick={(t) => setModalTarea(t)}
          />
        </TabsContent>
        <TabsContent value="sprints" className="mt-3">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Planificación por sprints</p>
              <div className="flex items-center gap-2">
                {sprints.length > 0 && proyecto && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8">
                        <Download className="mr-1.5 h-3.5 w-3.5" />
                        Exportar
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => exportSprintsExcel(proyecto, sprints, tareas, tags, kanbanEstados)}>
                        <FileSpreadsheet className="mr-2 h-4 w-4" />
                        Exportar Excel
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => exportSprintsPDF(proyecto, sprints, tareas, tags, kanbanEstados)}>
                        <Download className="mr-2 h-4 w-4" />
                        Exportar PDF
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                <Button size="sm" className="h-8" onClick={() => openSprintModal('new')}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Nuevo sprint
                </Button>
              </div>
            </div>
            {sprints.length === 0 && (
              <div className="flex flex-col items-center justify-center h-32 gap-2 text-muted-foreground border border-dashed border-border rounded-lg text-sm">
                <p>No hay sprints creados</p>
              </div>
            )}
            {sprints.map((sprint) => {
              const sprintTareas = tareas.filter((t) => t.sprint_id === sprint.id)
              const duracion = Math.round((new Date(sprint.fecha_fin).getTime() - new Date(sprint.fecha_inicio).getTime()) / 86400000) + 1
              return (
                <div key={sprint.id} className="border border-border rounded-lg overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-2.5 bg-muted/30">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">{sprint.nombre}</p>
                      <p className="text-xs text-muted-foreground">
                        {sprint.fecha_inicio} – {sprint.fecha_fin} · {duracion} días
                      </p>
                    </div>
                    <button
                      onClick={() => openSprintModal(sprint)}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setDeletingSprint(sprint)}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="divide-y divide-border">
                    {sprintTareas.length === 0 ? (
                      <p className="px-4 py-3 text-xs text-muted-foreground italic">Sin tareas asignadas</p>
                    ) : (
                      sprintTareas.map((t) => (
                        <div key={t.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/10">
                          <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setModalTarea(t)}>
                            <p className="text-sm truncate">{t.descripcion}</p>
                            <p className="text-xs text-muted-foreground">{formatHoras(t.horas)} · {t.estado_kanban.replace('_', ' ')}</p>
                          </div>
                          <button
                            onClick={() => handleAssignSprint(t.id, null)}
                            className="text-muted-foreground hover:text-destructive flex-shrink-0 transition-colors"
                            title="Quitar del sprint"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )
            })}
            {/* Sin planificar */}
            {(() => {
              const unplanned = tareas.filter((t) => !t.sprint_id)
              if (unplanned.length === 0 && sprints.length > 0) return null
              return (
                <div className="border border-border rounded-lg overflow-hidden">
                  <div className="px-4 py-2.5 bg-muted/20">
                    <p className="text-sm font-medium text-muted-foreground">
                      Sin planificar <span className="text-xs font-normal">({unplanned.length})</span>
                    </p>
                  </div>
                  <div className="divide-y divide-border">
                    {unplanned.length === 0 ? (
                      <p className="px-4 py-3 text-xs text-muted-foreground italic">Todo está planificado</p>
                    ) : (
                      unplanned.map((t) => (
                        <div key={t.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/10">
                          <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setModalTarea(t)}>
                            <p className="text-sm truncate">{t.descripcion}</p>
                            <p className="text-xs text-muted-foreground">{formatHoras(t.horas)} · {t.estado_kanban.replace('_', ' ')}</p>
                          </div>
                          {sprints.length > 0 && (
                            <select
                              className="text-xs bg-background border border-border rounded px-1.5 py-1 text-muted-foreground hover:text-foreground cursor-pointer flex-shrink-0"
                              value=""
                              onChange={(e) => e.target.value && handleAssignSprint(t.id, e.target.value)}
                            >
                              <option value="">Asignar sprint</option>
                              {sprints.map((s) => (
                                <option key={s.id} value={s.id}>{s.nombre}</option>
                              ))}
                            </select>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )
            })()}
          </div>
        </TabsContent>
        <TabsContent value="lista" className="mt-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{tareas.length} tarea{tareas.length !== 1 ? 's' : ''}</p>
              {tareas.length > 0 && proyecto && (
                <Button variant="outline" size="sm" className="h-8" onClick={() => exportTareasExcel(proyecto, tareas, sprints, tags, kanbanEstados)}>
                  <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />
                  Exportar Excel
                </Button>
              )}
            </div>
            {tareas.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-sm text-muted-foreground border border-dashed border-border rounded-lg">
                No hay tareas
              </div>
            ) : (
              tareas.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center gap-3 bg-card border border-border rounded-md px-4 py-3 hover:border-primary/20 transition-colors cursor-pointer"
                  onClick={() => setModalTarea(t)}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{t.descripcion}</p>
                    <p className="text-xs text-muted-foreground">{t.fecha} · {formatHoras(t.horas)}</p>
                  </div>
                  {t.prioridad && (
                    <Badge variant="outline" className="text-xs capitalize hidden sm:flex">{t.prioridad}</Badge>
                  )}
                  {t.complejidad && (
                    <span className="text-xs font-mono text-muted-foreground hidden sm:block">
                      {t.complejidad === 9 ? '⚡9' : t.complejidad}
                    </span>
                  )}
                  <Badge variant="outline" className="text-xs">{t.estado_pago}</Badge>
                  {t.is_locked && <span className="text-xs">🔒</span>}
                  <Pencil className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                </div>
              ))
            )}
          </div>
        </TabsContent>
        <TabsContent value="gastos" className="mt-3">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total</p>
                <p className="font-semibold">{formatEUR(gastos.reduce((s, g) => s + g.monto, 0))}</p>
              </div>
              <div className="flex items-center gap-2">
                {gastos.length > 0 && proyecto && (
                  <Button variant="outline" size="sm" className="h-9" onClick={() => exportGastosExcel(proyecto, gastos)}>
                    <FileSpreadsheet className="mr-1.5 h-4 w-4" />
                    Exportar Excel
                  </Button>
                )}
                <Button size="sm" className="h-9" onClick={() => openGastoModal('new')}>
                  <Plus className="mr-1.5 h-4 w-4" />
                  Nuevo gasto
                </Button>
              </div>
            </div>
            {gastos.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-sm text-muted-foreground border border-dashed border-border rounded-lg">
                No hay gastos en este proyecto
              </div>
            ) : (
              gastos.map((g) => (
                <div
                  key={g.id}
                  className="flex items-center gap-3 bg-card border border-border rounded-md px-4 py-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{g.concepto}</p>
                    <p className="text-xs text-muted-foreground">{g.fecha}</p>
                  </div>
                  {g.tipo_pago === 'recurrente' && g.periodicidad && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 font-medium flex-shrink-0 capitalize">
                      {g.periodicidad}
                    </span>
                  )}
                  <p className="text-sm font-medium flex-shrink-0">{formatEUR(g.monto)}</p>
                  <button
                    onClick={() => openGastoModal(g)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setDeletingGasto(g)}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </TabsContent>
        <TabsContent value="equipo" className="mt-3">
          <EquipoTab proyectoId={proyectoId} currentRol={currentRol} />
        </TabsContent>
        <TabsContent value="notas" className="mt-3">
          <NotasTab proyectoId={proyectoId} currentRol={currentRol} />
        </TabsContent>
      </Tabs>

      {/* Dialog gestión de estados Kanban */}
      <Dialog open={estadosModalOpen} onOpenChange={setEstadosModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Estados Kanban</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-1 max-h-80 overflow-y-auto">
            {kanbanEstados.map((estado) => (
              <div key={estado.id} className="flex items-center gap-2 py-1.5 px-1 rounded hover:bg-muted/20">
                {/* Color picker inline */}
                <div className="relative flex-shrink-0">
                  <span
                    className="inline-block w-4 h-4 rounded-full cursor-pointer border border-border"
                    style={{ backgroundColor: estado.color }}
                    title="Cambiar color"
                  />
                  <input
                    type="color"
                    className="absolute inset-0 opacity-0 cursor-pointer w-4 h-4"
                    value={estado.color}
                    onChange={(e) => handleUpdateEstado(estado, { color: e.target.value })}
                  />
                </div>
                {/* Nombre editable */}
                {editingEstado?.id === estado.id ? (
                  <input
                    className="flex-1 text-sm bg-background border border-input rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-ring"
                    value={editingEstado.nombre}
                    autoFocus
                    onChange={(e) => setEditingEstado({ ...editingEstado, nombre: e.target.value })}
                    onBlur={() => {
                      if (editingEstado.nombre.trim() && editingEstado.nombre !== estado.nombre) {
                        handleUpdateEstado(estado, { nombre: editingEstado.nombre.trim() })
                      }
                      setEditingEstado(null)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                      if (e.key === 'Escape') setEditingEstado(null)
                    }}
                  />
                ) : (
                  <span
                    className="flex-1 text-sm cursor-text"
                    onClick={() => setEditingEstado(estado)}
                  >
                    {estado.nombre}
                  </span>
                )}
                {/* Es final toggle */}
                <button
                  title={estado.es_final ? 'Estado final (click para quitar)' : 'Marcar como estado final'}
                  onClick={() => handleUpdateEstado(estado, { es_final: !estado.es_final })}
                  className={`text-xs px-1.5 py-0.5 rounded border transition-colors flex-shrink-0 ${estado.es_final ? 'border-green-500 text-green-400 bg-green-500/10' : 'border-border text-muted-foreground'}`}
                >
                  ✓ final
                </button>
                {/* Reorder */}
                <button onClick={() => handleMoveEstado(estado, 'up')} className="text-muted-foreground hover:text-foreground flex-shrink-0">
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => handleMoveEstado(estado, 'down')} className="text-muted-foreground hover:text-foreground flex-shrink-0">
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
                {/* Delete */}
                <button onClick={() => handleDeleteEstado(estado)} className="text-muted-foreground hover:text-destructive flex-shrink-0">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
          {/* Add new estado */}
          <div className="flex items-center gap-2 pt-2 border-t border-border">
            <Input
              placeholder="Nombre del nuevo estado"
              className="h-8 text-sm flex-1"
              value={newEstadoNombre}
              onChange={(e) => setNewEstadoNombre(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateEstado()}
            />
            <Button size="sm" className="h-8" onClick={handleCreateEstado} disabled={savingEstado || !newEstadoNombre.trim()}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal crear/editar gasto */}
      <Dialog open={gastoModal !== null} onOpenChange={(v) => !v && setGastoModal(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{gastoModal === 'new' ? 'Nuevo gasto' : 'Editar gasto'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label htmlFor="g-concepto">Concepto</Label>
              <Input
                id="g-concepto"
                ref={gastoConceptoRef}
                value={gastoForm.concepto}
                onChange={(e) => setGastoForm((f) => ({ ...f, concepto: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && handleGastoSave()}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="g-monto">Monto (€)</Label>
                <Input
                  id="g-monto"
                  type="number"
                  min="0"
                  step="0.01"
                  value={gastoForm.monto}
                  onChange={(e) => setGastoForm((f) => ({ ...f, monto: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && handleGastoSave()}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="g-fecha">Fecha</Label>
                <DatePicker value={gastoForm.fecha} onChange={(v) => setGastoForm((f) => ({ ...f, fecha: v }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Tipo de pago</Label>
              <Select
                value={gastoForm.tipo_pago}
                onValueChange={(v) => setGastoForm((f) => ({ ...f, tipo_pago: v as 'unico' | 'recurrente', periodicidad: v === 'unico' ? '' : f.periodicidad }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unico">Pago único</SelectItem>
                  <SelectItem value="recurrente">Recurrente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {gastoForm.tipo_pago === 'recurrente' && (
              <div className="space-y-1">
                <Label>Periodicidad</Label>
                <Select
                  value={gastoForm.periodicidad || 'mensual'}
                  onValueChange={(v) => setGastoForm((f) => ({ ...f, periodicidad: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mensual">Mensual</SelectItem>
                    <SelectItem value="trimestral">Trimestral</SelectItem>
                    <SelectItem value="anual">Anual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGastoModal(null)}>Cancelar</Button>
            <Button onClick={handleGastoSave} disabled={savingGasto}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmar eliminación de gasto */}
      <AlertDialog
        open={deletingGasto !== null}
        onOpenChange={(v) => !v && setDeletingGasto(null)}
        title="¿Eliminar gasto?"
        description={`Esta acción no se puede deshacer. Se eliminará el gasto "${deletingGasto?.concepto}".`}
        confirmLabel="Eliminar"
        onConfirm={handleGastoDelete}
        variant="destructive"
      />

      {/* Sprint modal */}
      <Dialog open={sprintModal !== null} onOpenChange={(v) => !v && setSprintModal(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{sprintModal === 'new' ? 'Nuevo sprint' : 'Editar sprint'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Nombre</Label>
              <Input
                value={sprintForm.nombre}
                onChange={(e) => setSprintForm((f) => ({ ...f, nombre: e.target.value }))}
                placeholder="Sprint 1"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Fecha inicio</Label>
                <DatePicker value={sprintForm.fecha_inicio} onChange={(v) => setSprintForm((f) => ({ ...f, fecha_inicio: v }))} />
              </div>
              <div className="space-y-1">
                <Label>Duración (días)</Label>
                <Input
                  type="number"
                  min="1"
                  value={sprintForm.duracion}
                  onChange={(e) => setSprintForm((f) => ({ ...f, duracion: e.target.value }))}
                />
              </div>
            </div>
            {sprintForm.fecha_inicio && sprintForm.duracion && !isNaN(parseInt(sprintForm.duracion)) && (
              <p className="text-xs text-muted-foreground">
                Fin: {(() => {
                  const d = new Date(sprintForm.fecha_inicio)
                  d.setDate(d.getDate() + parseInt(sprintForm.duracion) - 1)
                  return d.toISOString().split('T')[0]
                })()}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSprintModal(null)}>Cancelar</Button>
            <Button
              onClick={handleSprintSave}
              disabled={savingSprint || !sprintForm.nombre || !sprintForm.fecha_inicio || !sprintForm.duracion}
            >
              {sprintModal === 'new' ? 'Crear' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmar eliminación de sprint */}
      <AlertDialog
        open={deletingSprint !== null}
        onOpenChange={(v) => !v && setDeletingSprint(null)}
        title="¿Eliminar sprint?"
        description={`Las tareas de "${deletingSprint?.nombre}" quedarán sin planificar.`}
        confirmLabel="Eliminar"
        onConfirm={handleSprintDelete}
        variant="destructive"
      />

      <TareaModal
        open={modalTarea !== null}
        onOpenChange={(v) => !v && setModalTarea(null)}
        tarea={modalTarea !== 'new' ? modalTarea ?? undefined : undefined}
        proyectoId={proyectoId}
        workspaceId={currentWorkspace?.id ?? ''}
        tags={tags}
        sprints={sprints}
        onSaved={handleTareaSaved}
        onDeleted={handleTareaDeleted}
      />
    </div>
  )
}
