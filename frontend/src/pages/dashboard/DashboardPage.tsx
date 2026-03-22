import { useEffect, useState } from 'react'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { api, getErrorMessage } from '@/lib/api'
import type { DashboardData } from '@/types'
import { ActivityHeatmap } from '@/components/dashboard/ActivityHeatmap'
import { MarginCard } from '@/components/dashboard/MarginCard'
import { LayoutDashboard } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

export default function DashboardPage() {
  const currentWorkspace = useWorkspaceStore((s) => s.currentWorkspace)
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!currentWorkspace) return
    setLoading(true)
    setError('')
    api
      .get<DashboardData>(`/workspaces/${currentWorkspace.id}/dashboard`)
      .then(({ data }) => setData(data))
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [currentWorkspace?.id])

  if (!currentWorkspace) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-muted-foreground">
        <LayoutDashboard className="h-10 w-10" />
        <p>Selecciona o crea un workspace para continuar</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="space-y-6 max-w-5xl">
        <div className="space-y-1">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="bg-card border border-border rounded-lg p-4 space-y-3">
          <Skeleton className="h-4 w-36" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}
        </div>
      </div>
    )
  }

  if (error) {
    return <p className="text-destructive">{error}</p>
  }

  if (!data) return null

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">{currentWorkspace.nombre}</p>
      </div>

      <div className="bg-card border border-border rounded-lg p-4 space-y-1">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Resumen financiero
        </h2>
        <MarginCard
          totalHoras={data.total_horas}
          totalIngresos={data.total_ingresos}
          totalGastos={data.total_gastos}
          margenNeto={data.margen_neto}
        />
      </div>

      <div className="bg-card border border-border rounded-lg p-4 space-y-3">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Actividad — últimos 6 meses
        </h2>
        <ActivityHeatmap data={data.actividad_heatmap} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-1">Proyectos activos</p>
          <p className="text-2xl font-bold">{data.proyectos_activos}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-1">Horas este año</p>
          <p className="text-2xl font-bold">{data.total_horas.toFixed(1)}h</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-1">Días con actividad</p>
          <p className="text-2xl font-bold">
            {data.actividad_heatmap.filter((d) => d.horas > 0).length}
          </p>
        </div>
      </div>
    </div>
  )
}
