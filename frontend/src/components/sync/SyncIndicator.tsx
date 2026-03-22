import { useSyncStore } from '@/store/syncStore'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { performSync } from '@/lib/sync'
import { cn } from '@/lib/utils'
import { RefreshCw, WifiOff, AlertTriangle, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

export function SyncIndicator() {
  const { syncing, online, pendingCount, error, conflicts } = useSyncStore()
  const currentWorkspace = useWorkspaceStore((s) => s.currentWorkspace)

  const handleSync = async () => {
    if (!currentWorkspace) return
    await performSync()
  }

  if (!online) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5 text-yellow-500 text-xs">
              <WifiOff className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Sin conexión</span>
              {pendingCount > 0 && (
                <span className="bg-yellow-500/20 text-yellow-500 px-1.5 py-0.5 rounded text-[10px] font-medium">
                  {pendingCount}
                </span>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>Sin conexión. {pendingCount} cambios pendientes de sincronizar.</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  if (conflicts.length > 0) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5 text-orange-500 text-xs">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{conflicts.length} conflictos</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>Hay {conflicts.length} conflictos de sincronización que resolver.</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  if (error) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={handleSync}
        className="h-7 gap-1.5 text-xs text-destructive hover:text-destructive"
      >
        <RefreshCw className="h-3 w-3" />
        <span className="hidden sm:inline">Error sync</span>
      </Button>
    )
  }

  if (syncing) {
    return (
      <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
        <span className="hidden sm:inline">Sincronizando...</span>
      </div>
    )
  }

  if (pendingCount > 0) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={handleSync}
        className="h-7 gap-1.5 text-xs"
      >
        <RefreshCw className="h-3 w-3" />
        <span className="hidden sm:inline">Sync ({pendingCount})</span>
      </Button>
    )
  }

  return (
    <div className="flex items-center gap-1 text-muted-foreground/60 text-xs">
      <Check className="h-3 w-3 text-green-500" />
      <span className="hidden sm:inline">Sincronizado</span>
    </div>
  )
}
