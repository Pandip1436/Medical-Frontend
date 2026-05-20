import { useSyncExternalStore, useCallback } from 'react'

// ─── History API router store ──────────────────────────────────────────────
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
    label: 'Purchase Entry',
    breadcrumbs: [{ label: 'Purchase' }, { label: 'Purchase Entry' }],
  },
  '/purchase/grn-list': {
    label: 'Purchase Received',
    breadcrumbs: [{ label: 'Purchase' }, { label: 'Purchase Received' }],
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
  '/purchase/suppliers/detail': {
    label: 'Supplier Detail',
    breadcrumbs: [
      { label: 'Purchase' },
      { label: 'Suppliers', href: '/purchase/suppliers' },
      { label: 'Detail' },
    ],
  },
  '/inventory/products': {
    label: 'Products',
    breadcrumbs: [{ label: 'Inventory' }, { label: 'Products' }],
  },
  '/inventory/categories': {
    label: 'Categories',
    breadcrumbs: [{ label: 'Inventory' }, { label: 'Categories' }],
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
  '/inventory/batches/detail': {
    label: 'Batch Detail',
    breadcrumbs: [{ label: 'Inventory' }, { label: 'Expiry Management', href: '/inventory/expiry' }, { label: 'Batch Detail' }],
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
  '/customers/invoices/detail': {
    label: 'Invoice Detail',
    breadcrumbs: [{ label: 'Customers' }, { label: 'Invoices', href: '/customers/invoices' }, { label: 'Detail' }],
  },
  '/customers/detail': {
    label: 'Customer Detail',
    breadcrumbs: [{ label: 'Customers', href: '/customers' }, { label: 'Detail' }],
  },
  '/crm/leads': {
    label: 'Leads',
    breadcrumbs: [{ label: 'CRM' }, { label: 'Leads' }],
  },
  '/crm/leads/analytics': {
    label: 'Lead Analytics',
    breadcrumbs: [
      { label: 'CRM' },
      { label: 'Leads', href: '/crm/leads' },
      { label: 'Analytics' },
    ],
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
  '/users': {
    label: 'User Management',
    breadcrumbs: [{ label: 'User Management' }],
  },
  '/audit-trail': {
    label: 'Audit Trail',
    breadcrumbs: [{ label: 'Audit Trail' }],
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
    breadcrumbs: [{ label: 'Salespersons', href: '/salespersons' }, { label: 'Sales Report' }],
  },
  '/notifications': {
    label: 'Notifications',
    breadcrumbs: [{ label: 'Notifications' }],
  },
  '/reminders': {
    label: 'Reminders',
    breadcrumbs: [{ label: 'Reminders' }],
  },
  '/reminders/detail': {
    label: 'Reminder Detail',
    breadcrumbs: [{ label: 'Reminders', href: '/reminders' }, { label: 'Detail' }],
  },
  '/admin/approvals': {
    label: 'Approvals',
    breadcrumbs: [{ label: 'Admin' }, { label: 'Approvals' }],
  },
  '/admin/approvals/detail': {
    label: 'Approval Detail',
    breadcrumbs: [{ label: 'Admin' }, { label: 'Approvals', href: '/admin/approvals' }, { label: 'Detail' }],
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
