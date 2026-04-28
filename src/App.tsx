import { useEffect, lazy, Suspense } from 'react'
import { useRoute, navigate, getRouteConfig } from '@/lib/router'
import { useAuthStore } from '@/stores/authStore'
import { useGlobalShortcuts } from '@/hooks/useKeyboardShortcuts'
import { Toaster } from 'sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { CommandPalette } from '@/components/shared/CommandPalette'
import AppLayout from '@/components/layout/AppLayout'
import '@/i18n'

// Lazy load pages
const LoginPage = lazy(() => import('@/pages/auth/LoginPage'))
const ForgotPasswordPage = lazy(() => import('@/pages/auth/ForgotPasswordPage'))
const DashboardPage = lazy(() => import('@/pages/dashboard/DashboardPage'))
const NewSalePage = lazy(() => import('@/pages/billing/NewSalePage'))
const SalesListPage = lazy(() => import('@/pages/billing/SalesListPage'))
const QuotationsPage = lazy(() => import('@/pages/billing/QuotationsPage'))
const SalesReturnsPage = lazy(() => import('@/pages/billing/SalesReturnsPage'))
const CreditNotesPage = lazy(() => import('@/pages/billing/CreditNotesPage'))
const PurchaseOrdersPage = lazy(() => import('@/pages/purchase/PurchaseOrdersPage'))
const GRNPage = lazy(() => import('@/pages/purchase/GRNPage'))
const PurchaseReturnsPage = lazy(() => import('@/pages/purchase/PurchaseReturnsPage'))
const DebitNotesPage = lazy(() => import('@/pages/purchase/DebitNotesPage'))
const SuppliersPage = lazy(() => import('@/pages/purchase/SuppliersPage'))
const ProductsPage = lazy(() => import('@/pages/inventory/ProductsPage'))
const ProductHistoryPage = lazy(() => import('@/pages/inventory/ProductHistoryPage'))
const CategoriesPage = lazy(() => import('@/pages/inventory/CategoriesPage'))
const StockOverviewPage = lazy(() => import('@/pages/inventory/StockOverviewPage'))
const ExpiryManagementPage = lazy(() => import('@/pages/inventory/ExpiryManagementPage'))
const StockAdjustmentPage = lazy(() => import('@/pages/inventory/StockAdjustmentPage'))
const CustomersPage = lazy(() => import('@/pages/customers/CustomersPage'))
const OutstandingPage = lazy(() => import('@/pages/customers/OutstandingPage'))
const CustomerInvoicesPage = lazy(() => import('@/pages/customers/CustomerInvoicesPage'))
const CustomerDetailPage = lazy(() => import('@/pages/customers/CustomerDetailPage'))
const CashBookPage = lazy(() => import('@/pages/accounting/CashBookPage'))
const ExpensesPage = lazy(() => import('@/pages/accounting/ExpensesPage'))
const LedgerPage = lazy(() => import('@/pages/accounting/LedgerPage'))
const ProfitLossPage = lazy(() => import('@/pages/accounting/ProfitLossPage'))
const ReportsHubPage = lazy(() => import('@/pages/reports/ReportsHubPage'))
const SettingsPage = lazy(() => import('@/pages/settings/SettingsPage'))
const BranchesPage = lazy(() => import('@/pages/branches/BranchesPage'))
const SalespersonsPage = lazy(() => import('@/pages/salespersons/SalespersonsPage'))
const SalespersonReportPage = lazy(() => import('@/pages/salespersons/SalespersonReportPage'))
const NotificationsPage = lazy(() => import('@/pages/notifications/NotificationsPage'))
const RemindersPage = lazy(() => import('@/pages/reminders/RemindersPage'))

// ─── Role-based page access control ───────────────────────────────────────────
// Maps each role to the set of routes it can access.
// 'ADMIN' gets everything implicitly (checked first in canAccess).
export const rolePermissions: Record<string, string[]> = {
  PHARMACIST: [
    '/dashboard',
    '/billing/new',
    '/billing/sales',
    '/billing/quotations',
    '/billing/returns',
    '/billing/credit-notes',
    '/inventory/products',
    '/inventory/categories',
    '/inventory/stock',
    '/inventory/expiry',
    '/customers',
    '/customers/invoices',
    '/customers/outstanding',
  ],
  INVENTORY_MANAGER: [
    '/dashboard',
    '/inventory/products',
    '/inventory/categories',
    '/inventory/stock',
    '/inventory/expiry',
    '/inventory/adjustment',
    '/purchase/orders',
    '/purchase/grn',
    '/purchase/returns',
    '/purchase/debit-notes',
    '/purchase/suppliers',
  ],
  ACCOUNTANT: [
    '/dashboard',
    '/billing/sales',
    '/billing/quotations',
    '/billing/returns',
    '/billing/credit-notes',
    '/customers',
    '/customers/invoices',
    '/customers/outstanding',
    '/purchase/orders',
    '/purchase/debit-notes',
    '/accounting/cashbook',
    '/accounting/expenses',
    '/accounting/ledger',
    '/accounting/pnl',
    '/reports',
    '/salespersons/report',
  ],
  SALESPERSON: [
    '/dashboard',
    '/customers',
    '/customers/invoices',
    '/inventory/products',
    '/inventory/stock',
    '/inventory/expiry',
    '/billing/sales',
    '/salespersons',
  ],
}

function canAccess(role: string | undefined, path: string): boolean {
  const normRole = (role ?? '').toUpperCase().replace(/[\s-]/g, '_')
  if (!normRole || normRole === 'ADMIN') return true
  const allowed = rolePermissions[normRole] ?? []
  return allowed.includes(path)
}

// ─── Access Denied screen ─────────────────────────────────────────────────────
function AccessDenied({ role }: { role?: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center px-4">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-rose-500/10">
        <svg className="h-10 w-10 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M12 9v3m0 3h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
      </div>
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Access Restricted</h2>
        <p className="mt-2 text-muted-foreground max-w-sm">
          Your <span className="font-semibold text-foreground capitalize">{(role ?? 'current').toLowerCase().replace('_', ' ')}</span> account
          does not have permission to view this page.
        </p>
      </div>
      <button
        onClick={() => navigate('/dashboard')}
        className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow transition-all hover:bg-primary/90"
      >
        ← Back to Dashboard
      </button>
    </div>
  )
}

// ─── Loading fallback ─────────────────────────────────────────────────────────
function LoadingFallback() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    </div>
  )
}

function App() {
  const { path, search } = useRoute()
  const { isAuthenticated, logout, user } = useAuthStore()
  const userRole = user?.role

  // Register global keyboard shortcuts
  useGlobalShortcuts()

  // Auth redirects
  useEffect(() => {
    if (!isAuthenticated && path !== '/login' && path !== '/forgot-password') {
      navigate('/login')
    }
    if (isAuthenticated && (path === '/login' || path === '/forgot-password')) {
      navigate('/dashboard')
    }
  }, [isAuthenticated, path])

  // Handle global 401 from API interceptor — avoids page reload loop
  useEffect(() => {
    const handler = () => {
      logout()
      navigate('/login')
    }
    window.addEventListener('pbims:unauthorized', handler)
    return () => window.removeEventListener('pbims:unauthorized', handler)
  }, [logout])

  // Auth pages (not authenticated)
  if (!isAuthenticated) {
    if (path === '/forgot-password') {
      return (
        <TooltipProvider>
          <Suspense fallback={<LoadingFallback />}>
            <ForgotPasswordPage onBackToLogin={() => navigate('/login')} />
          </Suspense>
          <Toaster position="top-right" richColors closeButton />
        </TooltipProvider>
      )
    }
    return (
      <TooltipProvider>
        <Suspense fallback={<LoadingFallback />}>
          <LoginPage
            onLoginSuccess={() => navigate('/dashboard')}
            onForgotPassword={() => navigate('/forgot-password')}
          />
        </Suspense>
        <Toaster position="top-right" richColors closeButton />
      </TooltipProvider>
    )
  }

  const routeConfig = getRouteConfig(path)

  // Render page content based on route
  const renderPage = () => {
    // Check role-based access before rendering any page
    if (!canAccess(userRole, path)) {
      return <AccessDenied role={userRole} />
    }

    switch (path) {
      case '/dashboard':
        return <DashboardPage />
      case '/billing/new':
        return <NewSalePage key={search} />
      case '/billing/sales':
        return <SalesListPage />
      case '/billing/quotations':
        return <QuotationsPage />
      case '/billing/returns':
        return <SalesReturnsPage />
      case '/billing/credit-notes':
        return <CreditNotesPage />
      case '/purchase/orders':
        return <PurchaseOrdersPage />
      case '/purchase/grn':
        return <GRNPage />
      case '/purchase/returns':
        return <PurchaseReturnsPage />
      case '/purchase/debit-notes':
        return <DebitNotesPage />
      case '/purchase/suppliers':
        return <SuppliersPage />
      case '/inventory/products':
        return <ProductsPage />
      case '/inventory/product-history':
        return <ProductHistoryPage />
      case '/inventory/categories':
        return <CategoriesPage />
      case '/inventory/stock':
        return <StockOverviewPage />
      case '/inventory/expiry':
        return <ExpiryManagementPage />
      case '/inventory/adjustment':
        return <StockAdjustmentPage />
      case '/customers':
        return <CustomersPage />
      case '/customers/outstanding':
        return <OutstandingPage />
      case '/customers/invoices':
        return <CustomerInvoicesPage />
      case '/customers/detail':
        return <CustomerDetailPage />
      case '/accounting/cashbook':
        return <CashBookPage />
      case '/accounting/expenses':
        return <ExpensesPage />
      case '/accounting/ledger':
        return <LedgerPage />
      case '/accounting/pnl':
        return <ProfitLossPage />
      case '/reports':
        return <ReportsHubPage />
      case '/settings':
        return <SettingsPage />
      case '/branches':
        return <BranchesPage />
      case '/salespersons':
        return <SalespersonsPage />
      case '/salespersons/report':
        return <SalespersonReportPage />
      case '/notifications':
        return <NotificationsPage />
      case '/reminders':
        return <RemindersPage />
      default:
        return <DashboardPage />
    }
  }

  return (
    <TooltipProvider>
      <AppLayout
        currentPath={path}
        breadcrumbs={routeConfig.breadcrumbs}
        title={routeConfig.label}
      >
        <Suspense key={path} fallback={<LoadingFallback />}>
          {renderPage()}
        </Suspense>
      </AppLayout>
      <CommandPalette />
      <Toaster position="top-right" richColors closeButton />
    </TooltipProvider>
  )
}

export default App
