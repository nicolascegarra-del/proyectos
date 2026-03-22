import { api } from './api'
import {
  clearSyncedItems,
  db,
  getPendingSyncItems,
  upsertLocal,
} from './db'
import type { SyncConflict, SyncResponse } from '@/types'
import { useSyncStore } from '@/store/syncStore'
import { useWorkspaceStore } from '@/store/workspaceStore'

const LAST_SYNC_KEY = 'klyp_last_sync_at'

export async function performSync(): Promise<SyncConflict[]> {
  const workspaceId = useWorkspaceStore.getState().currentWorkspace?.id
  if (!workspaceId) return []

  const syncStore = useSyncStore.getState()
  if (syncStore.syncing) return []

  syncStore.setSyncing(true)

  try {
    const pending = await getPendingSyncItems()
    const lastSyncAt = localStorage.getItem(LAST_SYNC_KEY + '_' + workspaceId) || null

    const payload = {
      last_sync_at: lastSyncAt,
      changes: pending.map((item) => ({
        entity: item.entity,
        id: item.entity_id,
        action: item.action,
        data: item.data,
        client_updated_at: item.client_updated_at,
      })),
    }

    const { data }: { data: SyncResponse } = await api.post(
      `/workspaces/${workspaceId}/sync`,
      payload,
    )

    await clearSyncedItems(data.applied)

    for (const [entity, items] of Object.entries(data.server_updates)) {
      for (const item of items) {
        await applyServerUpdate(entity, item as Record<string, unknown>)
      }
    }

    localStorage.setItem(LAST_SYNC_KEY + '_' + workspaceId, data.synced_at)
    syncStore.setPendingCount(0)

    if (data.conflicts.length > 0) {
      syncStore.setConflicts(data.conflicts)
    }

    return data.conflicts
  } catch {
    syncStore.setError('Error de sincronización')
    return []
  } finally {
    syncStore.setSyncing(false)
  }
}

async function applyServerUpdate(entity: string, item: Record<string, unknown>) {
  const id = item.id as string
  switch (entity) {
    case 'tarea':
      await upsertLocal(db.tareas, item as Parameters<typeof upsertLocal>[1])
      break
    case 'gasto':
      await upsertLocal(db.gastos, item as Parameters<typeof upsertLocal>[1])
      break
    case 'proyecto':
      await upsertLocal(db.proyectos, item as Parameters<typeof upsertLocal>[1])
      break
    case 'cliente':
      await upsertLocal(db.clientes, item as Parameters<typeof upsertLocal>[1])
      break
    case 'presupuesto':
      await upsertLocal(db.presupuestos, item as Parameters<typeof upsertLocal>[1])
      break
    case 'presupuesto_linea':
      await upsertLocal(db.presupuesto_lineas, item as Parameters<typeof upsertLocal>[1])
      break
    case 'tag':
      await upsertLocal(db.tags, item as Parameters<typeof upsertLocal>[1])
      break
    case 'articulo':
      await upsertLocal(db.articulos, item as Parameters<typeof upsertLocal>[1])
      break
  }
}

export async function resolveConflict(
  conflict: SyncConflict,
  useServer: boolean,
) {
  if (useServer) {
    await applyServerUpdate(conflict.entity, conflict.server_data as Record<string, unknown>)
  } else {
    const workspaceId = useWorkspaceStore.getState().currentWorkspace?.id
    if (!workspaceId) return
    await api.post(`/workspaces/${workspaceId}/sync`, {
      last_sync_at: null,
      changes: [
        {
          entity: conflict.entity,
          id: conflict.id,
          action: 'update',
          data: conflict.client_data,
          client_updated_at: new Date().toISOString(),
        },
      ],
    })
  }

  const syncStore = useSyncStore.getState()
  syncStore.setConflicts(
    syncStore.conflicts.filter((c) => c.id !== conflict.id),
  )
}

export function setupNetworkListener() {
  window.addEventListener('online', async () => {
    useSyncStore.getState().setOnline(true)
    const pending = await getPendingSyncItems()
    if (pending.length > 0) {
      await performSync()
    }
  })
  window.addEventListener('offline', () => {
    useSyncStore.getState().setOnline(false)
  })
  useSyncStore.getState().setOnline(navigator.onLine)
}
