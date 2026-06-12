import Tesseract from 'tesseract.js'
import type { DeliveryStatus } from '@/types'

// ─── Courier receipt OCR ─────────────────────────────────────────────────────
// Reads an ST Courier / Professional Courier (or any) receipt image with
// Tesseract.js and best-effort extracts the courier name, tracking/AWB number
// and dispatch date. All heuristics are forgiving — the user always reviews and
// can correct the auto-filled fields before saving.

export const COURIERS = [
  'ST Courier',
  'The Professional Couriers',
  'DTDC',
  'Blue Dart',
  'Delhivery',
  'India Post',
  'Trackon',
  'Gati',
  'Other',
] as const

export interface OcrResult {
  rawText: string
  courierName?: string
  trackingId?: string
  dispatchDate?: string // ISO yyyy-mm-dd
}

// Map of detectable keywords → canonical courier name.
const COURIER_KEYWORDS: { match: RegExp; name: string }[] = [
  { match: /professional\s*couri?er/i, name: 'The Professional Couriers' },
  { match: /\bst\s*couri?er/i, name: 'ST Courier' },
  { match: /\bdtdc\b/i, name: 'DTDC' },
  { match: /blue\s*dart/i, name: 'Blue Dart' },
  { match: /delhivery/i, name: 'Delhivery' },
  { match: /india\s*post|speed\s*post/i, name: 'India Post' },
  { match: /trackon/i, name: 'Trackon' },
  { match: /\bgati\b/i, name: 'Gati' },
]

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** Detect a courier brand from free OCR text. */
export function detectCourier(text: string): string | undefined {
  for (const { match, name } of COURIER_KEYWORDS) {
    if (match.test(text)) return name
  }
  return undefined
}

/**
 * Detect a tracking / AWB / consignment number. Strategy, in priority order:
 *  1. A value sitting next to an explicit label (AWB / Tracking / Consignment /
 *     Docket / POD No).
 *  2. A "letters+digits" token like IXM510357808 (common ST format).
 *  3. The longest standalone digit run (9–14 digits — typical AWB length).
 */
export function detectTrackingId(text: string): string | undefined {
  const labelled = text.match(
    /(?:awb|a\.w\.b|tracking|consignment|docket|pod|waybill|track(?:ing)?\s*(?:id|no|number)?)\s*[:#-]?\s*([A-Z0-9-]{6,18})/i,
  )
  if (labelled?.[1]) return labelled[1].replace(/[^A-Z0-9]/gi, '').toUpperCase()

  const alnum = text.match(/\b([A-Z]{2,4}\d{6,12})\b/)
  if (alnum?.[1]) return alnum[1].toUpperCase()

  const digitRuns = text.match(/\b\d{9,14}\b/g)
  if (digitRuns?.length) {
    return digitRuns.sort((a, b) => b.length - a.length)[0]
  }
  return undefined
}

/**
 * Detect a dispatch date and normalise to ISO (yyyy-mm-dd). Handles:
 *  - 05/06/2026, 05-06-2026, 05.06.2026  (dd/mm/yyyy)
 *  - 05 June 2026, 5 Jun 26, June 05 2026
 */
export function detectDispatchDate(text: string): string | undefined {
  // dd Month yyyy  /  Month dd yyyy
  const named = text.match(
    /\b(\d{1,2})\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*,?\s*(\d{2,4})\b/i,
  )
  if (named) {
    const day = Number(named[1])
    const mon = MONTHS[named[2].toLowerCase().slice(0, 3)]
    let year = Number(named[3])
    if (year < 100) year += 2000
    if (mon && day >= 1 && day <= 31) return `${year}-${pad(mon)}-${pad(day)}`
  }

  // dd/mm/yyyy and friends
  const numeric = text.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/)
  if (numeric) {
    const day = Number(numeric[1])
    const mon = Number(numeric[2])
    let year = Number(numeric[3])
    if (year < 100) year += 2000
    if (mon >= 1 && mon <= 12 && day >= 1 && day <= 31) {
      return `${year}-${pad(mon)}-${pad(day)}`
    }
  }
  return undefined
}

/**
 * Run OCR over a receipt image and extract courier fields.
 * @param file  the receipt image (image/* — PDFs should be rasterised first)
 * @param onProgress  0..1 recognition progress for a progress bar
 */
export async function extractCourierReceipt(
  file: File | Blob,
  onProgress?: (pct: number) => void,
): Promise<OcrResult> {
  const { data } = await Tesseract.recognize(file, 'eng', {
    logger: (m) => {
      if (m.status === 'recognizing text' && onProgress) onProgress(m.progress)
    },
  })
  const rawText = data.text || ''
  return {
    rawText,
    courierName: detectCourier(rawText),
    trackingId: detectTrackingId(rawText),
    dispatchDate: detectDispatchDate(rawText),
  }
}

// ─── Status presentation helpers (shared by the tracking page) ───────────────
export const DELIVERY_STATUSES: DeliveryStatus[] = [
  'BOOKED',
  'DISPATCHED',
  'IN_TRANSIT',
  'ARRIVED_AT_HUB',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'RETURNED',
]

export const STATUS_LABEL: Record<DeliveryStatus, string> = {
  BOOKED: 'Booked',
  DISPATCHED: 'Dispatched',
  IN_TRANSIT: 'In Transit',
  ARRIVED_AT_HUB: 'Arrived at Hub',
  OUT_FOR_DELIVERY: 'Out for Delivery',
  DELIVERED: 'Delivered',
  RETURNED: 'Returned',
}

// Tailwind background classes for the per-status colour dot (shared by the
// status filter and any status pill).
export const STATUS_DOT: Record<DeliveryStatus, string> = {
  BOOKED: 'bg-blue-500',
  DISPATCHED: 'bg-indigo-500',
  IN_TRANSIT: 'bg-violet-500',
  ARRIVED_AT_HUB: 'bg-sky-500',
  OUT_FOR_DELIVERY: 'bg-amber-500',
  DELIVERED: 'bg-emerald-500',
  RETURNED: 'bg-rose-500',
}

// Ordered progress index used to render the stepper. RETURNED is terminal and
// sits outside the happy path (index -1 → rendered distinctly).
export function statusStep(status: DeliveryStatus): number {
  if (status === 'RETURNED') return -1
  return DELIVERY_STATUSES.indexOf(status)
}

// Display status for the UI: "Dispatched" is folded into "In Transit" (the
// workflow treats them as one). DISPATCHED remains the internal carrier value;
// this only affects what users see (badges, labels).
export function displayDeliveryStatus(status: DeliveryStatus): DeliveryStatus {
  return status === 'DISPATCHED' ? 'IN_TRANSIT' : status
}
