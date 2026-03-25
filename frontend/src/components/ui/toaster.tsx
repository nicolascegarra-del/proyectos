import { useToast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'
import { X } from 'lucide-react'

export function Toaster() {
  const { toasts, dismiss } = useToast()

  return (
    <div className="fixed bottom-0 right-0 z-[100] flex max-h-screen w-full flex-col-reverse gap-2 p-4 sm:bottom-4 sm:right-4 sm:top-auto sm:w-[380px]">
      {toasts.map(({ id, title, description, variant, open }) => (
          <div
            key={id}
            className={cn(
              'pointer-events-auto relative flex w-full items-start gap-3 overflow-hidden rounded-lg border p-4 shadow-lg',
              'transition-all duration-300',
              open ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none',
              variant === 'destructive'
                ? 'border-destructive/50 bg-destructive text-destructive-foreground'
                : 'border-border bg-card text-card-foreground',
            )}
          >
            <div className="flex-1 min-w-0">
              {title && <p className="text-sm font-semibold">{title}</p>}
              {description && <p className="text-xs opacity-80 mt-0.5">{description}</p>}
            </div>
            <button
              onClick={() => dismiss(id)}
              className="shrink-0 rounded-sm opacity-70 hover:opacity-100 focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )
      )}
    </div>
  )
}
