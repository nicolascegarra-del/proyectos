import { useState, useEffect, useRef, useCallback } from 'react'
import { format } from 'date-fns'
import { Play, Square, Timer, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { api, getErrorMessage } from '@/lib/api'
import { toast } from '@/components/ui/use-toast'
import type { RegistroTiempo } from '@/types'

interface TaskTimerProps {
  tareaId: string
  proyectoId: string
  workspaceId: string
  onHorasUpdated?: (newHoras: number) => void
}

function formatDuration(horas: number): string {
  const h = Math.floor(horas)
  const m = Math.round((horas - h) * 60)
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}

function pad(n: number) {
  return n.toString().padStart(2, '0')
}

export function TaskTimer({ tareaId, proyectoId, workspaceId, onHorasUpdated }: TaskTimerProps) {
  const [registros, setRegistros] = useState<RegistroTiempo[]>([])
  const [loading, setLoading] = useState(true)
  const [activeRegistro, setActiveRegistro] = useState<RegistroTiempo | null>(null)
  const [elapsed, setElapsed] = useState(0) // seconds
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [starting, setStarting] = useState(false)
  const [stopping, setStopping] = useState(false)

  const baseUrl = `/workspaces/${workspaceId}/proyectos/${proyectoId}/tareas/${tareaId}/tiempo`

  const loadRegistros = useCallback(async () => {
    try {
      const { data } = await api.get<RegistroTiempo[]>(baseUrl)
      setRegistros(data)
      const active = data.find((r) => r.fin === null) ?? null
      setActiveRegistro(active)
      if (active) {
        const startedAt = new Date(active.inicio).getTime()
        setElapsed(Math.floor((Date.now() - startedAt) / 1000))
      } else {
        setElapsed(0)
      }
    } catch {
      // silencioso
    } finally {
      setLoading(false)
    }
  }, [baseUrl])

  useEffect(() => {
    loadRegistros()
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [loadRegistros])

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (activeRegistro) {
      intervalRef.current = setInterval(() => {
        const startedAt = new Date(activeRegistro.inicio).getTime()
        setElapsed(Math.floor((Date.now() - startedAt) / 1000))
      }, 1000)
    } else {
      setElapsed(0)
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [activeRegistro])

  const handleStart = async () => {
    setStarting(true)
    try {
      const { data } = await api.post<RegistroTiempo>(`${baseUrl}/start`)
      setActiveRegistro(data)
      setRegistros((prev) => [data, ...prev])
    } catch (err) {
      toast({ title: getErrorMessage(err), variant: 'destructive' })
    } finally {
      setStarting(false)
    }
  }

  const handleStop = async () => {
    if (!activeRegistro) return
    setStopping(true)
    try {
      const { data } = await api.post<{ registro: RegistroTiempo; tarea_horas: number }>(
        `${baseUrl}/${activeRegistro.id}/stop`,
      )
      setActiveRegistro(null)
      setRegistros((prev) => prev.map((r) => (r.id === data.registro.id ? data.registro : r)))
      onHorasUpdated?.(data.tarea_horas)
    } catch (err) {
      toast({ title: getErrorMessage(err), variant: 'destructive' })
    } finally {
      setStopping(false)
    }
  }

  const handleDelete = async (registro: RegistroTiempo) => {
    try {
      const { data } = await api.delete<{ tarea_horas: number }>(`${baseUrl}/${registro.id}`)
      setRegistros((prev) => prev.filter((r) => r.id !== registro.id))
      if (registro.fin === null) setActiveRegistro(null)
      onHorasUpdated?.(data.tarea_horas)
    } catch (err) {
      toast({ title: getErrorMessage(err), variant: 'destructive' })
    }
  }

  const hours = Math.floor(elapsed / 3600)
  const minutes = Math.floor((elapsed % 3600) / 60)
  const seconds = elapsed % 60

  if (loading) {
    return <p className="text-xs text-muted-foreground px-1">Cargando cronómetro...</p>
  }

  return (
    <div className="space-y-2">
      {/* Display y controles */}
      <div className="flex items-center gap-3 bg-muted/40 rounded-lg px-4 py-2.5">
        <Timer className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        <span className="font-mono text-base font-semibold tabular-nums min-w-[80px]">
          {pad(hours)}:{pad(minutes)}:{pad(seconds)}
        </span>
        {!activeRegistro ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-3 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950"
            onClick={handleStart}
            disabled={starting}
          >
            <Play className="h-3.5 w-3.5 mr-1" />
            Iniciar
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-3 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
            onClick={handleStop}
            disabled={stopping}
          >
            <Square className="h-3.5 w-3.5 mr-1" />
            Detener
          </Button>
        )}
      </div>

      {/* Log de sesiones */}
      {registros.length > 0 && (
        <div className="space-y-0.5 max-h-36 overflow-y-auto rounded-md border border-border/40 p-1">
          {registros.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between text-xs px-2 py-1.5 rounded hover:bg-muted/30 group/reg"
            >
              <span className="text-muted-foreground">
                {format(new Date(r.inicio), 'dd/MM HH:mm')}
                {r.fin ? (
                  <> → {format(new Date(r.fin), 'HH:mm')}</>
                ) : (
                  <span className="ml-1.5 text-green-500 font-medium">● en curso</span>
                )}
              </span>
              <div className="flex items-center gap-2">
                {r.duracion_horas != null && (
                  <span className="font-medium tabular-nums">{formatDuration(r.duracion_horas)}</span>
                )}
                <button
                  type="button"
                  onClick={() => handleDelete(r)}
                  className="opacity-0 group-hover/reg:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                  aria-label="Eliminar registro"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
