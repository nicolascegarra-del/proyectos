import { useEffect, useState } from 'react'
import { useParams, useNavigate } from '@tanstack/react-router'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { api, getErrorMessage } from '@/lib/api'
import type { EstadoKanban, Proyecto, RetainerCiclo, Tag, Tarea } from '@/types'
import { KanbanBoard } from '@/components/kanban/KanbanBoard'
import { Stopwatch } from '@/components/stopwatch/Stopwatch'
import { formatEUR, formatHoras, today } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, ArrowLeft, Copy, Loader2, Plus } from 'lucide-react'
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

  const [newTaskOpen, setNewTaskOpen] = useState(false)
  const [newTaskDesc, setNewTaskDesc] = useState('')
  const [newTaskHoras, setNewTaskHoras] = useState('0')
  const [newTaskFecha, setNewTaskFecha] = useState(today())
  const [saving, setSaving] = useState(false)

  const load = async () => {
    if (!currentWorkspace) return
    setLoading(true)
    try {
      const [pRes, tRes, tagRes] = await Promise.all([
        api.get<Proyecto>(`/workspaces/${currentWorkspace.id}/proyectos/${proyectoId}`),
        api.get<Tarea[]>(`/workspaces/${currentWorkspace.id}/proyectos/${proyectoId}/tareas`),
        api.get<Tag[]>(`/workspaces/${currentWorkspace.id}/tags`),
      ])
      setProyecto(pRes.data)
      setTareas(tRes.data)
      setTags(tagRes.data)

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

  const handleAddTask = async () => {
    if (!newTaskDesc || !currentWorkspace) return
    setSaving(true)
    const horas = parseFloat(newTaskHoras) || 0
    try {
      const { data } = await api.post<Tarea>(
        `/workspaces/${currentWorkspace.id}/proyectos/${proyectoId}/tareas`,
        { descripcion: newTaskDesc, horas, fecha: newTaskFecha },
      )
      setTareas((t) => [...t, data])
      await upsertLocal(db.tareas, data)
      setNewTaskOpen(false)
      setNewTaskDesc('')
      setNewTaskHoras('0')
      setNewTaskFecha(today())
      if (data.alerta_horas) toast({ title: '⚠️ Has alcanzado el límite de horas del proyecto' })
      if (data.alerta_retainer) toast({ title: '⚠️ Has superado la bolsa de horas del retainer' })
    } catch (err) {
      toast({ title: getErrorMessage(err), variant: 'destructive' })
    } finally {
      setSaving(false)
    }
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
        load()
      }
    } else {
      await enqueueSync('tarea', tareaId, 'update', { estado_kanban: newEstado })
      incrementPending()
    }
  }

  const copyPublicLink = () => {
    if (!proyecto) return
    const url = `${window.location.origin}/p/${proyecto.public_uuid}`
    navigator.clipboard.writeText(url)
    toast({ title: 'Link público copiado' })
  }

  if (loading || !proyecto) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
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
          <Button variant="outline" size="sm" className="h-9" onClick={copyPublicLink}>
            <Copy className="mr-1.5 h-3.5 w-3.5" />
            Link público
          </Button>
          <Button size="sm" className="h-9" onClick={() => setNewTaskOpen(true)}>
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
        </TabsList>
        <TabsContent value="kanban" className="mt-3">
          <KanbanBoard
            tareas={tareas.filter((t) => !t.es_backlog)}
            tags={tags}
            onMoveCard={handleMoveCard}
          />
        </TabsContent>
        <TabsContent value="lista" className="mt-3">
          <div className="space-y-2">
            {tareas.map((t) => (
              <div key={t.id} className="flex items-center gap-3 bg-card border border-border rounded-md px-4 py-3">
                <span className="flex-1 text-sm truncate">{t.descripcion}</span>
                <span className="text-xs text-muted-foreground">{formatHoras(t.horas)}</span>
                <Badge variant="outline" className="text-xs">{t.estado_pago}</Badge>
                {t.is_locked && <span className="text-xs text-muted-foreground">🔒</span>}
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={newTaskOpen} onOpenChange={(v) => { if (!v) setNewTaskOpen(false) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Nueva tarea</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Descripción</Label>
              <Input value={newTaskDesc} onChange={(e) => setNewTaskDesc(e.target.value)} placeholder="Descripción de la tarea" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Horas</Label>
                <Input type="number" min="0" step="0.25" value={newTaskHoras} onChange={(e) => setNewTaskHoras(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Fecha</Label>
                <Input type="date" value={newTaskFecha} onChange={(e) => setNewTaskFecha(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewTaskOpen(false)}>Cancelar</Button>
            <Button onClick={handleAddTask} disabled={saving || !newTaskDesc}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Crear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
