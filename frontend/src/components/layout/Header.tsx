import { useWorkspaceStore } from '@/store/workspaceStore'
import { useAuthStore } from '@/store/authStore'
import { SyncIndicator } from '../sync/SyncIndicator'
import { useNavigate } from '@tanstack/react-router'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ChevronDown, LogOut, Settings, User, Shield } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function Header() {
  const { currentWorkspace, workspaces, setCurrentWorkspace, fetchMembers } = useWorkspaceStore()
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  const handleWorkspaceChange = (ws: typeof currentWorkspace) => {
    if (!ws) return
    setCurrentWorkspace(ws)
    fetchMembers(ws.id)
  }

  const handleLogout = async () => {
    await logout()
    navigate({ to: '/login' })
  }

  return (
    <header className="h-14 border-b border-border bg-background/95 backdrop-blur px-4 flex items-center justify-between gap-2 flex-shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="flex items-center gap-1.5 h-9 px-2 min-w-0 max-w-[200px]"
            >
              <span className="truncate text-sm font-medium">
                {currentWorkspace?.nombre ?? 'Sin workspace'}
              </span>
              <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            {workspaces.map((ws) => (
              <DropdownMenuItem
                key={ws.id}
                onClick={() => handleWorkspaceChange(ws)}
                className={currentWorkspace?.id === ws.id ? 'bg-accent' : ''}
              >
                {ws.nombre}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate({ to: '/workspaces' })}>
              Gestionar workspaces
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex items-center gap-2">
        <SyncIndicator />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full">
              <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-semibold text-primary">
                {user?.nombre?.charAt(0).toUpperCase() ?? 'U'}
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <div className="px-2 py-1.5">
              <p className="text-sm font-medium truncate">{user?.nombre}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate({ to: '/configuracion' })}>
              <Settings className="mr-2 h-4 w-4" />
              Configuración
            </DropdownMenuItem>
            {user?.is_superadmin && (
              <DropdownMenuItem onClick={() => navigate({ to: '/superadmin' })}>
                <Shield className="mr-2 h-4 w-4" />
                Superadmin
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              Cerrar sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
