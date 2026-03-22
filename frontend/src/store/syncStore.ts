import { create } from 'zustand'
import type { SyncConflict } from '@/types'

interface SyncState {
  syncing: boolean
  online: boolean
  pendingCount: number
  conflicts: SyncConflict[]
  error: string | null
  setSyncing: (v: boolean) => void
  setOnline: (v: boolean) => void
  setPendingCount: (n: number) => void
  setConflicts: (c: SyncConflict[]) => void
  setError: (e: string | null) => void
  incrementPending: () => void
}

export const useSyncStore = create<SyncState>((set, get) => ({
  syncing: false,
  online: navigator.onLine,
  pendingCount: 0,
  conflicts: [],
  error: null,

  setSyncing: (v) => set({ syncing: v }),
  setOnline: (v) => set({ online: v }),
  setPendingCount: (n) => set({ pendingCount: n }),
  setConflicts: (c) => set({ conflicts: c }),
  setError: (e) => set({ error: e }),
  incrementPending: () => set({ pendingCount: get().pendingCount + 1 }),
}))
