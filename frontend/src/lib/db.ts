import Dexie, { Table } from 'dexie'
import type {
  Articulo,
  Cliente,
  Gasto,
  Presupuesto,
  PresupuestoLinea,
  Proyecto,
  Tag,
  Tarea,
} from '@/types'

export interface SyncQueueItem {
  id?: number
  entity: string
  entity_id: string
  action: 'create' | 'update' | 'delete'
  data: Record<string, unknown>
  client_updated_at: string
  created_at: string
}

export type LocalTarea = Tarea & { _synced: boolean }
export type LocalGasto = Gasto & { _synced: boolean }
export type LocalProyecto = Proyecto & { _synced: boolean }
export type LocalCliente = Cliente & { _synced: boolean }
export type LocalPresupuesto = Presupuesto & { _synced: boolean }
export type LocalPresupuestoLinea = PresupuestoLinea & { _synced: boolean }
export type LocalTag = Tag & { _synced: boolean }
export type LocalArticulo = Articulo & { _synced: boolean }

export class KlypDB extends Dexie {
  tareas!: Table<LocalTarea>
  gastos!: Table<LocalGasto>
  proyectos!: Table<LocalProyecto>
  clientes!: Table<LocalCliente>
  presupuestos!: Table<LocalPresupuesto>
  presupuesto_lineas!: Table<LocalPresupuestoLinea>
  tags!: Table<LocalTag>
  articulos!: Table<LocalArticulo>
  sync_queue!: Table<SyncQueueItem>

  constructor() {
    super('klypdb')
    this.version(1).stores({
      tareas: 'id, proyecto_id, _synced, updated_at, fecha',
      gastos: 'id, proyecto_id, _synced, updated_at',
      proyectos: 'id, workspace_id, _synced, updated_at',
      clientes: 'id, workspace_id, _synced, updated_at',
      presupuestos: 'id, workspace_id, _synced, updated_at',
      presupuesto_lineas: 'id, presupuesto_id, _synced, updated_at',
      tags: 'id, workspace_id',
      articulos: 'id, workspace_id',
      sync_queue: '++id, entity, entity_id, action, created_at',
    })
  }
}

export const db = new KlypDB()

export async function enqueueSync(
  entity: string,
  entity_id: string,
  action: 'create' | 'update' | 'delete',
  data: Record<string, unknown>,
) {
  const now = new Date().toISOString()
  await db.sync_queue.add({
    entity,
    entity_id,
    action,
    data,
    client_updated_at: now,
    created_at: now,
  })
}

export async function clearSyncedItems(appliedIds: string[]) {
  if (appliedIds.length === 0) return
  await db.sync_queue
    .filter((item) => appliedIds.includes(item.entity_id))
    .delete()
}

export async function getPendingSyncItems(): Promise<SyncQueueItem[]> {
  return db.sync_queue.orderBy('created_at').toArray()
}

export async function upsertLocal<T extends { id: string }>(
  table: Table<T & { _synced: boolean }>,
  item: T,
  synced = true,
) {
  await table.put({ ...item, _synced: synced })
}

export async function deleteLocal<T extends { id: string }>(
  table: Table<T>,
  id: string,
) {
  await table.delete(id)
}
