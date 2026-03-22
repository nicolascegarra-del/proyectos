import { Link, useRouterState } from '@tanstack/react-router'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  FolderKanban,
  Clock,
  FileText,
  MoreHorizontal,
} from 'lucide-react'

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { to: '/proyectos', label: 'Proyectos', icon: FolderKanban },
  { to: '/tareas', label: 'Bitácora', icon: Clock },
  { to: '/presupuestos', label: 'Presupuestos', icon: FileText },
  { to: '/configuracion', label: 'Más', icon: MoreHorizontal },
]

interface BottomNavProps {
  className?: string
}

export default function BottomNav({ className }: BottomNavProps) {
  const { location } = useRouterState()

  const isActive = (to: string, exact?: boolean) => {
    if (exact) return location.pathname === to
    return location.pathname.startsWith(to)
  }

  return (
    <nav
      className={cn(
        'fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border safe-bottom',
        className,
      )}
    >
      <div className="flex">
        {navItems.map(({ to, label, icon: Icon, exact }) => (
          <Link
            key={to}
            to={to}
            className={cn(
              'flex-1 flex flex-col items-center justify-center gap-1 py-2 min-h-[56px] transition-colors',
              isActive(to, exact)
                ? 'text-primary'
                : 'text-muted-foreground',
            )}
          >
            <Icon className="h-5 w-5" />
            <span className="text-[10px] leading-none">{label}</span>
          </Link>
        ))}
      </div>
    </nav>
  )
}
