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
import type { KanbanEstado, Tag, Tarea } from '@/types'
import { KanbanCard } from './KanbanCard'
import { cn } from '@/lib/utils'

function DroppableColumn({
  estado,
  tareas,
  isOver,
  onCardClick,
  onMarkDone,
}: {
  estado: KanbanEstado
  tareas: Tarea[]
  isOver: boolean
  onCardClick?: (t: Tarea) => void
  onMarkDone?: (tareaId: string, estadoId: string) => void
  // isFinalEstado is passed per-card from the column's estado.es_final
}) {
  const { setNodeRef } = useDroppable({ id: estado.id })
  const ids = tareas.map((t) => t.id)

  return (
    <div className="flex-1 min-w-[160px] flex flex-col gap-2">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: estado.color }}
          />
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {estado.nombre}
          </h3>
        </div>
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
                onClick={onCardClick}
                onMarkDone={onMarkDone}
                isFinalEstado={estado.es_final}
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
  estados: KanbanEstado[]
  onMoveCard: (tareaId: string, newEstadoId: string) => Promise<void>
  onReorderCards: (estadoId: string, orderedIds: string[]) => void
  onCardClick?: (tarea: Tarea) => void
}

export function KanbanBoard({ tareas, estados, onMoveCard, onReorderCards, onCardClick }: KanbanBoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [overColId, setOverColId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 3 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  )

  const estadoIds = new Set(estados.map((e) => e.id))

  // ID of the es_final estado (for quick-done button)
  const finalEstadoId = estados.find((e) => e.es_final)?.id ?? estados[estados.length - 1]?.id

  const byColumn = (estadoId: string) =>
    tareas.filter((t) => t.estado_kanban === estadoId)

  const activeTarea = activeId ? tareas.find((t) => t.id === activeId) : null

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  const handleDragOver = (event: DragOverEvent) => {
    const overId = event.over?.id as string | undefined
    if (overId && estadoIds.has(overId)) {
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
    if (estadoIds.has(overId)) {
      if (overId !== activeTarea.estado_kanban) {
        onMoveCard(activeId, overId)
      }
      return
    }

    // Dropped over another card (sortable)
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

  const handleMarkDone = (tareaId: string, _: string) => {
    if (finalEstadoId) {
      onMoveCard(tareaId, finalEstadoId)
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
        {estados.map((estado) => (
          <DroppableColumn
            key={estado.id}
            estado={estado}
            tareas={byColumn(estado.id)}
            isOver={overColId === estado.id && !!activeId}
            onCardClick={onCardClick}
            onMarkDone={handleMarkDone}
          />
        ))}
      </div>

      <DragOverlay dropAnimation={null}>
        {activeTarea && (
          <div className="rotate-2 shadow-xl opacity-95">
            <KanbanCard tarea={activeTarea} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
