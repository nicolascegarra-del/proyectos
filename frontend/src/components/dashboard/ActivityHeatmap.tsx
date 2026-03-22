import { useMemo } from 'react'
import { subDays, format, eachDayOfInterval, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { cn } from '@/lib/utils'

interface HeatmapEntry {
  date: string
  horas: number
}

interface ActivityHeatmapProps {
  data: HeatmapEntry[]
  weeks?: number
}

function getColor(horas: number): string {
  if (horas === 0) return 'bg-muted/40'
  if (horas < 2) return 'bg-primary/20'
  if (horas < 4) return 'bg-primary/40'
  if (horas < 6) return 'bg-primary/70'
  return 'bg-primary'
}

export function ActivityHeatmap({ data, weeks = 26 }: ActivityHeatmapProps) {
  const { grid, maxHoras } = useMemo(() => {
    const end = new Date()
    const start = subDays(end, weeks * 7 - 1)
    const days = eachDayOfInterval({ start, end })

    const dataMap = new Map<string, number>()
    for (const entry of data) {
      dataMap.set(entry.date, entry.horas)
    }

    const max = Math.max(...data.map((d) => d.horas), 0)
    const gridDays = days.map((day) => {
      const key = format(day, 'yyyy-MM-dd')
      return { date: key, horas: dataMap.get(key) ?? 0 }
    })

    const cols: typeof gridDays[] = []
    for (let i = 0; i < gridDays.length; i += 7) {
      cols.push(gridDays.slice(i, i + 7))
    }

    return { grid: cols, maxHoras: max }
  }, [data, weeks])

  const months = useMemo(() => {
    const end = new Date()
    const start = subDays(end, weeks * 7 - 1)
    const days = eachDayOfInterval({ start, end })
    const seen = new Set<string>()
    const labels: { label: string; col: number }[] = []
    days.forEach((day, i) => {
      const monthKey = format(day, 'MMM', { locale: es })
      const col = Math.floor(i / 7)
      if (!seen.has(monthKey)) {
        seen.add(monthKey)
        labels.push({ label: monthKey, col })
      }
    })
    return labels
  }, [weeks])

  return (
    <div className="space-y-1 overflow-x-auto">
      <div className="relative" style={{ paddingTop: '18px' }}>
        <div className="absolute top-0 left-0 right-0 flex" style={{ fontSize: '10px' }}>
          {months.map((m) => (
            <div
              key={m.label}
              className="absolute text-muted-foreground capitalize"
              style={{ left: `${(m.col / grid.length) * 100}%` }}
            >
              {m.label}
            </div>
          ))}
        </div>
        <div className="flex gap-0.5">
          {grid.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-0.5">
              {week.map((day) => (
                <div
                  key={day.date}
                  title={`${day.date}: ${day.horas}h`}
                  className={cn(
                    'w-3 h-3 rounded-sm transition-colors cursor-default',
                    getColor(day.horas),
                  )}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <span>Menos</span>
        {[0, 1, 3, 5, 7].map((h) => (
          <div
            key={h}
            className={cn('w-3 h-3 rounded-sm', getColor(h))}
          />
        ))}
        <span>Más</span>
        {maxHoras > 0 && (
          <span className="ml-2">Máx: {maxHoras.toFixed(1)}h</span>
        )}
      </div>
    </div>
  )
}
