import { differenceInDays } from 'date-fns'

// ─── Expiry helpers ───────────────────────────────────────────────────────
// Shared by ExpiryManagementPage and StockOverviewPage so the date-to-bucket
// logic stays in one place.

export type ExpiryBucket = 'expired' | '30d' | '60d' | '90d' | '180d'

function parseDate(input: string | Date): Date | null {
  const d = input instanceof Date ? input : new Date(input)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Days until the given expiry date. Negative = already expired.
 *  Returns null when the input isn't a parseable date. */
export function daysToExpiry(date: string | Date): number | null {
  const d = parseDate(date)
  return d ? differenceInDays(d, new Date()) : null
}

/** Categorise a batch by days-to-expiry.
 *  - expired   → already past
 *  - 30d/60d/90d/180d → expiring within that many days
 *  - null      → either >180d shelf life OR an unparseable date.
 *  Treating unparseable dates as null avoids them being silently labelled
 *  expired/near-expiry, which would happen with NaN comparisons. */
export function assignExpiryBucket(date: string | Date): ExpiryBucket | null {
  const days = daysToExpiry(date)
  if (days === null) return null
  if (days < 0) return 'expired'
  if (days <= 30) return '30d'
  if (days <= 60) return '60d'
  if (days <= 90) return '90d'
  if (days <= 180) return '180d'
  return null
}

export function isExpired(date: string | Date): boolean {
  const days = daysToExpiry(date)
  return days !== null && days < 0
}

export function isNearExpiry(date: string | Date, withinDays = 90): boolean {
  const days = daysToExpiry(date)
  return days !== null && days >= 0 && days <= withinDays
}

// ─── Adjustment threshold ─────────────────────────────────────────────────
// Stock adjustments above this INR value require admin approval. The backend
// is the source of truth — it returns its own `threshold` in the response
// and decides whether to queue an approval. This constant exists so the UI
// can preview the "Approval Required" state before the request fires.
export const APPROVAL_THRESHOLD_INR = 5000
