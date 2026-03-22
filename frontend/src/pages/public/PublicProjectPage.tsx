import { useEffect, useState } from 'react'
import { useParams } from '@tanstack/react-router'
import { api, getErrorMessage } from '@/lib/api'
import { formatEUR, formatHoras, formatDate } from '@/lib/utils'
import { Loader2, Clock } from 'lucide-react'

type PublicData = {
  proyecto: {
    nombre: string
    tarifa_hora: number
  }
  cliente: {
    nombre: string
  }
  tareas: Array<{
    id: string
    descripcion: string
    horas: number
    fecha: string
    estado_pago: string
  }>
  total_horas: number
  total_ingresos: number
}

export default function PublicProjectPage() {
  const { publicUuid } = useParams({ strict: false }) as { publicUuid: string }
  const [data, setData] = useState<PublicData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .get<PublicData>(`/public/proyecto/${publicUuid}`)
      .then(({ data }) => setData(data))
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [publicUuid])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <p className="text-destructive">{error || 'Proyecto no encontrado'}</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <div className="border-b border-border pb-4">
          <p className="text-xs text-muted-foreground mb-1">{data.cliente.nombre}</p>
          <h1 className="text-2xl font-bold">{data.proyecto.nombre}</h1>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="bg-card border border-border rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">Horas</p>
            <p className="font-semibold">{formatHoras(data.total_horas)}</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">Tarifa</p>
            <p className="font-semibold">{formatEUR(data.proyecto.tarifa_hora)}/h</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">Total</p>
            <p className="font-semibold">{formatEUR(data.total_ingresos)}</p>
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Registro de trabajo
          </h2>
          {data.tareas.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 gap-2 text-muted-foreground border border-dashed border-border rounded-lg">
              <Clock className="h-6 w-6" />
              <p className="text-sm">Sin tareas registradas</p>
            </div>
          ) : (
            <div className="space-y-2">
              {data.tareas.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center gap-3 bg-card border border-border rounded-md px-4 py-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{t.descripcion}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(t.fecha)}</p>
                  </div>
                  <span className="text-sm font-medium tabular-nums flex-shrink-0">
                    {formatHoras(t.horas)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="text-xs text-center text-muted-foreground pt-4">
          Generado con Klyp
        </p>
      </div>
    </div>
  )
}
