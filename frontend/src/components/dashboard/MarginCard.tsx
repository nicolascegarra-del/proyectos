import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { formatEUR, formatHoras } from '@/lib/utils'
import { cn } from '@/lib/utils'

interface MarginCardProps {
  totalHoras: number
  totalIngresos: number
  totalGastos: number
  margenNeto: number
}

interface StatProps {
  label: string
  value: string
  variant?: 'default' | 'positive' | 'negative'
  sub?: string
}

function Stat({ label, value, variant = 'default', sub }: StatProps) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          'text-xl font-semibold tabular-nums',
          variant === 'positive' && 'text-green-400',
          variant === 'negative' && 'text-red-400',
          variant === 'default' && 'text-foreground',
        )}
      >
        {value}
      </p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

export function MarginCard({
  totalHoras,
  totalIngresos,
  totalGastos,
  margenNeto,
}: MarginCardProps) {
  const isPositive = margenNeto >= 0
  const margenPct =
    totalIngresos > 0 ? ((margenNeto / totalIngresos) * 100).toFixed(1) : '0'

  const Icon = isPositive
    ? margenNeto === 0
      ? Minus
      : TrendingUp
    : TrendingDown

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      <Stat
        label="Horas registradas"
        value={formatHoras(totalHoras)}
      />
      <Stat
        label="Ingresos"
        value={formatEUR(totalIngresos)}
        variant="positive"
      />
      <Stat
        label="Gastos"
        value={formatEUR(totalGastos)}
        variant="negative"
      />
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">Margen neto</p>
        <div className="flex items-center gap-1.5">
          <Icon
            className={cn(
              'h-4 w-4',
              isPositive ? 'text-green-400' : 'text-red-400',
            )}
          />
          <p
            className={cn(
              'text-xl font-semibold tabular-nums',
              isPositive ? 'text-green-400' : 'text-red-400',
            )}
          >
            {formatEUR(margenNeto)}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">{margenPct}% de ingresos</p>
      </div>
    </div>
  )
}
