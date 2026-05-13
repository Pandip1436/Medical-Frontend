import { createContext, useMemo, useState, type ReactNode } from 'react'
import dayjs from 'dayjs'
import type { DateRange, DateRangePreset } from './types'

export interface DateRangeContextValue {
  range: DateRange
  setRange: (range: DateRange) => void
  setPreset: (preset: DateRangePreset) => void
  resolved: { from: string; to: string; label: string }
}

export const DateRangeContext = createContext<DateRangeContextValue | null>(null)

function resolveRange(range: DateRange): { from: string; to: string; label: string } {
  const today = dayjs()
  switch (range.preset) {
    case 'week':
      return {
        from: today.subtract(6, 'day').format('YYYY-MM-DD'),
        to: today.format('YYYY-MM-DD'),
        label: 'Last 7 days',
      }
    case 'month':
      return {
        from: today.startOf('month').format('YYYY-MM-DD'),
        to: today.format('YYYY-MM-DD'),
        label: 'This month',
      }
    case 'year':
      return {
        from: today.startOf('year').format('YYYY-MM-DD'),
        to: today.format('YYYY-MM-DD'),
        label: 'This year',
      }
  }
}

export function DateRangeProvider({ children }: { children: ReactNode }) {
  const [range, setRange] = useState<DateRange>({ preset: 'month' })

  const value = useMemo<DateRangeContextValue>(
    () => ({
      range,
      setRange,
      setPreset: (preset) => setRange({ preset }),
      resolved: resolveRange(range),
    }),
    [range],
  )

  return <DateRangeContext.Provider value={value}>{children}</DateRangeContext.Provider>
}
