import { useSyncExternalStore, useCallback } from 'react'

// ─── Hash-based router store ───────────────────────────────────────────────
function getPath(): string {
  return window.location.pathname === '/' ? '/login' : window.location.pathname
}

function getSearch(): string {
  return window.location.search
}

const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function emitChange() {
  for (const listener of listeners) listener()
}

// Listen to popstate for browser back/forward buttons
if (typeof window !== 'undefined') {
  window.addEventListener('popstate', emitChange)
}

// ─── Public API ────────────────────────────────────────────────────────────

export function navigate(path: string) {
  window.history.pushState(null, '', path)
  emitChange()
}

/** React hook – returns current path, search string, and navigate function */
export function useRoute() {
  const path = useSyncExternalStore(subscribe, getPath, () => '/login')
  const search = useSyncExternalStore(subscribe, getSearch, () => '')
  return { path, search, navigate }
}

/** Build an href string that works with browser routing */
export function href(path: string): string {
  return path
}

// ─── Route config ──────────────────────────────────────────────────────────
export interface BreadcrumbItem {
  label: string
  href?: string
}

export interface RouteConfig {
  label: string
  breadcrumbs: BreadcrumbItem[]
}

export const routes: Record<string, RouteConfig> = {
  '/dashboard': {
    label: 'Dashboard',
    breadcrumbs: [{ label: 'Dashboard' }],
  },
  '/billing/new': {
    label: 'New Sale',
    breadcrumbs: [{ label: 'Billing', href: '/billing/sales' }, { label: 'New Sale' }],
  },
  '/billing/sales': {
    label: 'Sales List',
    breadcrumbs: [{ label: 'Billing' }, { label: 'Sales List' }],
  },
  '/billing/quotations': {
    label: 'Quotations',
    breadcrumbs: [{ label: 'Billing' }, { label: 'Quotations' }],
  },
  '/billing/returns': {
    label: 'Sales Returns',
    breadcrumbs: [{ label: 'Billing' }, { label: 'Sales Returns' }],
  },
  '/billing/credit-notes': {
    label: 'Credit Notes',
    breadcrumbs: [{ label: 'Billing' }, { label: 'Credit Notes' }],
  },
  '/purchase/orders': {
    label: 'Purchase Orders',
    breadcrumbs: [{ label: 'Purchase' }, { label: 'Purchase Orders' }],
  },
  '/purchase/grn': {
    label: 'Goods Receipt',
    breadcrumbs: [{ label: 'Purchase' }, { label: 'Goods Receipt' }],
  },
  '/purchase/returns': {
    label: 'Purchase Returns',
    breadcrumbs: [{ label: 'Purchase' }, { label: 'Purchase Returns' }],
  },
  '/purchase/debit-notes': {
    label: 'Debit Notes',
    breadcrumbs: [{ label: 'Purchase' }, { label: 'Debit Notes' }],
  },
  '/purchase/suppliers': {
    label: 'Suppliers',
    breadcrumbs: [{ label: 'Purchase' }, { label: 'Suppliers' }],
  },
  '/inventory/products': {
    label: 'Products',
    breadcrumbs: [{ label: 'Inventory' }, { label: 'Products' }],
  },
  '/inventory/product-history': {
    label: 'Product History',
    breadcrumbs: [{ label: 'Inventory' }, { label: 'Products', href: '/inventory/products' }, { label: 'History' }],
  },
  '/inventory/stock': {
    label: 'Stock Overview',
    breadcrumbs: [{ label: 'Inventory' }, { label: 'Stock Overview' }],
  },
  '/inventory/expiry': {
    label: 'Expiry Management',
    breadcrumbs: [{ label: 'Inventory' }, { label: 'Expiry Management' }],
  },
  '/inventory/adjustment': {
    label: 'Stock Adjustment',
    breadcrumbs: [{ label: 'Inventory' }, { label: 'Stock Adjustment' }],
  },
  '/customers': {
    label: 'Customers',
    breadcrumbs: [{ label: 'Customers' }],
  },
  '/customers/outstanding': {
    label: 'Outstanding',
    breadcrumbs: [{ label: 'Customers' }, { label: 'Outstanding' }],
  },
  '/customers/invoices': {
    label: 'Invoices',
    breadcrumbs: [{ label: 'Customers' }, { label: 'Invoices' }],
  },
  '/customers/detail': {
    label: 'Customer Detail',
    breadcrumbs: [{ label: 'Customers', href: '/customers' }, { label: 'Detail' }],
  },
  '/accounting/cashbook': {
    label: 'Cash Book',
    breadcrumbs: [{ label: 'Accounting' }, { label: 'Cash Book' }],
  },
  '/accounting/expenses': {
    label: 'Expenses',
    breadcrumbs: [{ label: 'Accounting' }, { label: 'Expenses' }],
  },
  '/accounting/ledger': {
    label: 'Ledger',
    breadcrumbs: [{ label: 'Accounting' }, { label: 'Ledger' }],
  },
  '/accounting/pnl': {
    label: 'Profit & Loss',
    breadcrumbs: [{ label: 'Accounting' }, { label: 'Profit & Loss' }],
  },
  '/reports': {
    label: 'Reports',
    breadcrumbs: [{ label: 'Reports' }],
  },
  '/settings': {
    label: 'Settings',
    breadcrumbs: [{ label: 'Settings' }],
  },
  '/branches': {
    label: 'Branches',
    breadcrumbs: [{ label: 'Branches' }],
  },
  '/salespersons': {
    label: 'Salespersons',
    breadcrumbs: [{ label: 'Salespersons' }],
  },
  '/salespersons/report': {
    label: 'Sales Report',
    breadcrumbs: [{ label: 'Salespersons', href: '#/salespersons' }, { label: 'Sales Report' }],
  },
  '/notifications': {
    label: 'Notifications',
    breadcrumbs: [{ label: 'Notifications' }],
  },
  '/reminders': {
    label: 'Reminders',
    breadcrumbs: [{ label: 'Reminders' }],
  },
}

/** Get route config for a given path, with fallback to dashboard */
export function getRouteConfig(path: string): RouteConfig {
  const basePath = typeof path === 'string' ? path.split('?')[0] : '/dashboard'
  return routes[basePath] || routes['/dashboard']!
}

/** Hook that returns navigate as a stable callback */
export function useNavigate() {
  return useCallback((path: string) => navigate(path), [])
}
