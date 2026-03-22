import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Tarea, Tag } from '@/types'
import { cn, formatHoras } from '@/lib/utils'
import { Lock, Clock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

const ESTADO_PAGO_COLORS = {
  pendiente: 'text-yellow-500',
  facturado: 'text-blue-400',
  cobrado: 'text-green-400',
}

const ESTADO_PAGO_LABELS = {
  pendiente: 'Pendiente',
  facturado: 'Facturado',
  cobrado: 'Cobrado',
}

interface KanbanCardProps {
  tarea: Tarea
  tag?: Tag
  onClick?: (tarea: Tarea) => void
}

export function KanbanCard({ tarea, tag, onClick }: KanbanCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: tarea.id, disabled: tarea.is_locked })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onClick?.(tarea)}
      className={cn(
        'bg-card border border-border rounded-md p-3 space-y-2 cursor-pointer',
        'hover:border-primary/30 transition-colors select-none',
        isDragging && 'opacity-50 shadow-lg ring-1 ring-primary/50',
        tarea.is_locked && 'cursor-not-allowed opacity-75',
      )}
      data-testid="kanban-card"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm leading-snug flex-1 min-w-0 break-words">
          {tarea.descripcion}
        </p>
        {tarea.is_locked && (
          <Lock className="h-3 w-3 text-muted-foreground flex-shrink-0 mt-0.5" />
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span>{formatHoras(tarea.horas)}</span>
        </div>

        <div className="flex items-center gap-1.5">
          {tag && (
            <span
              className="inline-block w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: tag.color }}
              title={tag.nombre}
            />
          )}
          <span
            className={cn(
              'text-[10px] font-medium',
              ESTADO_PAGO_COLORS[tarea.estado_pago],
            )}
          >
            {ESTADO_PAGO_LABELS[tarea.estado_pago]}
          </span>
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground">{tarea.fecha}</p>
    </div>
  )
}
