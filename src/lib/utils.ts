import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { useSettingsStore } from '@/stores/settingsStore'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: any): string {
  const num = Number(amount) || 0
  // Whole rupees only — sales are billed at rounded grand totals, so paise
  // (₹…​.4 / ₹…​.6) are never shown anywhere (invoice, ledger, payment history…).
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num)
}

// Same as formatCurrency but ALWAYS shows paise (2 decimals). Used where the
// exact figure matters and rounding would hide it — e.g. the billing screen's
// GST breakdown (CGST ₹14.25) and line amounts, so the totals visibly add up
// to the grand total + round-off.
export function formatCurrencyFull(amount: any): string {
  const num = Number(amount) || 0
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num)
}

// ─── Ledger display helpers ─────────────────────────────────────────────────
// Plain-English replacements for accounting Debit/Credit/Dr/Cr, shared across
// the Accounting Ledger page and the Customer/Supplier detail Ledger tabs so the
// wording can't drift between views.
export type LedgerPartyType = 'customer' | 'supplier'

// Column header labels. The biller differs by party (we bill customers; suppliers
// bill us) but "Billed" reads correctly either way; "Paid / Returned" owns the
// payments-and-returns mix that the old "Credit" column conflated.
export const LEDGER_COL_BILLED = 'Billed'
export const LEDGER_COL_PAID = 'Paid / Returned'

/** Plain-English running-balance suffix, replacing accounting Dr/Cr.
 *  >0: customer owes us ("Due") / we owe supplier ("Payable"). <0: party in credit ("Advance"). */
export function ledgerBalanceSuffix(balance: number, partyType: LedgerPartyType): string {
  if (balance > 0) return partyType === 'customer' ? 'Due' : 'Payable'
  if (balance < 0) return 'Advance'
  return ''
}

/** e.g. "₹1,099 Due", "₹200 Advance", "₹0". Shows the absolute value + suffix. */
export function formatLedgerBalance(balance: number, partyType: LedgerPartyType): string {
  const suffix = ledgerBalanceSuffix(balance, partyType)
  return `${formatCurrency(Math.abs(balance))}${suffix ? ` ${suffix}` : ''}`
}

// Compact Indian-style currency for stat cards / KPI tiles where the full
// "₹60,00,10,000" layout overflows the card width. Uses lakh/crore/thousand
// abbreviations (e.g. "₹60.0 Cr", "₹49.2 K"). Falls back to the full format
// for amounts under ₹1,000 since compact mode can drop precision there.
export function formatCurrencyCompact(amount: any): string {
  const num = Number(amount) || 0
  const abs = Math.abs(num)
  const sign = num < 0 ? '-' : ''
  if (abs < 1_000) return formatCurrency(num)
  if (abs < 1_00_000) {
    return `${sign}₹${(abs / 1_000).toFixed(abs >= 10_000 ? 1 : 2)} K`
  }
  if (abs < 1_00_00_000) {
    return `${sign}₹${(abs / 1_00_000).toFixed(abs >= 10_00_000 ? 1 : 2)} L`
  }
  return `${sign}₹${(abs / 1_00_00_000).toFixed(abs >= 10_00_00_000 ? 1 : 2)} Cr`
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-IN').format(num)
}

/** Human-friendly byte count: 1.2 MB / 23 KB / 512 B. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = bytes / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v >= 10 ? v.toFixed(0) : v.toFixed(1)} ${units[i]}`
}

// Renders just the date part in the user's chosen format (set in Settings →
// General). Falls back to DD/MM/YYYY for unknown formats. Read from the
// settings store synchronously; the store is hydrated from localStorage on
// page load, so the first render after refresh already has the right value.
function renderDate(d: Date, fmt: string): string {
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = String(d.getFullYear())
  const monthShort = d.toLocaleString('en-IN', { month: 'short' }).toUpperCase()
  switch (fmt) {
    case 'mm/dd/yyyy':   return `${mm}/${dd}/${yyyy}`
    case 'yyyy-mm-dd':   return `${yyyy}-${mm}-${dd}`
    case 'dd-mmm-yyyy':  return `${dd}-${monthShort}-${yyyy}`
    case 'dd/mm/yyyy':
    default:             return `${dd}/${mm}/${yyyy}`
  }
}

export function formatDate(date: Date | string | undefined | null): string {
  if (!date) return '-'
  const d = typeof date === 'string' ? new Date(date) : date
  // Reading from the store this way (outside React) is fine — it's a synchronous
  // snapshot. The store is hydrated from localStorage at module load.
  const fmt = useSettingsStore.getState().generalSettings.dateFormat
  return renderDate(d, fmt)
}

export function formatDateTime(date: Date | string | undefined | null): string {
  if (!date) return '-'
  const d = typeof date === 'string' ? new Date(date) : date
  const fmt = useSettingsStore.getState().generalSettings.dateFormat
  const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
  return `${renderDate(d, fmt)}, ${time}`
}

export function generateId(prefix: string = ''): string {
  const id = Math.random().toString(36).substring(2, 10)
  return prefix ? `${prefix}_${id}` : id
}

// Indian financial year runs April → March. April 2026 → FY starting 2026.
function financialYearStart(date: Date): number {
  const month = date.getMonth()
  const year = date.getFullYear()
  return month >= 3 ? year : year - 1
}

// Short form (e.g. "26-27") — used as the FY segment in client-side preview
// invoice / quotation numbers so the prefix matches what the backend's
// DocumentNumberingService will stamp on save. Source of truth for the final
// number is the backend; this helper just keeps the UI preview honest.
export function currentFinancialYearShort(date: Date = new Date()): string {
  const start = financialYearStart(date)
  const yy = (n: number) => String(n % 100).padStart(2, '0')
  return `${yy(start)}-${yy(start + 1)}`
}

// Long form (e.g. "2026-27") — used in human-facing FY labels (P&L header,
// future report headers, etc). Both forms share the same FY-start math so
// they stay in lockstep.
export function currentFinancialYearLong(date: Date = new Date()): string {
  const start = financialYearStart(date)
  const yy = (n: number) => String(n % 100).padStart(2, '0')
  return `${start}-${yy(start + 1)}`
}

export function generateInvoiceNumber(type: 'INV' | 'QTN' | 'CN' | 'DN' | 'PO' | 'GRN' | 'RCT' | 'PV' | 'ADJ' | 'AUD' | 'TRF', seq: number): string {
  const profile = useSettingsStore.getState().businessProfile
  // The business-profile prefix (when an admin set one) wins. Otherwise
  // mirror the backend default: `${type}/${FY}/${NN}` so we never display
  // a hardcoded prior-FY label like "HS/25-26".
  if (profile?.invoicePrefix) {
    return `${profile.invoicePrefix}/${type}/${String(seq).padStart(5, '0')}`
  }
  return `${type}/${currentFinancialYearShort()}/${String(seq).padStart(5, '0')}`
}

export function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

export function timeAgo(date: Date | string | undefined | null): string {
  if (!date) return '-'
  const d = typeof date === 'string' ? new Date(date) : date
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} min ago`
  if (hours < 24) return `${hours} hr ago`
  if (days < 7) return `${days} day${days > 1 ? 's' : ''} ago`
  return formatDate(d)
}

export function debounce<T extends (...args: unknown[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout>
  return ((...args: unknown[]) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }) as T
}
