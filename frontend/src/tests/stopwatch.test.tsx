import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { Stopwatch } from '@/components/stopwatch/Stopwatch'

describe('Stopwatch', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders start button initially', () => {
    render(<Stopwatch onStop={vi.fn()} />)
    expect(screen.getByTestId('stopwatch-start')).toBeInTheDocument()
    expect(screen.getByTestId('stopwatch-display')).toHaveTextContent('00:00:00')
  })

  it('starts timer on click and shows elapsed time', async () => {
    render(<Stopwatch onStop={vi.fn()} />)
    fireEvent.click(screen.getByTestId('stopwatch-start'))

    await act(async () => {
      vi.advanceTimersByTime(3000)
    })

    expect(screen.getByTestId('stopwatch-display')).toHaveTextContent('00:00:03')
  })

  it('pauses and resumes correctly', async () => {
    render(<Stopwatch onStop={vi.fn()} />)
    fireEvent.click(screen.getByTestId('stopwatch-start'))

    await act(async () => { vi.advanceTimersByTime(5000) })
    expect(screen.getByTestId('stopwatch-display')).toHaveTextContent('00:00:05')

    fireEvent.click(screen.getByTestId('stopwatch-pause'))
    await act(async () => { vi.advanceTimersByTime(3000) })
    expect(screen.getByTestId('stopwatch-display')).toHaveTextContent('00:00:05')

    fireEvent.click(screen.getByTestId('stopwatch-start'))
    await act(async () => { vi.advanceTimersByTime(2000) })
    expect(screen.getByTestId('stopwatch-display')).toHaveTextContent('00:00:07')
  })

  it('calls onStop with correct hours when stopped', async () => {
    const onStop = vi.fn()
    render(<Stopwatch onStop={onStop} />)
    fireEvent.click(screen.getByTestId('stopwatch-start'))

    await act(async () => { vi.advanceTimersByTime(3600000) })

    fireEvent.click(screen.getByTestId('stopwatch-stop'))

    expect(onStop).toHaveBeenCalledOnce()
    const hours = onStop.mock.calls[0][0] as number
    expect(hours).toBeCloseTo(1, 1)
  })

  it('resets display to 00:00:00 after stop', async () => {
    render(<Stopwatch onStop={vi.fn()} />)
    fireEvent.click(screen.getByTestId('stopwatch-start'))
    await act(async () => { vi.advanceTimersByTime(10000) })
    fireEvent.click(screen.getByTestId('stopwatch-stop'))
    expect(screen.getByTestId('stopwatch-display')).toHaveTextContent('00:00:00')
  })
})
