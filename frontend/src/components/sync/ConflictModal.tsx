import { useState } from 'react'
import { useSyncStore } from '@/store/syncStore'
import { resolveConflict } from '@/lib/sync'
import type { SyncConflict } from '@/types'
import { formatDatetime } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, Monitor, Cloud } from 'lucide-react'

const ENTITY_LABELS: Record<string, string> = {
  tarea: 'Tarea',
  gasto: 'Gasto',
  proyecto: 'Proyecto',
  cliente: 'Cliente',
  presupuesto: 'Presupuesto',
  presupuesto_linea: 'Línea de presupuesto',
}

const IGNORE_FIELDS = ['id', 'created_at', '_synced']

function ConflictRow({ conflict }: { conflict: SyncConflict }) {
  const [resolving, setResolving] = useState(false)

  const allKeys = Array.from(
    new Set([
      ...Object.keys(conflict.client_data),
      ...Object.keys(conflict.server_data),
    ]),
  ).filter((k) => !IGNORE_FIELDS.includes(k))

  const diffKeys = allKeys.filter(
    (k) =>
      JSON.stringify(conflict.client_data[k]) !==
      JSON.stringify(conflict.server_data[k]),
  )

  const handleResolve = async (useServer: boolean) => {
    setResolving(true)
    await resolveConflict(conflict, useServer)
    setResolving(false)
  }

  return (
    <div className="border border-border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-orange-500" />
          <span className="text-sm font-medium">
            {ENTITY_LABELS[conflict.entity] ?? conflict.entity}
          </span>
        </div>
        <Badge variant="outline" className="text-xs">
          Servidor: {formatDatetime(conflict.server_updated_at)}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-1 font-medium text-blue-400">
            <Monitor className="h-3 w-3" />
            Tu versión (local)
          </div>
          {diffKeys.map((k) => (
            <div key={k} className="bg-blue-950/30 rounded p-1.5">
              <span className="text-muted-foreground">{k}: </span>
              <span className="text-blue-300">
                {String(conflict.client_data[k] ?? '—')}
              </span>
            </div>
          ))}
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-1 font-medium text-purple-400">
            <Cloud className="h-3 w-3" />
            Versión servidor
          </div>
          {diffKeys.map((k) => (
            <div key={k} className="bg-purple-950/30 rounded p-1.5">
              <span className="text-muted-foreground">{k}: </span>
              <span className="text-purple-300">
                {String(conflict.server_data[k] ?? '—')}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          className="flex-1 h-10 border-blue-500/30 hover:bg-blue-950/30 hover:text-blue-300"
          onClick={() => handleResolve(false)}
          disabled={resolving}
        >
          <Monitor className="mr-1.5 h-3.5 w-3.5" />
          Usar mi versión
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="flex-1 h-10 border-purple-500/30 hover:bg-purple-950/30 hover:text-purple-300"
          onClick={() => handleResolve(true)}
          disabled={resolving}
        >
          <Cloud className="mr-1.5 h-3.5 w-3.5" />
          Usar servidor
        </Button>
      </div>
    </div>
  )
}

export function ConflictModal() {
  const conflicts = useSyncStore((s) => s.conflicts)

  return (
    <Dialog open={conflicts.length > 0}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            Conflictos de sincronización ({conflicts.length})
          </DialogTitle>
          <DialogDescription>
            Hay cambios que entran en conflicto entre tu versión local y el
            servidor. Elige cuál versión mantener para cada conflicto.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          {conflicts.map((c) => (
            <ConflictRow key={`${c.entity}-${c.id}`} conflict={c} />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
