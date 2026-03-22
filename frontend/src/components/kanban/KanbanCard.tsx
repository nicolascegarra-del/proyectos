import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Tarea, Tag } from '@/types'
import { cn, formatHoras } from '@/lib/utils'
import { Lock, Clock, Github, Paperclip } from 'lucide-react'

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

const PRIORIDAD_COLORS = {
  critico: 'bg-red-500/20 text-red-400',
  alto: 'bg-orange-500/20 text-orange-400',
  medio: 'bg-yellow-500/20 text-yellow-400',
  bajo: 'bg-green-500/20 text-green-400',
}

const PRIORIDAD_LABELS = {
  critico: 'Crítico',
  alto: 'Alto',
  medio: 'Medio',
  bajo: 'Bajo',
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

      {/* Prioridad y complejidad */}
      {(tarea.prioridad || tarea.complejidad) && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {tarea.prioridad && (
            <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${PRIORIDAD_COLORS[tarea.prioridad]}`}>
              {PRIORIDAD_LABELS[tarea.prioridad]}
            </span>
          )}
          {tarea.complejidad && (
            <span
              className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold ${
                tarea.complejidad === 9
                  ? 'bg-red-500/20 text-red-400'
                  : 'bg-muted text-muted-foreground'
              }`}
              title={tarea.complejidad === 9 ? 'Dividir tarea — demasiado compleja' : `Complejidad: ${tarea.complejidad}`}
            >
              {tarea.complejidad === 9 ? 'DIVIDIR' : `C${tarea.complejidad}`}
            </span>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span>{formatHoras(tarea.horas)}</span>
          {tarea.github_url && (
            <Github className="h-3 w-3" title="GitHub" />
          )}
          {tarea.archivo_url && (
            <Paperclip className="h-3 w-3" title="Archivo adjunto" />
          )}
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
