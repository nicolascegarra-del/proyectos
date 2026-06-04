import { describe, it, expect, beforeEach } from 'vitest'
import { db, enqueueSync, getPendingSyncItems, clearSyncedItems, upsertLocal } from '@/lib/db'

describe('Offline sync queue', () => {
  beforeEach(async () => {
    await db.sync_queue.clear()
    await db.tareas.clear()
  })

  it('enqueues a create action', async () => {
    await enqueueSync('tarea', 'abc-123', 'create', { descripcion: 'Test', horas: 1 })
    const items = await getPendingSyncItems()
    expect(items).toHaveLength(1)
    expect(items[0].entity).toBe('tarea')
    expect(items[0].entity_id).toBe('abc-123')
    expect(items[0].action).toBe('create')
  })

  it('enqueues an update action', async () => {
    await enqueueSync('tarea', 'abc-456', 'update', { estado_pago: 'cobrado' })
    const items = await getPendingSyncItems()
    expect(items).toHaveLength(1)
    expect(items[0].action).toBe('update')
  })

  it('clears synced items by entity_id', async () => {
    await enqueueSync('tarea', 'id-1', 'create', {})
    await enqueueSync('tarea', 'id-2', 'update', {})
    await clearSyncedItems(['id-1'])

    const items = await getPendingSyncItems()
    expect(items).toHaveLength(1)
    expect(items[0].entity_id).toBe('id-2')
  })

  it('upserts a tarea locally in IndexedDB', async () => {
    const localTask = {
      id: 'local-uuid-001',
      proyecto_id: 'proj-001',
      descripcion: 'Tarea offline',
      horas: 2,
      fecha: '2026-01-01',
      estado_pago: 'pendiente' as const,
      is_locked: false,
      es_backlog: false,
      estado_kanban: 'todo' as const,
      tags: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    await upsertLocal(db.tareas, localTask, false)
    const stored = await db.tareas.get('local-uuid-001')
    expect(stored).toBeDefined()
    expect(stored?.descripcion).toBe('Tarea offline')
    expect(stored?._synced).toBe(false)
  })

  it('accumulates multiple pending items', async () => {
    await enqueueSync('tarea', 'tid-1', 'create', {})
    await enqueueSync('tarea', 'tid-2', 'update', {})
    await enqueueSync('tarea', 'tid-3', 'update', {})
    const items = await getPendingSyncItems()
    expect(items).toHaveLength(3)
  })
})
