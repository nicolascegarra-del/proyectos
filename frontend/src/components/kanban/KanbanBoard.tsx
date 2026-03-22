import { useState, useCallback } from 'react'
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCorners,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import type { EstadoKanban, Tag, Tarea } from '@/types'
import { KanbanCard } from './KanbanCard'
import { cn } from '@/lib/utils'

const COLUMNS: { id: EstadoKanban; label: string }[] = [
  { id: 'backlog', label: 'Backlog' },
  { id: 'todo', label: 'Por hacer' },
  { id: 'en_progreso', label: 'En progreso' },
  { id: 'revision', label: 'Revisión' },
  { id: 'done', label: 'Hecho' },
]

interface KanbanBoardProps {
  tareas: Tarea[]
  tags: Tag[]
  onMoveCard: (tareaId: string, newEstado: EstadoKanban) => Promise<void>
  onCardClick?: (tarea: Tarea) => void
}

export function KanbanBoard({ tareas, tags, onMoveCard, onCardClick }: KanbanBoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [overColId, setOverColId] = useState<EstadoKanban | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
  )

  const tagMap = new Map(tags.map((t) => [t.id, t]))

  const byColumn = (col: EstadoKanban) =>
    tareas.filter((t) => t.estado_kanban === col && !t.es_backlog)

  const activeTarea = activeId ? tareas.find((t) => t.id === activeId) : null

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }, [])

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const overId = event.over?.id as string | undefined
    if (!overId) { setOverColId(null); return }
    const col = COLUMNS.find((c) => c.id === overId)
    if (col) { setOverColId(col.id); return }
    const colFromCard = tareas.find((t) => t.id === overId)?.estado_kanban ?? null
    setOverColId(colFromCard as EstadoKanban | null)
  }, [tareas])

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveId(null)
      setOverColId(null)
      const { active, over } = event
      if (!over) return

      const overId = over.id as string
      const targetCol = COLUMNS.find(
        (c) => c.id === overId || tareas.find((t) => t.id === overId)?.estado_kanban === c.id,
      )

      const targetEstado: EstadoKanban | undefined =
        (COLUMNS.find((c) => c.id === overId)?.id) ??
        tareas.find((t) => t.id === overId)?.estado_kanban

      if (targetEstado && targetEstado !== tareas.find((t) => t.id === active.id)?.estado_kanban) {
        await onMoveCard(active.id as string, targetEstado)
      }
    },
    [tareas, onMoveCard],
  )

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-3 overflow-x-auto pb-2 min-h-[400px]">
        {COLUMNS.map((col) => {
          const colTareas = byColumn(col.id)
          return (
            <div
              key={col.id}
              className="flex-shrink-0 w-64 flex flex-col gap-2"
            >
              <div className="flex items-center justify-between px-1">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {col.label}
                </h3>
                <span className="text-xs text-muted-foreground bg-muted rounded px-1.5 py-0.5">
                  {colTareas.length}
                </span>
              </div>

              <SortableContext
                items={colTareas.map((t) => t.id)}
                strategy={verticalListSortingStrategy}
              >
                <div
                  id={col.id}
                  className={cn(
                    'flex-1 flex flex-col gap-2 p-2 rounded-lg border transition-colors',
                    overColId === col.id && activeId
                      ? 'bg-primary/10 border-primary/40'
                      : 'bg-muted/20 border-border/50',
                    'min-h-[200px]',
                  )}
                >
                  {colTareas.length === 0 ? (
                    <div className="flex items-center justify-center h-20 text-sm text-muted-foreground border-2 border-dashed rounded-lg">
                      Sin tareas
                    </div>
                  ) : (
                    colTareas.map((tarea) => (
                      <KanbanCard
                        key={tarea.id}
                        tarea={tarea}
                        tag={tarea.tag_id ? tagMap.get(tarea.tag_id) : undefined}
                        onClick={onCardClick}
                      />
                    ))
                  )}
                </div>
              </SortableContext>
            </div>
          )
        })}
      </div>

      <DragOverlay>
        {activeTarea && (
          <KanbanCard
            tarea={activeTarea}
            tag={activeTarea.tag_id ? tagMap.get(activeTarea.tag_id) : undefined}
          />
        )}
      </DragOverlay>
    </DndContext>
  )
}
