import { useEffect, useRef, useState } from 'react'

interface ImportProgressBarProps {
  /** Rows actually committed so far (updates per chunk). */
  done: number
  /** Total rows to commit. */
  total: number
}

/**
 * Import transfer progress that visibly counts up one-by-one — "1 / N, 2 / N,
 * 3 / N …" — rather than jumping by the chunk size. The commit is sent in
 * chunks (for speed), so `done` arrives in steps of ~50; this tweens the
 * displayed number from the previous value up to each new checkpoint so the
 * user sees every count climb.
 */
export function ImportProgressBar({ done, total }: ImportProgressBarProps) {
  const [display, setDisplay] = useState(0)
  const fromRef = useRef(0)

  useEffect(() => {
    const from = fromRef.current
    const to = done
    if (from === to) return
    // ~12ms per row, clamped — a 50-row chunk counts up over ~600ms so each
    // number is briefly visible.
    const durationMs = Math.min(700, Math.max(180, Math.abs(to - from) * 12))
    let raf = 0
    let startTs = 0
    const tick = (ts: number) => {
      if (!startTs) startTs = ts
      const t = Math.min(1, (ts - startTs) / durationMs)
      const v = Math.round(from + (to - from) * t)
      setDisplay(v)
      fromRef.current = v
      if (t < 1) raf = requestAnimationFrame(tick)
      else fromRef.current = to
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [done])

  const shown = Math.min(display, total)
  const pct = total > 0 ? Math.round((shown / total) * 100) : 0

  return (
    <div className="w-full max-w-xs space-y-1.5">
      <div className="flex items-center justify-between text-xs font-mono">
        <span className="text-emerald-700 dark:text-emerald-300">
          Transferring {shown.toLocaleString('en-IN')} / {total.toLocaleString('en-IN')}
        </span>
        <span className="text-muted-foreground">{pct}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all duration-150 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
