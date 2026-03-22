import { useEffect, useState } from 'react'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { api, getErrorMessage } from '@/lib/api'
import type { EstadoPago, Proyecto, Tag, Tarea } from '@/types'
import { formatHoras, formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Lock } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/use-toast'

const ESTADO_PAGO_COLORS: Record<EstadoPago, string> = {
  pendiente: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  facturado: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  cobrado: 'bg-green-500/10 text-green-400 border-green-500/20',
}

export default function TareasPage() {
  const currentWorkspace = useWorkspaceStore((s) => s.currentWorkspace)
  const [proyectos, setProyectos] = useState<Proyecto[]>([])
  const [tareas, setTareas] = useState<Tarea[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  const [filterProyecto, setFilterProyecto] = useState<string>('all')
  const [filterEstado, setFilterEstado] = useState<string>('all')

  const load = async () => {
    if (!currentWorkspace) return
    setLoading(true)
    try {
      const pRes = await api.get<Proyecto[]>(`/workspaces/${currentWorkspace.id}/proyectos`)
      setProyectos(pRes.data)
      const tareasProm = pRes.data.map((p) =>
        api.get<Tarea[]>(`/workspaces/${currentWorkspace.id}/proyectos/${p.id}/tareas`),
      )
      const results = await Promise.all(tareasProm)
      setTareas(results.flatMap((r) => r.data))
      const tagsRes = await api.get<Tag[]>(`/workspaces/${currentWorkspace.id}/tags`)
      setTags(tagsRes.data)
    } catch (err) {
      toast({ title: getErrorMessage(err), variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [currentWorkspace?.id])

  const handleUpdateEstadoPago = async (tarea: Tarea, estado: EstadoPago) => {
    if (tarea.is_locked) {
      toast({ title: 'Tarea bloqueada', variant: 'destructive' })
      return
    }
    if (!currentWorkspace) return
    try {
      const { data } = await api.put<Tarea>(
        `/workspaces/${currentWorkspace.id}/proyectos/${tarea.proyecto_id}/tareas/${tarea.id}`,
        { estado_pago: estado },
      )
      setTareas((t) => t.map((task) => (task.id === data.id ? data : task)))
    } catch (err) {
      toast({ title: getErrorMessage(err), variant: 'destructive' })
    }
  }

  const handleToggleLock = async (tarea: Tarea) => {
    const proyecto = proyectos.find((p) => p.id === tarea.proyecto_id)
    if (!proyecto || !currentWorkspace) return
    try {
      const { data } = await api.put<Tarea>(
        `/workspaces/${currentWorkspace.id}/proyectos/${tarea.proyecto_id}/tareas/${tarea.id}`,
        { is_locked: !tarea.is_locked },
      )
      setTareas((t) => t.map((task) => (task.id === data.id ? data : task)))
    } catch (err) {
      toast({ title: getErrorMessage(err), variant: 'destructive' })
    }
  }

  const tagMap = new Map(tags.map((t) => [t.id, t]))
  const proyectoMap = new Map(proyectos.map((p) => [p.id, p]))

  const filtered = tareas
    .filter((t) => filterProyecto === 'all' || t.proyecto_id === filterProyecto)
    .filter((t) => filterEstado === 'all' || t.estado_pago === filterEstado)
    .sort((a, b) => b.fecha.localeCompare(a.fecha))

  const totalHoras = filtered.reduce((s, t) => s + t.horas, 0)

  if (loading) {
    return (
      <div className="space-y-4 max-w-4xl">
        <Skeleton className="h-6 w-24" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-9 w-36" />
        </div>
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3 border border-border rounded-md">
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
              <Skeleton className="h-7 w-20" />
              <Skeleton className="h-7 w-28" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Bitácora</h1>
          <p className="text-xs text-muted-foreground">{formatHoras(totalHoras)} registradas</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Select value={filterProyecto} onValueChange={setFilterProyecto}>
          <SelectTrigger className="w-40 h-9">
            <SelectValue placeholder="Proyecto" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los proyectos</SelectItem>
            {proyectos.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterEstado} onValueChange={setFilterEstado}>
          <SelectTrigger className="w-36 h-9">
            <SelectValue placeholder="Estado pago" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="pendiente">Pendiente</SelectItem>
            <SelectItem value="facturado">Facturado</SelectItem>
            <SelectItem value="cobrado">Cobrado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground text-sm border border-dashed border-border rounded-lg">
            No hay tareas con estos filtros
          </div>
        ) : (
          filtered.map((tarea) => {
            const proyecto = proyectoMap.get(tarea.proyecto_id)
            const tag = tarea.tag_id ? tagMap.get(tarea.tag_id) : undefined
            return (
              <div
                key={tarea.id}
                className="flex items-center gap-3 bg-card border border-border rounded-md px-4 py-3 hover:border-primary/20 transition-colors"
              >
                <div className="flex-1 min-w-0 space-y-0.5">
                  <p className="text-sm truncate">{tarea.descripcion}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{proyecto?.nombre ?? '—'}</span>
                    <span>·</span>
                    <span>{formatDate(tarea.fecha)}</span>
                    {tag && (
                      <>
                        <span>·</span>
                        <span
                          className="inline-flex items-center gap-1"
                          style={{ color: tag.color }}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-current" />
                          {tag.nombre}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-sm font-medium tabular-nums">{formatHoras(tarea.horas)}</span>
                  <Select
                    value={tarea.estado_pago}
                    onValueChange={(v) => handleUpdateEstadoPago(tarea, v as EstadoPago)}
                    disabled={tarea.is_locked}
                  >
                    <SelectTrigger className={`h-7 w-28 text-xs border ${ESTADO_PAGO_COLORS[tarea.estado_pago]}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pendiente">Pendiente</SelectItem>
                      <SelectItem value="facturado">Facturado</SelectItem>
                      <SelectItem value="cobrado">Cobrado</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => handleToggleLock(tarea)}
                    title={tarea.is_locked ? 'Desbloquear' : 'Bloquear'}
                  >
                    <Lock className={`h-3.5 w-3.5 ${tarea.is_locked ? 'text-yellow-500' : 'text-muted-foreground'}`} />
                  </Button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
