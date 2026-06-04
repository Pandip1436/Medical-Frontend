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

export function navigate(path: string, opts?: { replace?: boolean }) {
  // `replace` swaps the current history entry instead of adding one — used for
  // redirects (e.g. a legacy deep-link bouncing to its new home) so the
  // intermediate URL never lands in the back stack.
  if (opts?.replace) {
    const idx = (window.history.state?.idx as number | undefined) ?? 0
    window.history.replaceState({ idx }, '', path)
    emitChange()
    return
  }
  const nextIdx = ((window.history.state?.idx as number | undefined) ?? 0) + 1
  window.history.pushState({ idx: nextIdx }, '', path)
  emitChange()
}

/**
 * Go one step back in history. If there is in-app history to pop (the current
 * entry was reached via navigate(), so it carries an idx > 0), use the browser
 * back stack — the popstate listener re-renders, so we must NOT call emitChange
 * here. Otherwise (fresh load / deep-link / refresh, where state is null) fall
 * back to a sensible parent path.
 */
export function goBack(fallback = '/dashboard') {
  const idx = (window.history.state as { idx?: number } | null)?.idx
  if (typeof idx === 'number' && idx > 0) {
    window.history.back()
  } else {
    navigate(fallback)
  }
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
    label: 'Invoice List',
    breadcrumbs: [{ label: 'Billing' }, { label: 'Invoice List' }],
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
  '/billing/credit-notes/detail': {
    label: 'Credit Note Detail',
    breadcrumbs: [{ label: 'Billing' }, { label: 'Credit Notes', href: '/billing/credit-notes' }, { label: 'Detail' }],
  },
  '/purchase/orders': {
    label: 'Purchase Orders',
    breadcrumbs: [{ label: 'Purchase' }, { label: 'Purchase Orders' }],
  },
  '/purchase/grn': {
    label: 'New GRN',
    breadcrumbs: [{ label: 'Purchase' }, { label: 'Purchase Entry', href: '/purchase/grn-list' }, { label: 'New' }],
  },
  '/purchase/grn-list': {
    label: 'Purchase Entry',
    breadcrumbs: [{ label: 'Purchase' }, { label: 'Purchase Entry' }],
  },
  '/purchase/grn/detail': {
    label: 'Purchase Entry Detail',
    breadcrumbs: [{ label: 'Purchase' }, { label: 'Purchase Entry', href: '/purchase/grn-list' }, { label: 'Detail' }],
  },
  '/purchase/returns': {
    label: 'Purchase Returns',
    breadcrumbs: [{ label: 'Purchase' }, { label: 'Purchase Returns' }],
  },
  '/purchase/debit-notes': {
    label: 'Debit Notes',
    breadcrumbs: [{ label: 'Purchase' }, { label: 'Debit Notes' }],
  },
  '/purchase/debit-notes/detail': {
    label: 'Debit Note Detail',
    breadcrumbs: [{ label: 'Purchase' }, { label: 'Debit Notes', href: '/purchase/debit-notes' }, { label: 'Detail' }],
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
  '/purchase/suppliers/outstanding': {
    label: 'Supplier Outstanding',
    breadcrumbs: [
      { label: 'Purchase' },
      { label: 'Suppliers', href: '/purchase/suppliers' },
      { label: 'Outstanding' },
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
    // The shared, app-wide invoice detail view (reached from the Invoices list,
    // customer detail, dashboard, etc.). It belongs to Billing — the old
    // "Customers › Invoices" framing was misleading, and that list was removed.
    label: 'Invoice Detail',
    breadcrumbs: [{ label: 'Billing' }, { label: 'Invoices', href: '/billing/sales' }, { label: 'Detail' }],
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
  '/salespersons/detail': {
    label: 'Salesperson Detail',
    breadcrumbs: [{ label: 'Salespersons', href: '/salespersons' }, { label: 'Detail' }],
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
