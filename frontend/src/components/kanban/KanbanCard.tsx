import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { EstadoKanban, Tarea, Tag } from '@/types'
import { cn, formatHoras } from '@/lib/utils'
import { Lock, Clock, Github, Paperclip, GripVertical, CheckCheck, ListChecks } from 'lucide-react'

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
  onMarkDone?: (tareaId: string, estado: EstadoKanban) => void
}

export function KanbanCard({ tarea, tag, onClick, onMarkDone }: KanbanCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tarea.id,
    disabled: tarea.is_locked,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const isDone = tarea.estado_kanban === 'done'

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      onClick={() => onClick?.(tarea)}
      className={cn(
        'bg-card border border-border rounded-md p-3 space-y-2',
        'hover:border-primary/30 transition-colors select-none group',
        isDragging && 'opacity-40 z-50',
        tarea.is_locked ? 'cursor-not-allowed opacity-75' : 'cursor-pointer',
      )}
      data-testid="kanban-card"
    >
      <div className="flex items-start gap-1">
        {!tarea.is_locked && (
          <span
            {...listeners}
            className="flex-shrink-0 mt-0.5 cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground transition-colors touch-none"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="h-4 w-4" />
          </span>
        )}
        <p className="text-sm leading-snug flex-1 min-w-0 break-words">
          {tarea.descripcion}
        </p>
        {tarea.is_locked && (
          <Lock className="h-3 w-3 text-muted-foreground flex-shrink-0 mt-0.5" />
        )}
        {/* Botón rápido "Marcar como hecho" */}
        {!tarea.is_locked && !isDone && onMarkDone && (
          <button
            type="button"
            title="Marcar como hecho"
            onClick={(e) => { e.stopPropagation(); onMarkDone(tarea.id, 'done') }}
            className="flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-green-400"
          >
            <CheckCheck className="h-4 w-4" />
          </button>
        )}
      </div>

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

      {(tarea.subtareas_total ?? 0) > 0 && (
        <div className="flex items-center gap-1">
          <ListChecks className="h-3 w-3 text-muted-foreground" />
          <span className={`text-[10px] ${tarea.subtareas_completadas === tarea.subtareas_total ? 'text-green-400' : 'text-muted-foreground'}`}>
            {tarea.subtareas_completadas}/{tarea.subtareas_total}
          </span>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span>{formatHoras(tarea.horas)}</span>
          {tarea.github_url && <Github className="h-3 w-3" title="GitHub" />}
          {tarea.archivo_url && <Paperclip className="h-3 w-3" title="Archivo adjunto" />}
        </div>
        <div className="flex items-center gap-1.5">
          {tag && (
            <span
              className="inline-block w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: tag.color }}
              title={tag.nombre}
            />
          )}
          <span className={cn('text-[10px] font-medium', ESTADO_PAGO_COLORS[tarea.estado_pago])}>
            {ESTADO_PAGO_LABELS[tarea.estado_pago]}
          </span>
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground">{tarea.fecha}</p>
    </div>
  )
}
