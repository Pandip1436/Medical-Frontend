import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { useSettingsStore } from '@/stores/settingsStore'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: any): string {
  const num = Number(amount) || 0
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(num)
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

export function generateInvoiceNumber(type: 'INV' | 'QTN' | 'CN' | 'DN' | 'PO' | 'GRN' | 'RCT' | 'PV' | 'ADJ' | 'AUD' | 'TRF', seq: number): string {
  const profile = useSettingsStore.getState().businessProfile
  const prefix = profile?.invoicePrefix || 'HS/25-26'
  return `${prefix}/${type}/${String(seq).padStart(5, '0')}`
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
