import { Link, useRouterState } from '@tanstack/react-router'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  FolderKanban,
  Users,
  Clock,
  Receipt,
  FileText,
  Settings,
  Building2,
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { to: '/proyectos', label: 'Proyectos', icon: FolderKanban },
  { to: '/tareas', label: 'Bitácora', icon: Clock },
  { to: '/gastos', label: 'Gastos', icon: Receipt },
  { to: '/presupuestos', label: 'Presupuestos', icon: FileText },
  { to: '/clientes', label: 'Clientes', icon: Users },
]

interface SidebarProps {
  className?: string
}

export default function Sidebar({ className }: SidebarProps) {
  const { location } = useRouterState()
  const user = useAuthStore((s) => s.user)

  const isActive = (to: string, exact?: boolean) => {
    if (exact) return location.pathname === to
    return location.pathname.startsWith(to)
  }

  return (
    <aside
      className={cn(
        'w-56 flex-col border-r border-border bg-background/50 flex-shrink-0',
        className,
      )}
    >
      <div className="h-14 flex items-center px-4 border-b border-border">
        <img src="/logo.png" alt="Klyp" className="h-10 w-auto mix-blend-screen" />
      </div>

      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        {navItems.map(({ to, label, icon: Icon, exact }) => (
          <Link
            key={to}
            to={to}
            className={cn(
              'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors min-h-[44px]',
              isActive(to, exact)
                ? 'bg-primary/10 text-primary font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent',
            )}
          >
            <Icon className="h-4 w-4 flex-shrink-0" />
            {label}
          </Link>
        ))}
      </nav>

      <div className="p-2 border-t border-border space-y-0.5">
        <Link
          to="/configuracion"
          className={cn(
            'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors min-h-[44px]',
            isActive('/configuracion')
              ? 'bg-primary/10 text-primary font-medium'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent',
          )}
        >
          <Settings className="h-4 w-4 flex-shrink-0" />
          Configuración
        </Link>
        {user?.is_superadmin && (
          <Link
            to="/superadmin"
            className={cn(
              'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors min-h-[44px]',
              isActive('/superadmin')
                ? 'bg-primary/10 text-primary font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent',
            )}
          >
            <Building2 className="h-4 w-4 flex-shrink-0" />
            Superadmin
          </Link>
        )}
      </div>
    </aside>
  )
}
