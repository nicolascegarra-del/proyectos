import type { Tag } from '@/types'
import { cn } from '@/lib/utils'
import { Check } from 'lucide-react'

interface TagPickerProps {
  tags: Tag[]
  value: string[]
  onChange: (ids: string[]) => void
  emptyHint?: string
}

/** Selector multietiqueta basado en chips conmutables. */
export function TagPicker({ tags, value, onChange, emptyHint }: TagPickerProps) {
  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id])

  if (!tags.length) {
    return (
      <p className="text-xs text-muted-foreground italic">
        {emptyHint ?? 'No tienes etiquetas. Créalas en el menú Etiquetas.'}
      </p>
    )
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((t) => {
        const active = value.includes(t.id)
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => toggle(t.id)}
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors min-h-[32px]',
              active
                ? 'border-transparent text-white'
                : 'border-border text-muted-foreground hover:bg-accent',
            )}
            style={active ? { backgroundColor: t.color } : undefined}
          >
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: active ? '#ffffff' : t.color }}
            />
            {t.nombre}
            {active && <Check className="h-3 w-3" />}
          </button>
        )
      })}
    </div>
  )
}
