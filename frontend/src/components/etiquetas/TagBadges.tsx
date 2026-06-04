import type { Tag } from '@/types'
import { cn } from '@/lib/utils'

interface TagBadgesProps {
  tags: Tag[]
  className?: string
}

/** Renderiza un conjunto de etiquetas como chips de solo lectura con punto de color. */
export function TagBadges({ tags, className }: TagBadgesProps) {
  if (!tags?.length) return null
  return (
    <div className={cn('flex flex-wrap gap-1', className)}>
      {tags.map((t) => (
        <span
          key={t.id}
          className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: t.color }} />
          {t.nombre}
        </span>
      ))}
    </div>
  )
}
