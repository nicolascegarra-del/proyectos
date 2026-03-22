import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Workspace, WorkspaceMember } from '@/types'
import { api } from '@/lib/api'

interface WorkspaceState {
  workspaces: Workspace[]
  currentWorkspace: Workspace | null
  members: WorkspaceMember[]
  setWorkspaces: (ws: Workspace[]) => void
  setCurrentWorkspace: (ws: Workspace | null) => void
  setMembers: (members: WorkspaceMember[]) => void
  fetchWorkspaces: () => Promise<void>
  fetchMembers: (workspaceId: string) => Promise<void>
  getCurrentUserRol: (userId: string) => WorkspaceMember['rol'] | null
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      workspaces: [],
      currentWorkspace: null,
      members: [],

      setWorkspaces: (ws) => set({ workspaces: ws }),
      setCurrentWorkspace: (ws) => set({ currentWorkspace: ws }),
      setMembers: (members) => set({ members }),

      fetchWorkspaces: async () => {
        const { data } = await api.get<Workspace[]>('/workspaces')
        set({ workspaces: data })
        if (data.length > 0 && !get().currentWorkspace) {
          set({ currentWorkspace: data[0] })
        }
        if (get().currentWorkspace) {
          const updated = data.find((w) => w.id === get().currentWorkspace?.id)
          if (updated) set({ currentWorkspace: updated })
        }
      },

      fetchMembers: async (workspaceId) => {
        const { data } = await api.get<WorkspaceMember[]>(
          `/workspaces/${workspaceId}/members`,
        )
        set({ members: data })
      },

      getCurrentUserRol: (userId) => {
        const member = get().members.find((m) => m.user_id === userId)
        return member?.rol ?? null
      },
    }),
    {
      name: 'klyp-workspace',
      partialize: (state) => ({
        currentWorkspace: state.currentWorkspace,
      }),
    },
  ),
)
