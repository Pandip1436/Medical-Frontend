import { useContext } from 'react'
import { DateRangeContext, type DateRangeContextValue } from './DateRangeContext'

export function useDateRange(): DateRangeContextValue {
  const ctx = useContext(DateRangeContext)
  if (!ctx) throw new Error('useDateRange must be used within DateRangeProvider')
  return ctx
}
