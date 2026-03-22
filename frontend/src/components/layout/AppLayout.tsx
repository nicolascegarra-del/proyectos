import { useEffect, useState } from 'react'
import { Outlet } from '@tanstack/react-router'
import { useAuthStore } from '@/store/authStore'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { setupNetworkListener } from '@/lib/sync'
import Header from './Header'
import Sidebar from './Sidebar'
import BottomNav from './BottomNav'
import { ConflictModal } from '../sync/ConflictModal'
import { useSyncStore } from '@/store/syncStore'
import { Toaster } from '@/components/ui/toaster'
import { Loader2 } from 'lucide-react'

export default function AppLayout() {
  const fetchMe = useAuthStore((s) => s.fetchMe)
  const fetchWorkspaces = useWorkspaceStore((s) => s.fetchWorkspaces)
  const conflicts = useSyncStore((s) => s.conflicts)
  const [initializing, setInitializing] = useState(true)

  useEffect(() => {
    Promise.all([fetchMe(), fetchWorkspaces()])
      .catch(() => {})
      .finally(() => setInitializing(false))
    setupNetworkListener()
  }, [])

  if (initializing) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar className="hidden md:flex" />
      <div className="flex flex-col flex-1 min-w-0">
        <Header />
        <main className="flex-1 overflow-y-auto p-4 pb-20 md:pb-4">
          <Outlet />
        </main>
        <BottomNav className="md:hidden" />
      </div>
      {conflicts.length > 0 && <ConflictModal />}
      <Toaster />
    </div>
  )
}
