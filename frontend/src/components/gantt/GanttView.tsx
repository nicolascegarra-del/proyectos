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
import type { KanbanEstado, Sprint, Tag, Tarea } from '@/types'

const MONTHS_VISIBLE = 3

const SPRINT_COLORS = [
  'bg-blue-500/80',
  'bg-violet-500/80',
  'bg-emerald-500/80',
  'bg-amber-500/80',
  'bg-rose-500/80',
  'bg-cyan-500/80',
  'bg-pink-500/80',
  'bg-orange-500/80',
]

type GanttMode = 'tareas' | 'sprint' | 'global'

interface GanttViewProps {
  tareas: Tarea[]
  tags: Tag[]
  sprints: Sprint[]
  kanbanEstados: KanbanEstado[]
  onTaskClick: (t: Tarea) => void
}

export function GanttView({ tareas, tags, sprints, kanbanEstados, onTaskClick }: GanttViewProps) {
  const estadoMap = useMemo(
    () => Object.fromEntries(kanbanEstados.map((e) => [e.id, e])),
    [kanbanEstados],
  )
  const getEstadoColor = (estadoId: string): string =>
    estadoMap[estadoId]?.color ?? '#6B7280'
  const getEstadoNombre = (estadoId: string): string =>
    estadoMap[estadoId]?.nombre ?? '—'
  const [viewStart, setViewStart] = useState(() => startOfMonth(new Date()))
  const [mode, setMode] = useState<GanttMode>('tareas')

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

  function getBar(inicio: string, fin: string) {
    const start = startOfDay(new Date(inicio))
    const end = startOfDay(new Date(fin))
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

  function getTaskBar(t: Tarea) {
    if (!t.fecha_inicio || !t.fecha_fin) return null
    return getBar(t.fecha_inicio, t.fecha_fin)
  }

  // Shared month header + today line markup
  const MonthHeader = () => (
    <div className="flex border-b border-border bg-muted/30" style={{ minWidth: '640px' }}>
      <div className="w-44 flex-shrink-0 border-r border-border px-3 py-2 text-xs font-medium text-muted-foreground">
        {mode === 'global' ? 'Sprint' : 'Tarea'}
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
  )

  const TodayLine = () =>
    todayOffset >= 0 && todayOffset <= totalDays ? (
      <div
        className="absolute top-0 bottom-0 w-px bg-red-400/60 z-10 pointer-events-none"
        style={{ left: `calc(${(todayOffset / totalDays) * 100}% * (100% - 176px) / 100% + 176px)` }}
      />
    ) : null

  const TaskRow = ({ t, striped }: { t: Tarea; striped: boolean }) => {
    const bar = getTaskBar(t)
    const tag = t.tag_id ? tagMap[t.tag_id] : null
    return (
      <div
        className={`flex items-center border-b border-border last:border-b-0 ${striped ? 'bg-muted/10' : ''}`}
        style={{ height: '36px' }}
      >
        <div
          className="w-44 flex-shrink-0 border-r border-border px-3 text-xs truncate cursor-pointer hover:text-primary transition-colors h-full flex items-center gap-1.5"
          onClick={() => onTaskClick(t)}
        >
          {tag && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />}
          <span className="truncate">{t.descripcion}</span>
        </div>
        <div className="flex-1 relative h-full">
          {bar && (
            <div
              className="absolute top-1/2 -translate-y-1/2 h-5 rounded cursor-pointer transition-opacity opacity-80 hover:opacity-100"
              style={{ left: bar.left, width: bar.width, minWidth: '4px', backgroundColor: getEstadoColor(t.estado_kanban) }}
              onClick={() => onTaskClick(t)}
              title={`${t.descripcion}\n${t.fecha_inicio} → ${t.fecha_fin}`}
            />
          )}
        </div>
      </div>
    )
  }

  // ── Modo Tareas (comportamiento actual) ───────────────────────────────────────
  const renderTareas = () => (
    <>
      <div className="border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <MonthHeader />
          {planned.length === 0 ? (
            <div className="flex items-center justify-center text-sm text-muted-foreground" style={{ minWidth: '640px', height: '80px' }}>
              No hay tareas con fechas de inicio y fin
            </div>
          ) : (
            <div className="relative" style={{ minWidth: '640px' }}>
              <TodayLine />
              {planned.map((t, i) => <TaskRow key={t.id} t={t} striped={i % 2 !== 0} />)}
            </div>
          )}
        </div>
      </div>
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
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: getEstadoColor(t.estado_kanban) }} />
                  <span className="flex-1 truncate">{t.descripcion}</span>
                  {tag && (
                    <span className="flex-shrink-0 flex items-center gap-1 text-muted-foreground">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: tag.color }} />
                      {tag.nombre}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </>
  )

  // ── Modo Sprint (bandas de sprint + tareas dentro) ────────────────────────────
  const renderSprint = () => {
    if (sprints.length === 0) {
      return (
        <div className="flex items-center justify-center h-32 text-sm text-muted-foreground border border-dashed border-border rounded-lg">
          No hay sprints creados — crea sprints en la pestaña Sprints
        </div>
      )
    }
    const noSprint = tareas.filter((t) => !t.sprint_id && t.fecha_inicio && t.fecha_fin)
    return (
      <div className="border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <MonthHeader />
          <div className="relative" style={{ minWidth: '640px' }}>
            <TodayLine />
            {sprints.map((sprint, si) => {
              const sprintTareas = tareas.filter((t) => t.sprint_id === sprint.id && t.fecha_inicio && t.fecha_fin)
              const sprintBar = getBar(sprint.fecha_inicio, sprint.fecha_fin)
              const colorClass = SPRINT_COLORS[si % SPRINT_COLORS.length]
              return (
                <div key={sprint.id}>
                  {/* Sprint header row */}
                  <div className="flex items-center bg-muted/40 border-b border-border" style={{ height: '30px' }}>
                    <div className="w-44 flex-shrink-0 border-r border-border px-3 text-xs font-semibold truncate h-full flex items-center">
                      {sprint.nombre}
                    </div>
                    <div className="flex-1 relative h-full">
                      {sprintBar && (
                        <div
                          className={`absolute top-1/2 -translate-y-1/2 h-3 rounded-sm opacity-60 ${colorClass}`}
                          style={{ left: sprintBar.left, width: sprintBar.width, minWidth: '4px' }}
                          title={`${sprint.nombre}: ${sprint.fecha_inicio} → ${sprint.fecha_fin}`}
                        />
                      )}
                    </div>
                  </div>
                  {/* Tasks in this sprint */}
                  {sprintTareas.map((t, i) => <TaskRow key={t.id} t={t} striped={i % 2 !== 0} />)}
                  {sprintTareas.length === 0 && (
                    <div className="flex items-center border-b border-border" style={{ height: '32px' }}>
                      <div className="w-44 flex-shrink-0 border-r border-border px-3 text-xs text-muted-foreground/60 italic h-full flex items-center">
                        Sin tareas planificadas
                      </div>
                      <div className="flex-1" />
                    </div>
                  )}
                </div>
              )
            })}
            {noSprint.length > 0 && (
              <div>
                <div className="flex items-center bg-muted/20 border-b border-border" style={{ height: '30px' }}>
                  <div className="w-44 flex-shrink-0 border-r border-border px-3 text-xs font-semibold text-muted-foreground h-full flex items-center">
                    Sin sprint
                  </div>
                  <div className="flex-1" />
                </div>
                {noSprint.map((t, i) => <TaskRow key={t.id} t={t} striped={i % 2 !== 0} />)}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Modo Global (solo barras de sprints) ──────────────────────────────────────
  const renderGlobal = () => {
    if (sprints.length === 0) {
      return (
        <div className="flex items-center justify-center h-32 text-sm text-muted-foreground border border-dashed border-border rounded-lg">
          No hay sprints creados — crea sprints en la pestaña Sprints
        </div>
      )
    }
    return (
      <div className="border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <MonthHeader />
          <div className="relative" style={{ minWidth: '640px' }}>
            <TodayLine />
            {sprints.map((sprint, si) => {
              const bar = getBar(sprint.fecha_inicio, sprint.fecha_fin)
              const colorClass = SPRINT_COLORS[si % SPRINT_COLORS.length]
              const taskCount = tareas.filter((t) => t.sprint_id === sprint.id).length
              return (
                <div
                  key={sprint.id}
                  className={`flex items-center border-b border-border last:border-b-0 ${si % 2 !== 0 ? 'bg-muted/10' : ''}`}
                  style={{ height: '40px' }}
                >
                  <div className="w-44 flex-shrink-0 border-r border-border px-3 text-xs h-full flex flex-col justify-center">
                    <span className="font-semibold truncate">{sprint.nombre}</span>
                    <span className="text-muted-foreground">{taskCount} tareas</span>
                  </div>
                  <div className="flex-1 relative h-full">
                    {bar && (
                      <div
                        className={`absolute top-1/2 -translate-y-1/2 h-6 rounded cursor-default ${colorClass}`}
                        style={{ left: bar.left, width: bar.width, minWidth: '4px' }}
                        title={`${sprint.nombre}\n${sprint.fecha_inicio} → ${sprint.fecha_fin}\n${taskCount} tareas`}
                      />
                    )}
                    {!bar && (
                      <span className="absolute inset-0 flex items-center px-3 text-xs text-muted-foreground/50 italic">
                        Fuera del rango visible
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Navegación + modo */}
      <div className="flex items-center justify-between flex-wrap gap-2">
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
          <Button
            variant="ghost"
            size="sm"
            className="text-xs"
            onClick={() => setViewStart(startOfMonth(new Date()))}
          >
            Hoy
          </Button>
        </div>

        {/* Segmented control */}
        <div className="flex items-center rounded-md border border-border overflow-hidden text-xs">
          {(['tareas', 'sprint', 'global'] as GanttMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 py-1.5 transition-colors capitalize ${
                mode === m
                  ? 'bg-primary text-primary-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              {m === 'tareas' ? 'Tareas' : m === 'sprint' ? 'Por sprint' : 'Global'}
            </button>
          ))}
        </div>
      </div>

      {/* Leyenda (solo modos tareas y sprint) */}
      {mode !== 'global' && (
        <div className="flex flex-wrap gap-3">
          {kanbanEstados.map((e) => (
            <div key={e.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <div className="h-2.5 w-5 rounded-sm" style={{ backgroundColor: e.color }} />
              {e.nombre}
            </div>
          ))}
        </div>
      )}

      {mode === 'tareas' && renderTareas()}
      {mode === 'sprint' && renderSprint()}
      {mode === 'global' && renderGlobal()}
    </div>
  )
}
