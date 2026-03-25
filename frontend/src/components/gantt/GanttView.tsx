import { useState, useMemo } from 'react'
import {
  addMonths,
  subMonths,
  startOfMonth,
  differenceInDays,
  format,
  addDays,
  startOfDay,
  eachMonthOfInterval,
  getDaysInMonth,
} from 'date-fns'
import { es } from 'date-fns/locale'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Tag, Tarea } from '@/types'

const MONTHS_VISIBLE = 3

const ESTADO_COLORS: Record<string, string> = {
  backlog: 'bg-slate-400',
  todo: 'bg-blue-500',
  en_progreso: 'bg-amber-500',
  revision: 'bg-violet-500',
  done: 'bg-emerald-500',
}

const ESTADO_LABELS: Record<string, string> = {
  backlog: 'Backlog',
  todo: 'Por hacer',
  en_progreso: 'En progreso',
  revision: 'Revisión',
  done: 'Hecho',
}

interface GanttViewProps {
  tareas: Tarea[]
  tags: Tag[]
  onTaskClick: (t: Tarea) => void
}

export function GanttView({ tareas, tags, onTaskClick }: GanttViewProps) {
  const [viewStart, setViewStart] = useState(() => startOfMonth(new Date()))

  const viewEnd = addMonths(viewStart, MONTHS_VISIBLE)
  const totalDays = differenceInDays(viewEnd, viewStart)

  const today = startOfDay(new Date())
  const todayOffset = differenceInDays(today, viewStart)

  const months = eachMonthOfInterval({ start: viewStart, end: addDays(viewEnd, -1) })

  const tagMap = useMemo(
    () => Object.fromEntries(tags.map((t) => [t.id, t])),
    [tags],
  )

  const planned = useMemo(
    () =>
      tareas
        .filter((t) => t.fecha_inicio && t.fecha_fin)
        .sort((a, b) => a.fecha_inicio!.localeCompare(b.fecha_inicio!)),
    [tareas],
  )

  const unplanned = useMemo(
    () => tareas.filter((t) => !t.fecha_inicio || !t.fecha_fin),
    [tareas],
  )

  function getBar(t: Tarea) {
    if (!t.fecha_inicio || !t.fecha_fin) return null
    const start = startOfDay(new Date(t.fecha_inicio))
    const end = startOfDay(new Date(t.fecha_fin))
    const leftDays = differenceInDays(start, viewStart)
    const rightDays = differenceInDays(addDays(end, 1), viewStart)
    const clampedLeft = Math.max(0, leftDays)
    const clampedRight = Math.min(totalDays, rightDays)
    if (clampedLeft >= totalDays || clampedRight <= 0) return null
    return {
      left: `${(clampedLeft / totalDays) * 100}%`,
      width: `${((clampedRight - clampedLeft) / totalDays) * 100}%`,
    }
  }

  return (
    <div className="space-y-4">
      {/* Navegación */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setViewStart((d) => subMonths(d, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium min-w-[220px] text-center">
            {format(viewStart, 'MMM yyyy', { locale: es })}
            {' – '}
            {format(addDays(viewEnd, -1), 'MMM yyyy', { locale: es })}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setViewStart((d) => addMonths(d, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs"
          onClick={() => setViewStart(startOfMonth(new Date()))}
        >
          Hoy
        </Button>
      </div>

      {/* Leyenda */}
      <div className="flex flex-wrap gap-3">
        {Object.entries(ESTADO_LABELS).map(([key, label]) => (
          <div key={key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <div className={`h-2.5 w-5 rounded-sm ${ESTADO_COLORS[key]}`} />
            {label}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          {/* Cabecera de meses */}
          <div className="flex border-b border-border bg-muted/30" style={{ minWidth: '640px' }}>
            <div className="w-44 flex-shrink-0 border-r border-border px-3 py-2 text-xs font-medium text-muted-foreground">
              Tarea
            </div>
            <div className="flex flex-1">
              {months.map((month) => {
                const daysInMonth = getDaysInMonth(month)
                const monthStart = startOfMonth(month)
                const startDay = differenceInDays(monthStart, viewStart)
                const endDay = Math.min(startDay + daysInMonth, totalDays)
                const visibleDays = Math.max(0, endDay - Math.max(0, startDay))
                return (
                  <div
                    key={month.toISOString()}
                    className="border-r border-border last:border-r-0 px-2 py-2 text-xs font-medium capitalize"
                    style={{ width: `${(visibleDays / totalDays) * 100}%` }}
                  >
                    {format(month, 'MMMM yyyy', { locale: es })}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Filas de tareas */}
          {planned.length === 0 ? (
            <div
              className="flex items-center justify-center text-sm text-muted-foreground"
              style={{ minWidth: '640px', height: '80px' }}
            >
              No hay tareas con fechas de inicio y fin
            </div>
          ) : (
            <div className="relative" style={{ minWidth: '640px' }}>
              {/* Línea de hoy */}
              {todayOffset >= 0 && todayOffset <= totalDays && (
                <div
                  className="absolute top-0 bottom-0 w-px bg-red-400/60 z-10 pointer-events-none"
                  style={{ left: `calc(${(todayOffset / totalDays) * 100}% * (100% - 176px) / 100% + 176px)` }}
                />
              )}

              {planned.map((t, i) => {
                const bar = getBar(t)
                const tag = t.tag_id ? tagMap[t.tag_id] : null
                return (
                  <div
                    key={t.id}
                    className={`flex items-center border-b border-border last:border-b-0 ${i % 2 !== 0 ? 'bg-muted/10' : ''}`}
                    style={{ height: '36px' }}
                  >
                    {/* Nombre */}
                    <div
                      className="w-44 flex-shrink-0 border-r border-border px-3 text-xs truncate cursor-pointer hover:text-primary transition-colors h-full flex items-center gap-1.5"
                      onClick={() => onTaskClick(t)}
                    >
                      {tag && (
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: tag.color }}
                        />
                      )}
                      <span className="truncate">{t.descripcion}</span>
                    </div>

                    {/* Barra */}
                    <div className="flex-1 relative h-full">
                      {bar && (
                        <div
                          className={`absolute top-1/2 -translate-y-1/2 h-5 rounded cursor-pointer transition-opacity opacity-80 hover:opacity-100 ${ESTADO_COLORS[t.estado_kanban]}`}
                          style={{ left: bar.left, width: bar.width, minWidth: '4px' }}
                          onClick={() => onTaskClick(t)}
                          title={`${t.descripcion}\n${t.fecha_inicio} → ${t.fecha_fin}`}
                        />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Tareas sin planificación */}
      {unplanned.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" />
            Sin fechas de planificación ({unplanned.length})
          </p>
          <div className="space-y-1">
            {unplanned.map((t) => {
              const tag = t.tag_id ? tagMap[t.tag_id] : null
              return (
                <div
                  key={t.id}
                  className="flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-card hover:border-primary/20 cursor-pointer text-xs transition-colors"
                  onClick={() => onTaskClick(t)}
                >
                  <span
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${ESTADO_COLORS[t.estado_kanban]}`}
                  />
                  <span className="flex-1 truncate">{t.descripcion}</span>
                  {tag && (
                    <span className="flex-shrink-0 flex items-center gap-1 text-muted-foreground">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: tag.color }}
                      />
                      {tag.nombre}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
