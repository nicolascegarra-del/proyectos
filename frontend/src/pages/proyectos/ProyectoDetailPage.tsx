import { useEffect, useState } from 'react'
import { useParams, useNavigate } from '@tanstack/react-router'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { api, getErrorMessage } from '@/lib/api'
import type { EstadoKanban, Proyecto, RetainerCiclo, Tag, Tarea } from '@/types'
import { KanbanBoard } from '@/components/kanban/KanbanBoard'
import { Stopwatch } from '@/components/stopwatch/Stopwatch'
import { TareaModal } from '@/components/tareas/TareaModal'
import { formatEUR, formatHoras, today } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { AlertTriangle, ArrowLeft, Copy, Pencil, Plus } from 'lucide-react'
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

  const copyPublicLink = () => {
    if (!proyecto) return
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
          <Button variant="outline" size="sm" className="h-9" onClick={copyPublicLink}>
            <Copy className="mr-1.5 h-3.5 w-3.5" />
            Link público
          </Button>
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
        </TabsList>
        <TabsContent value="kanban" className="mt-3">
          <KanbanBoard
            tareas={tareas.filter((t) => !t.es_backlog)}
            tags={tags}
            onMoveCard={handleMoveCard}
            onCardClick={(t) => setModalTarea(t)}
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
      </Tabs>

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
