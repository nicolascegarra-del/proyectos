import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, Square, Timer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface StopwatchProps {
  onStop?: (horas: number) => void
  className?: string
}

export function Stopwatch({ onStop, className }: StopwatchProps) {
  const [running, setRunning] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  const start = useCallback(() => {
    if (running) return
    startTimeRef.current = Date.now() - elapsed * 1000
    intervalRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current!) / 1000))
    }, 1000)
    setRunning(true)
  }, [running, elapsed])

  const pause = useCallback(() => {
    if (!running) return
    if (intervalRef.current) clearInterval(intervalRef.current)
    setRunning(false)
  }, [running])

  const stop = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    setRunning(false)
    const horas = elapsed / 3600
    const horasRedondeado = Math.round(horas * 100) / 100
    onStop?.(horasRedondeado)
    setElapsed(0)
  }, [elapsed, onStop])

  const hours = Math.floor(elapsed / 3600)
  const minutes = Math.floor((elapsed % 3600) / 60)
  const seconds = elapsed % 60

  const pad = (n: number) => n.toString().padStart(2, '0')

  return (
    <div
      className={cn(
        'flex items-center gap-3 bg-muted/50 rounded-lg px-4 py-3',
        className,
      )}
      data-testid="stopwatch"
    >
      <Timer className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      <span
        className="font-mono text-lg font-semibold tabular-nums min-w-[90px]"
        data-testid="stopwatch-display"
      >
        {pad(hours)}:{pad(minutes)}:{pad(seconds)}
      </span>
      <div className="flex items-center gap-1.5">
        {!running ? (
          <Button
            size="icon"
            variant="ghost"
            className="h-9 w-9"
            onClick={start}
            aria-label="Iniciar cronómetro"
            data-testid="stopwatch-start"
          >
            <Play className="h-4 w-4 text-green-500" />
          </Button>
        ) : (
          <Button
            size="icon"
            variant="ghost"
            className="h-9 w-9"
            onClick={pause}
            aria-label="Pausar cronómetro"
            data-testid="stopwatch-pause"
          >
            <Pause className="h-4 w-4 text-yellow-500" />
          </Button>
        )}
        <Button
          size="icon"
          variant="ghost"
          className="h-9 w-9"
          onClick={stop}
          disabled={elapsed === 0}
          aria-label="Detener y guardar"
          data-testid="stopwatch-stop"
        >
          <Square className="h-4 w-4 text-red-500" />
        </Button>
      </div>
    </div>
  )
}
