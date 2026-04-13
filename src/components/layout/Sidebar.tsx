import { useMemo, useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Pill,
  LayoutDashboard,
  Zap,
  PlusCircle,
  FileText,
  FileCheck,
  RotateCcw,
  ShoppingCart,
  PackageCheck,
  Truck,
  Package,
  BarChart3,
  Clock,
  Settings2,
  Users,
  IndianRupee,
  BookOpen,
  Receipt,
  FileSpreadsheet,
  TrendingUp,
  PieChart,
  Settings,
  ChevronLeft,
  MoreHorizontal,
  X,
  type LucideIcon,
} from 'lucide-react'
import { cn, getInitials } from '@/lib/utils'
import { href as hashHref } from '@/lib/router'
import { useAuthStore } from '@/stores/authStore'
import { rolePermissions } from '@/App'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'

interface NavItem {
  label: string
  icon: LucideIcon
  href: string
  adminOnly?: boolean
}

interface NavGroup {
  title: string
  items: NavItem[]
}

const navigationGroups: NavGroup[] = [
  {
    title: 'MAIN',
    items: [
      { label: 'Dashboard', icon: LayoutDashboard, href: '/dashboard' },
      { label: 'Quick Sale', icon: Zap, href: '/billing/new' },
    ],
  },
  {
    title: 'BILLING',
    items: [
      { label: 'New Sale', icon: PlusCircle, href: '/billing/new' },
      { label: 'Sales List', icon: FileText, href: '/billing/sales' },
      { label: 'Quotations', icon: FileCheck, href: '/billing/quotations' },
      { label: 'Sales Returns', icon: RotateCcw, href: '/billing/returns' },
    ],
  },
  {
    title: 'PURCHASE',
    items: [
      { label: 'Purchase Orders', icon: ShoppingCart, href: '/purchase/orders' },
      { label: 'Goods Receipt', icon: PackageCheck, href: '/purchase/grn' },
      { label: 'Purchase Returns', icon: RotateCcw, href: '/purchase/returns' },
      { label: 'Suppliers', icon: Truck, href: '/purchase/suppliers' },
    ],
  },
  {
    title: 'INVENTORY',
    items: [
      { label: 'Products', icon: Package, href: '/inventory/products' },
      { label: 'Stock Overview', icon: BarChart3, href: '/inventory/stock' },
      { label: 'Expiry Management', icon: Clock, href: '/inventory/expiry' },
      { label: 'Stock Adjustment', icon: Settings2, href: '/inventory/adjustment' },
    ],
  },
  {
    title: 'CUSTOMERS',
    items: [
      { label: 'Customer List', icon: Users, href: '/customers' },
      { label: 'Outstanding', icon: IndianRupee, href: '/customers/outstanding' },
    ],
  },
  {
    title: 'ACCOUNTING',
    items: [
      { label: 'Cash Book', icon: BookOpen, href: '/accounting/cashbook' },
      { label: 'Expenses', icon: Receipt, href: '/accounting/expenses' },
      { label: 'Ledger', icon: FileSpreadsheet, href: '/accounting/ledger' },
      { label: 'Profit & Loss', icon: TrendingUp, href: '/accounting/pnl' },
    ],
  },
  {
    title: 'REPORTS',
    items: [
      { label: 'Report Hub', icon: PieChart, href: '/reports' },
    ],
  },
  {
    title: 'SETTINGS',
    items: [
      { label: 'Settings', icon: Settings, href: '/settings', adminOnly: true },
    ],
  },
]

// Bottom mobile nav items (first 4 + More)
const mobileBottomItems: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, href: '/dashboard' },
  { label: 'Quick Sale', icon: Zap, href: '/billing/new' },
  { label: 'Products', icon: Package, href: '/inventory/products' },
  { label: 'Customers', icon: Users, href: '/customers' },
]

// Role-based ring colors
const roleRingColors: Record<string, string> = {
  admin: 'ring-blue-500',
  pharmacist: 'ring-emerald-500',
  inventory_manager: 'ring-amber-500',
  accountant: 'ring-purple-500',
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mql = window.matchMedia('(max-width: 767px)')
    const onChange = (e: MediaQueryListEvent | MediaQueryList) => {
      setIsMobile(e.matches)
    }
    onChange(mql)
    mql.addEventListener('change', onChange as (e: MediaQueryListEvent) => void)
    return () => mql.removeEventListener('change', onChange as (e: MediaQueryListEvent) => void)
  }, [])

  return isMobile
}

interface SidebarProps {
  currentPath: string
}

export function Sidebar({ currentPath }: SidebarProps) {
  const { user, sidebarCollapsed, toggleSidebar } = useAuthStore()
  const isMobile = useIsMobile()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [moreSheetOpen, setMoreSheetOpen] = useState(false)

  // Keyboard shortcut: [ to toggle sidebar
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '[' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const tag = (e.target as HTMLElement)?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
        toggleSidebar()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [toggleSidebar])

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false)
    setMoreSheetOpen(false)
  }, [currentPath])

  // Swipe-to-dismiss for mobile
  const [touchStart, setTouchStart] = useState<number | null>(null)
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    setTouchStart(e.touches[0].clientX)
  }, [])
  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStart !== null) {
      const diff = e.changedTouches[0].clientX - touchStart
      if (diff < -80) {
        setMobileOpen(false)
      }
    }
    setTouchStart(null)
  }, [touchStart])

  const filteredGroups = useMemo(() => {
    const role = user?.role ?? ''
    // Admin sees everything; other roles are filtered by rolePermissions
    const allowedPaths = role === 'admin' ? null : (rolePermissions[role] ?? [])

    return navigationGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          if (allowedPaths === null) return true // Admin: all items
          return allowedPaths.includes(item.href)
        }),
      }))
      .filter((group) => group.items.length > 0)
  }, [user?.role])

  const sidebarWidth = sidebarCollapsed ? 64 : 260

  const isActive = (item: NavItem) =>
    currentPath === item.href ||
    (item.href !== '/dashboard' &&
      item.href !== '/billing/new' &&
      currentPath.startsWith(item.href))

  const userRoleRing = user ? (roleRingColors[user.role] || 'ring-blue-500') : 'ring-blue-500'

  // ─── Shared sidebar content ─────────────────────────────────────────────
  const renderLogo = (collapsed: boolean) => (
    <div className="flex h-16 items-center gap-3 px-4">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/20">
        <Pill className="h-4 w-4 text-white" />
      </div>
      {!collapsed && (
        <motion.div
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -8 }}
          transition={{ duration: 0.15 }}
          className="flex min-w-0 flex-col"
        >
          <span className="truncate text-sm font-semibold tracking-tight text-sidebar-foreground">
            Hospital Suppliers
          </span>
          <span className="text-[10px] font-medium uppercase tracking-widest text-sidebar-muted">
            PBIMS
          </span>
        </motion.div>
      )}
    </div>
  )

  const renderNavGroups = (collapsed: boolean) => (
    <ScrollArea className="flex-1 py-2">
      <nav className="flex flex-col gap-0.5 px-2">
        {filteredGroups.map((group) => (
          <div key={group.title} className="mb-1">
            {!collapsed && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mb-1 mt-4 flex items-center gap-1 px-3 text-[10px] font-semibold uppercase text-sidebar-muted"
                style={{ letterSpacing: '0.1em' }}
              >
                {group.title}
                <span className="text-sidebar-muted/60">({group.items.length})</span>
              </motion.p>
            )}
            {collapsed && (
              <div className="my-2.5 mx-auto h-px w-5 bg-sidebar-border/60" />
            )}
            {group.items.map((item) => {
              const active = isActive(item)
              const Icon = item.icon

              const linkContent = (
                <a
                  href={hashHref(item.href)}
                  className={cn(
                    'group relative flex h-9 items-center rounded-lg px-3 text-[13px] font-medium transition-all duration-150',
                    active
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                      : 'text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent',
                    collapsed && 'justify-center px-0'
                  )}
                  style={{ gap: collapsed ? 0 : 12 }}
                >
                  {active && (
                    <motion.div
                      layoutId="sidebar-indicator"
                      className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-blue-500"
                      style={{
                        boxShadow: '0 0 8px 1px rgba(59, 130, 246, 0.4)',
                      }}
                      transition={{
                        type: 'spring',
                        stiffness: 350,
                        damping: 30,
                      }}
                    />
                  )}
                  <Icon className="h-[18px] w-[18px] shrink-0" />
                  {!collapsed && (
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.12 }}
                      className="truncate"
                    >
                      {item.label}
                    </motion.span>
                  )}
                </a>
              )

              if (collapsed) {
                return (
                  <Tooltip key={item.href + item.label}>
                    <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                    <TooltipContent side="right" sideOffset={8}>
                      {item.label}
                    </TooltipContent>
                  </Tooltip>
                )
              }

              return <div key={item.href + item.label}>{linkContent}</div>
            })}
          </div>
        ))}
      </nav>
    </ScrollArea>
  )

  const renderBottom = (collapsed: boolean) => (
    <div className="border-t border-sidebar-border/60 p-3">
      {user && (
        <div
          className={cn(
            'mb-3 flex items-center gap-3',
            collapsed && 'flex-col'
          )}
        >
          <Avatar className={cn('h-8 w-8 shrink-0 ring-2 ring-offset-1 ring-offset-sidebar', userRoleRing)}>
            {user.avatar && <AvatarImage src={user.avatar} alt={user.name} />}
            <AvatarFallback className="bg-primary/20 text-xs font-medium text-primary">
              {getInitials(user.name)}
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex min-w-0 flex-col"
            >
              <span className="truncate text-sm font-medium text-sidebar-foreground">
                {user.name}
              </span>
              <Badge
                variant="secondary"
                className="mt-0.5 w-fit border-0 bg-sidebar-accent px-1.5 py-0 text-[10px] capitalize text-sidebar-muted"
              >
                {user.role.replace('_', ' ')}
              </Badge>
            </motion.div>
          )}
        </div>
      )}

      <button
        onClick={toggleSidebar}
        className={cn(
          'flex w-full items-center justify-center gap-2 rounded-lg p-2 text-sidebar-foreground/50 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground'
        )}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <motion.div
          animate={{ rotate: collapsed ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronLeft className="h-4 w-4" />
        </motion.div>
        {!collapsed && (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-1.5 text-xs text-sidebar-muted"
          >
            Collapse
            <kbd className="inline-flex h-5 items-center rounded border border-sidebar-border bg-sidebar-accent/50 px-1.5 font-mono text-[10px] text-sidebar-muted">
              [
            </kbd>
          </motion.span>
        )}
      </button>
    </div>
  )

  // ─── MOBILE LAYOUT ──────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <>
        {/* Full-screen overlay sidebar */}
        <AnimatePresence>
          {mobileOpen && (
            <>
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
                onClick={() => setMobileOpen(false)}
              />
              {/* Panel */}
              <motion.aside
                initial={{ x: -280 }}
                animate={{ x: 0 }}
                exit={{ x: -280 }}
                transition={{ type: 'spring', stiffness: 350, damping: 35 }}
                className="fixed left-0 top-0 z-50 flex h-full w-[280px] flex-col bg-sidebar text-sidebar-foreground"
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
              >
                {/* Subtle gradient overlay */}
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent" />
                <div className="relative flex flex-col h-full">
                  {/* Header with close */}
                  <div className="flex items-center justify-between pr-3">
                    {renderLogo(false)}
                    <button
                      onClick={() => setMobileOpen(false)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="h-px w-full bg-sidebar-border/60" />
                  {renderNavGroups(false)}
                  {renderBottom(false)}
                </div>
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        {/* "More" slide-up sheet */}
        <AnimatePresence>
          {moreSheetOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
                onClick={() => setMoreSheetOpen(false)}
              />
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', stiffness: 350, damping: 35 }}
                className="fixed bottom-0 left-0 right-0 z-50 max-h-[80vh] overflow-auto rounded-t-2xl bg-sidebar p-4 pb-24 text-sidebar-foreground"
              >
                {/* Handle indicator */}
                <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-sidebar-border" />
                <p className="mb-3 text-xs font-semibold uppercase text-sidebar-muted" style={{ letterSpacing: '0.1em' }}>
                  All Navigation
                </p>
                {filteredGroups.map((group) => (
                  <div key={group.title} className="mb-3">
                    <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase text-sidebar-muted/70" style={{ letterSpacing: '0.1em' }}>
                      {group.title} ({group.items.length})
                    </p>
                    <div className="grid grid-cols-3 gap-1.5">
                      {group.items.map((item) => {
                        const active = isActive(item)
                        const Icon = item.icon
                        return (
                          <a
                            key={item.href + item.label}
                            href={hashHref(item.href)}
                            className={cn(
                              'flex flex-col items-center gap-1.5 rounded-xl p-3 text-center transition-colors',
                              active
                                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                                : 'text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground'
                            )}
                          >
                            <Icon className="h-5 w-5" />
                            <span className="text-[11px] font-medium leading-tight">{item.label}</span>
                          </a>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Bottom tab bar */}
        <div className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t border-sidebar-border bg-sidebar px-1 pb-[env(safe-area-inset-bottom)] h-16">
          {mobileBottomItems.map((item) => {
            const active = isActive(item)
            const Icon = item.icon
            return (
              <a
                key={item.href}
                href={hashHref(item.href)}
                className={cn(
                  'flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors',
                  active
                    ? 'text-blue-500'
                    : 'text-sidebar-foreground/50'
                )}
              >
                <Icon className="h-5 w-5" />
                <span>{item.label}</span>
              </a>
            )
          })}
          <button
            onClick={() => setMoreSheetOpen(true)}
            className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium text-sidebar-foreground/50 transition-colors"
          >
            <MoreHorizontal className="h-5 w-5" />
            <span>More</span>
          </button>
        </div>
      </>
    )
  }

  // ─── DESKTOP LAYOUT ─────────────────────────────────────────────────────
  return (
    <TooltipProvider delayDuration={0}>
      <motion.aside
        initial={false}
        animate={{ width: sidebarWidth }}
        transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
        className="fixed left-0 top-0 z-40 flex h-screen flex-col bg-sidebar text-sidebar-foreground"
      >
        {/* Subtle gradient overlay - barely visible */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/[0.02] via-transparent to-black/[0.02]" />

        <div className="relative flex h-full flex-col">
          {/* Logo */}
          {renderLogo(sidebarCollapsed)}

          {/* Separator */}
          <div className="mx-3 h-px bg-sidebar-border/60" />

          {/* Navigation */}
          {renderNavGroups(sidebarCollapsed)}

          {/* Bottom section */}
          {renderBottom(sidebarCollapsed)}
        </div>
      </motion.aside>
    </TooltipProvider>
  )
}
