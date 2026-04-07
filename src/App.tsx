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
const PurchaseOrdersPage = lazy(() => import('@/pages/purchase/PurchaseOrdersPage'))
const GRNPage = lazy(() => import('@/pages/purchase/GRNPage'))
const PurchaseReturnsPage = lazy(() => import('@/pages/purchase/PurchaseReturnsPage'))
const SuppliersPage = lazy(() => import('@/pages/purchase/SuppliersPage'))
const ProductsPage = lazy(() => import('@/pages/inventory/ProductsPage'))
const StockOverviewPage = lazy(() => import('@/pages/inventory/StockOverviewPage'))
const ExpiryManagementPage = lazy(() => import('@/pages/inventory/ExpiryManagementPage'))
const StockAdjustmentPage = lazy(() => import('@/pages/inventory/StockAdjustmentPage'))
const CustomersPage = lazy(() => import('@/pages/customers/CustomersPage'))
const OutstandingPage = lazy(() => import('@/pages/customers/OutstandingPage'))
const CashBookPage = lazy(() => import('@/pages/accounting/CashBookPage'))
const ExpensesPage = lazy(() => import('@/pages/accounting/ExpensesPage'))
const LedgerPage = lazy(() => import('@/pages/accounting/LedgerPage'))
const ProfitLossPage = lazy(() => import('@/pages/accounting/ProfitLossPage'))
const ReportsHubPage = lazy(() => import('@/pages/reports/ReportsHubPage'))
const SettingsPage = lazy(() => import('@/pages/settings/SettingsPage'))

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
  const { path } = useRoute()
  const { isAuthenticated } = useAuthStore()

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
    switch (path) {
      case '/dashboard':
        return <DashboardPage />
      case '/billing/new':
        return <NewSalePage />
      case '/billing/sales':
        return <SalesListPage />
      case '/billing/quotations':
        return <QuotationsPage />
      case '/billing/returns':
        return <SalesReturnsPage />
      case '/purchase/orders':
        return <PurchaseOrdersPage />
      case '/purchase/grn':
        return <GRNPage />
      case '/purchase/returns':
        return <PurchaseReturnsPage />
      case '/purchase/suppliers':
        return <SuppliersPage />
      case '/inventory/products':
        return <ProductsPage />
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
        <Suspense fallback={<LoadingFallback />}>
          {renderPage()}
        </Suspense>
      </AppLayout>
      <CommandPalette />
      <Toaster position="top-right" richColors closeButton />
    </TooltipProvider>
  )
}

export default App
