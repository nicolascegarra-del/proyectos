import { useState } from 'react'
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDroppable,
  DragOverEvent,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable'
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

function DroppableColumn({
  col,
  tareas,
  tags,
  isOver,
  onCardClick,
  onMarkDone,
}: {
  col: { id: EstadoKanban; label: string }
  tareas: Tarea[]
  tags: Map<string, Tag>
  isOver: boolean
  onCardClick?: (t: Tarea) => void
  onMarkDone?: (tareaId: string, estado: EstadoKanban) => void
}) {
  const { setNodeRef } = useDroppable({ id: col.id })
  const ids = tareas.map((t) => t.id)

  return (
    <div className="flex-1 min-w-[160px] flex flex-col gap-2">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {col.label}
        </h3>
        <span className="text-xs text-muted-foreground bg-muted rounded px-1.5 py-0.5">
          {tareas.length}
        </span>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          'flex-1 flex flex-col gap-2 p-2 rounded-lg border transition-colors min-h-[200px]',
          isOver ? 'bg-primary/10 border-primary/40' : 'bg-muted/20 border-border/50',
        )}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {tareas.length === 0 ? (
            <div className="flex items-center justify-center h-20 text-sm text-muted-foreground border-2 border-dashed rounded-lg">
              Sin tareas
            </div>
          ) : (
            tareas.map((tarea) => (
              <KanbanCard
                key={tarea.id}
                tarea={tarea}
                tag={tarea.tag_id ? tags.get(tarea.tag_id) : undefined}
                onClick={onCardClick}
                onMarkDone={onMarkDone}
              />
            ))
          )}
        </SortableContext>
      </div>
    </div>
  )
}

interface KanbanBoardProps {
  tareas: Tarea[]
  tags: Tag[]
  onMoveCard: (tareaId: string, newEstado: EstadoKanban) => Promise<void>
  onReorderCards: (col: EstadoKanban, orderedIds: string[]) => void
  onCardClick?: (tarea: Tarea) => void
}

export function KanbanBoard({ tareas, tags, onMoveCard, onReorderCards, onCardClick }: KanbanBoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [overColId, setOverColId] = useState<EstadoKanban | null>(null)

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 3 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  )

  const tagMap = new Map(tags.map((t) => [t.id, t]))

  const byColumn = (col: EstadoKanban) =>
    tareas.filter((t) => t.estado_kanban === col)

  const activeTarea = activeId ? tareas.find((t) => t.id === activeId) : null

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  const handleDragOver = (event: DragOverEvent) => {
    const overId = event.over?.id as EstadoKanban | undefined
    if (overId && COLUMNS.some((c) => c.id === overId)) {
      setOverColId(overId)
    } else {
      setOverColId(null)
    }
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)
    setOverColId(null)

    if (!over) return

    const activeId = active.id as string
    const overId = over.id as string

    const activeTarea = tareas.find((t) => t.id === activeId)
    if (!activeTarea) return

    // Dropped over a column header (droppable)
    if (COLUMNS.some((c) => c.id === overId)) {
      if (overId !== activeTarea.estado_kanban) {
        onMoveCard(activeId, overId as EstadoKanban)
      }
      return
    }

    // Dropped over another card (sortable) — same column reorder
    const overTarea = tareas.find((t) => t.id === overId)
    if (!overTarea) return

    if (activeTarea.estado_kanban !== overTarea.estado_kanban) {
      // Moved to a different column by dropping on a card
      onMoveCard(activeId, overTarea.estado_kanban)
    } else {
      // Reorder within the same column
      const col = activeTarea.estado_kanban
      const colTareas = tareas.filter((t) => t.estado_kanban === col)
      const ids = colTareas.map((t) => t.id)
      const oldIndex = ids.indexOf(activeId)
      const newIndex = ids.indexOf(overId)
      if (oldIndex !== newIndex) {
        onReorderCards(col, arrayMove(ids, oldIndex, newIndex))
      }
    }
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-3 overflow-x-auto pb-2 min-h-[400px]">
        {COLUMNS.map((col) => (
          <DroppableColumn
            key={col.id}
            col={col}
            tareas={byColumn(col.id)}
            tags={tagMap}
            isOver={overColId === col.id && !!activeId}
            onCardClick={onCardClick}
            onMarkDone={onMoveCard}
          />
        ))}
      </div>

      <DragOverlay dropAnimation={null}>
        {activeTarea && (
          <div className="rotate-2 shadow-xl opacity-95">
            <KanbanCard
              tarea={activeTarea}
              tag={activeTarea.tag_id ? tagMap.get(activeTarea.tag_id) : undefined}
            />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
