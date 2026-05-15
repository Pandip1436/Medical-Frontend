import { createContext, useMemo, useState, type ReactNode } from 'react'
import dayjs from 'dayjs'
import type { DateRange, DateRangePreset } from './types'

export interface DateRangeContextValue {
  range: DateRange
  setRange: (range: DateRange) => void
  setPreset: (preset: DateRangePreset) => void
  setAnchor: (anchor: string) => void
  resolved: { from: string; to: string; label: string }
}

export const DateRangeContext = createContext<DateRangeContextValue | null>(null)

function resolveRange(range: DateRange): { from: string; to: string; label: string } {
  const today = dayjs()
  const anchor = dayjs(range.anchor)
  // Cap `to` at today so future months/years return empty rather than padded zeros.
  const cap = (d: dayjs.Dayjs) => (d.isAfter(today, 'day') ? today : d).format('YYYY-MM-DD')

  switch (range.preset) {
    case 'month':
      return {
        from: anchor.startOf('month').format('YYYY-MM-DD'),
        to: cap(anchor.endOf('month')),
        label: anchor.format('MMM YYYY'),
      }
    case '6m': {
      const start = anchor.subtract(5, 'month').startOf('month')
      const end = anchor.endOf('month')
      return {
        from: start.format('YYYY-MM-DD'),
        to: cap(end),
        label: `${start.format('MMM YYYY')} – ${end.format('MMM YYYY')}`,
      }
    }
    case 'year':
      return {
        from: anchor.startOf('year').format('YYYY-MM-DD'),
        to: cap(anchor.endOf('year')),
        label: anchor.format('YYYY'),
      }
  }
}

export function DateRangeProvider({ children }: { children: ReactNode }) {
  const [range, setRange] = useState<DateRange>(() => ({
    preset: 'month',
    anchor: dayjs().format('YYYY-MM-DD'),
  }))

  const value = useMemo<DateRangeContextValue>(
    () => ({
      range,
      setRange,
      setPreset: (preset) => setRange((prev) => ({ ...prev, preset })),
      setAnchor: (anchor) => setRange((prev) => ({ ...prev, anchor })),
      resolved: resolveRange(range),
    }),
    [range],
  )

  return <DateRangeContext.Provider value={value}>{children}</DateRangeContext.Provider>
}
