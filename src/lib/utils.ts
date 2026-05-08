import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

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

export function formatDate(date: Date | string | undefined | null): string {
  if (!date) return '-'
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function formatDateTime(date: Date | string | undefined | null): string {
  if (!date) return '-'
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-IN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export function generateId(prefix: string = ''): string {
  const id = Math.random().toString(36).substring(2, 10)
  return prefix ? `${prefix}_${id}` : id
}

import { useSettingsStore } from '@/stores/settingsStore'

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
