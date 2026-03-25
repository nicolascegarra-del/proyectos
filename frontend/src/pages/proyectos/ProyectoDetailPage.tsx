import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from '@tanstack/react-router'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { api, getErrorMessage } from '@/lib/api'
import type { EstadoKanban, Gasto, Proyecto, RetainerCiclo, Tag, Tarea } from '@/types'
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
import { AlertTriangle, ArrowLeft, Copy, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from '@/components/ui/use-toast'
import { enqueueSync, db, upsertLocal } from '@/lib/db'
import { useSyncStore } from '@/store/syncStore'

export default function ProyectoDetailPage() {
  const { proyectoId } = useParams({ strict: false }) as { proyectoId: string }
  const currentWorkspace = useWorkspaceStore((s) => s.currentWorkspace)
  const online = useSyncStore((s) => s.online)
  const { incrementPending } = useSyncStore()
  const navigate = useNavigate()

  const [proyecto, setProyecto] = useState<Proyecto | null>(null)
  const [tareas, setTareas] = useState<Tarea[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [ciclo, setCiclo] = useState<RetainerCiclo | null>(null)
  const [loading, setLoading] = useState(true)

  // Modal de tarea: null = cerrado, 'new' = crear, Tarea = editar
  const [modalTarea, setModalTarea] = useState<Tarea | 'new' | null>(null)

  // Gastos
  const [gastos, setGastos] = useState<Gasto[]>([])
  const [gastoModal, setGastoModal] = useState<Gasto | 'new' | null>(null)
  const [deletingGasto, setDeletingGasto] = useState<Gasto | null>(null)
  const [gastoForm, setGastoForm] = useState({ concepto: '', monto: '', fecha: today() })
  const [savingGasto, setSavingGasto] = useState(false)
  const gastoConceptoRef = useRef<HTMLInputElement>(null)

  const load = async () => {
    if (!currentWorkspace) return
    setLoading(true)
    try {
      const [pRes, tRes, tagRes, gRes] = await Promise.all([
        api.get<Proyecto>(`/workspaces/${currentWorkspace.id}/proyectos/${proyectoId}`),
        api.get<Tarea[]>(`/workspaces/${currentWorkspace.id}/proyectos/${proyectoId}/tareas`),
        api.get<Tag[]>(`/workspaces/${currentWorkspace.id}/tags`),
        api.get<Gasto[]>(`/workspaces/${currentWorkspace.id}/proyectos/${proyectoId}/gastos`),
      ])
      setProyecto(pRes.data)
      setTareas(applyKanbanOrder(tRes.data))
      setTags(tagRes.data)
      setGastos(gRes.data)

      const ciclosRes = await api.get<RetainerCiclo[]>(
        `/workspaces/${currentWorkspace.id}/proyectos/${proyectoId}/retainer-ciclos`,
      )
      const active = ciclosRes.data.find((c) => c.is_active) ?? null
      setCiclo(active)
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

  const handleMoveCard = async (tareaId: string, newEstado: EstadoKanban) => {
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

  const saveKanbanOrder = (col: EstadoKanban, orderedIds: string[]) => {
    const current = getKanbanOrder()
    localStorage.setItem(`kanban_order_${proyectoId}`, JSON.stringify({ ...current, [col]: orderedIds }))
  }

  const applyKanbanOrder = (rawTareas: Tarea[]): Tarea[] => {
    const order = getKanbanOrder()
    const cols = ['backlog', 'todo', 'en_progreso', 'revision', 'done'] as const
    const result: Tarea[] = []
    for (const col of cols) {
      const colTareas = rawTareas.filter((t) => t.estado_kanban === col)
      const ids = order[col]
      if (!ids) { result.push(...colTareas); continue }
      const indexed = new Map(colTareas.map((t) => [t.id, t]))
      const ordered = ids.flatMap((id) => indexed.has(id) ? [indexed.get(id)!] : [])
      const rest = colTareas.filter((t) => !ids.includes(t.id))
      result.push(...ordered, ...rest)
    }
    return result
  }

  const handleReorderCards = (col: EstadoKanban, orderedIds: string[]) => {
    saveKanbanOrder(col, orderedIds)
    setTareas((prev) => {
      const others = prev.filter((t) => t.estado_kanban !== col)
      const colTareas = prev.filter((t) => t.estado_kanban === col)
      const indexed = new Map(colTareas.map((t) => [t.id, t]))
      const reordered = orderedIds.flatMap((id) => indexed.has(id) ? [indexed.get(id)!] : [])
      return [...others, ...reordered]
    })
  }

  const openGastoModal = (g: Gasto | 'new') => {
    if (g === 'new') {
      setGastoForm({ concepto: '', monto: '', fecha: today() })
    } else {
      setGastoForm({ concepto: g.concepto, monto: String(g.monto), fecha: g.fecha })
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
      if (gastoModal === 'new') {
        const { data } = await api.post<Gasto>(
          `/workspaces/${currentWorkspace.id}/proyectos/${proyectoId}/gastos`,
          { concepto, monto, fecha: gastoForm.fecha },
        )
        setGastos((prev) => [data, ...prev])
        toast({ title: 'Gasto creado' })
      } else if (gastoModal) {
        const { data } = await api.put<Gasto>(
          `/workspaces/${currentWorkspace.id}/proyectos/${proyectoId}/gastos/${gastoModal.id}`,
          { concepto, monto, fecha: gastoForm.fecha },
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
          <TabsTrigger value="gastos" className="text-sm">Gastos</TabsTrigger>
        </TabsList>
        <TabsContent value="kanban" className="mt-3">
          <KanbanBoard
            tareas={tareas.filter((t) => !t.es_backlog)}
            tags={tags}
            onMoveCard={handleMoveCard}
            onReorderCards={handleReorderCards}
            onCardClick={(t) => setModalTarea(t)}
          />
        </TabsContent>
        <TabsContent value="gantt" className="mt-3">
          <GanttView
            tareas={tareas}
            tags={tags}
            onTaskClick={(t) => setModalTarea(t)}
          />
        </TabsContent>
        <TabsContent value="lista" className="mt-3">
          <div className="space-y-2">
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
              <Button size="sm" className="h-9" onClick={() => openGastoModal('new')}>
                <Plus className="mr-1.5 h-4 w-4" />
                Nuevo gasto
              </Button>
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
      </Tabs>

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
                <Input
                  id="g-fecha"
                  type="date"
                  value={gastoForm.fecha}
                  onChange={(e) => setGastoForm((f) => ({ ...f, fecha: e.target.value }))}
                />
              </div>
            </div>
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

      <TareaModal
        open={modalTarea !== null}
        onOpenChange={(v) => !v && setModalTarea(null)}
        tarea={modalTarea !== 'new' ? modalTarea ?? undefined : undefined}
        proyectoId={proyectoId}
        workspaceId={currentWorkspace?.id ?? ''}
        tags={tags}
        onSaved={handleTareaSaved}
        onDeleted={handleTareaDeleted}
      />
    </div>
  )
}
