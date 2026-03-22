import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '@/types'
import { api } from '@/lib/api'

interface AuthState {
  user: User | null
  accessToken: string | null
  setTokens: (access: string) => void
  setUser: (user: User) => void
  logout: () => Promise<void>
  fetchMe: () => Promise<void>
  isAuthenticated: () => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,

      setTokens: (access) => {
        localStorage.setItem('access_token', access)
        set({ accessToken: access })
      },

      setUser: (user) => set({ user }),

      logout: async () => {
        try {
          // El refresh token viaja como cookie HttpOnly; el backend lo revoca y limpia la cookie
          await api.post('/auth/logout', {})
        } catch {
          // ignorar errores de red en logout
        }
        localStorage.removeItem('access_token')
        set({ user: null, accessToken: null })
      },

      fetchMe: async () => {
        try {
          const { data } = await api.get<User>('/auth/me')
          set({ user: data })
        } catch {
          set({ user: null, accessToken: null })
        }
      },

      isAuthenticated: () => {
        return !!get().accessToken && !!get().user
      },
    }),
    {
      name: 'klyp-auth',
      partialize: (state) => ({
        accessToken: state.accessToken,
        user: state.user,
      }),
    },
  ),
)
