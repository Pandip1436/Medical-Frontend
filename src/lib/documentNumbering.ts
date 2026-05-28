// Document numbering template renderer — pure client-side.
//
// Mirrors the backend `DocumentNumberingService.applyTemplate` + `formatFy`
// so the Numbering Settings page can show a live preview without an API call.
// If the backend ever adds a new token, both sides must be updated.

export type FyFormat = 'YY-YY' | 'YYYY-YY' | 'YY' | 'YYYY'

export const FY_FORMATS: readonly FyFormat[] = ['YY-YY', 'YYYY-YY', 'YY', 'YYYY']

export const DOC_TYPES = ['INV', 'QTN', 'CN', 'DN', 'PO', 'GRN'] as const
export type ConfigurableDocType = (typeof DOC_TYPES)[number]

export const DOC_TYPE_LABELS: Record<ConfigurableDocType, string> = {
  INV: 'Invoice',
  QTN: 'Quotation',
  CN: 'Credit Note',
  DN: 'Debit Note',
  PO: 'Purchase Order',
  GRN: 'Purchase Received',
}

// Short code shown on the numbering-settings badge. Mostly identity, but the
// GRN doc-type is displayed as "PR" (Purchase Received) even though its internal
// sequence key remains "GRN".
export const DOC_TYPE_BADGES: Record<ConfigurableDocType, string> = {
  INV: 'INV',
  QTN: 'QTN',
  CN: 'CN',
  DN: 'DN',
  PO: 'PO',
  GRN: 'PR',
}

/** Indian financial year (April → March). April 2026 → fyStart=2026, fyEnd=2027. */
export function getFyParts(date: Date = new Date()): { fyStart: number; fyEnd: number } {
  const m = date.getMonth()
  const y = date.getFullYear()
  const fyStart = m >= 3 ? y : y - 1
  return { fyStart, fyEnd: fyStart + 1 }
}

export function formatFy(fyStart: number, fyEnd: number, fmt: FyFormat): string {
  const yy = (n: number) => String(n % 100).padStart(2, '0')
  switch (fmt) {
    case 'YYYY-YY': return `${fyStart}-${yy(fyEnd)}`
    case 'YY':      return yy(fyStart)
    case 'YYYY':    return String(fyStart)
    case 'YY-YY':
    default:        return `${yy(fyStart)}-${yy(fyEnd)}`
  }
}

/** Replace `{FY}` and `{NN}` tokens in a template. Everything else is literal. */
export function applyTemplate(
  template: string,
  vars: { FY: string; NN: string },
): string {
  return template.replaceAll('{FY}', vars.FY).replaceAll('{NN}', vars.NN)
}

/**
 * One-call helper used by the live preview UI.
 *
 * @param sampleCounter the sequence number to substitute for `{NN}` (1-indexed)
 */
export function renderDocNumber(
  template: string,
  fyFormat: FyFormat,
  padding: number,
  sampleCounter: number,
  today: Date = new Date(),
): string {
  const { fyStart, fyEnd } = getFyParts(today)
  const FY = formatFy(fyStart, fyEnd, fyFormat)
  const NN = String(Math.max(1, sampleCounter)).padStart(Math.max(1, padding), '0')
  return applyTemplate(template, { FY, NN })
}
