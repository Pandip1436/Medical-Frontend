import { useMemo, useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Pill,
  LayoutDashboard,
  Zap,
  PlusCircle,
  FileText,
  FileCheck,
  FileCheck2,
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
  Building2,
  UserCheck,
  Tag,
  Bell,
  CalendarClock,
  ShieldCheck,
  ClipboardList,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import { cn, getInitials } from '@/lib/utils'
import { href as hashHref, navigate } from '@/lib/router'
import { useAuthStore } from '@/stores/authStore'
import { useNotificationStore } from '@/stores/notificationStore'
import { rolePermissions } from '@/App'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

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
      { label: 'Notifications', icon: Bell, href: '/notifications' },
      { label: 'Reminders', icon: CalendarClock, href: '/reminders' },
      { label: 'Approvals', icon: ShieldCheck, href: '/admin/approvals', adminOnly: true },
    ],
  },
  {
    title: 'BILLING',
    items: [
      { label: 'New Sale', icon: PlusCircle, href: '/billing/new' },
      { label: 'Sales List', icon: FileText, href: '/billing/sales' },
      { label: 'Quotations', icon: FileCheck, href: '/billing/quotations' },
      { label: 'Sales Returns', icon: RotateCcw, href: '/billing/returns' },
      { label: 'Credit Notes', icon: FileCheck2, href: '/billing/credit-notes' },
    ],
  },
  {
    title: 'PURCHASE',
    items: [
      { label: 'Purchase Orders', icon: ShoppingCart, href: '/purchase/orders' },
      { label: 'Purchase Entry', icon: PackageCheck, href: '/purchase/grn' },
      { label: 'Purchase Received', icon: ClipboardList, href: '/purchase/grn-list' },
      { label: 'Purchase Returns', icon: RotateCcw, href: '/purchase/returns' },
      { label: 'Debit Notes', icon: FileText, href: '/purchase/debit-notes' },
      { label: 'Suppliers', icon: Truck, href: '/purchase/suppliers' },
    ],
  },
  {
    title: 'INVENTORY',
    items: [
      { label: 'Products', icon: Package, href: '/inventory/products' },
      { label: 'Categories', icon: Tag, href: '/inventory/categories' },
      { label: 'Stock Overview', icon: BarChart3, href: '/inventory/stock' },
      { label: 'Expiry Management', icon: Clock, href: '/inventory/expiry' },
      { label: 'Stock Adjustment', icon: Settings2, href: '/inventory/adjustment' },
    ],
  },
  {
    title: 'CRM',
    items: [
      { label: 'Leads', icon: Sparkles, href: '/crm/leads' },
    ],
  },
  {
    title: 'CUSTOMERS',
    items: [
      { label: 'Customer List', icon: Users, href: '/customers' },
      { label: 'Invoices', icon: Receipt, href: '/customers/invoices' },
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
    title: 'SALESPERSONS',
    items: [
      { label: 'Salespersons', icon: UserCheck, href: '/salespersons' },
      { label: 'Sales Report', icon: TrendingUp, href: '/salespersons/report' },
    ],
  },
  {
    title: 'SETTINGS',
    items: [
      { label: 'Branches', icon: Building2, href: '/branches', adminOnly: true },
      { label: 'User Management', icon: Users, href: '/users', adminOnly: true },
      { label: 'Audit Trail', icon: ShieldCheck, href: '/audit-trail', adminOnly: true },
      { label: 'Settings', icon: Settings, href: '/settings', adminOnly: true },
    ],
  },
]

// Bottom mobile nav items by role
const mobileBottomItemsByRole: Record<string, NavItem[]> = {
  default: [
    { label: 'Dashboard', icon: LayoutDashboard, href: '/dashboard' },
    { label: 'Quick Sale', icon: Zap, href: '/billing/new' },
    { label: 'Products', icon: Package, href: '/inventory/products' },
    { label: 'Customers', icon: Users, href: '/customers' },
  ],
  SALESPERSON: [
    { label: 'Dashboard', icon: LayoutDashboard, href: '/dashboard' },
    { label: 'Customers', icon: Users, href: '/customers' },
    { label: 'Products', icon: Package, href: '/inventory/products' },
    { label: 'Sales', icon: FileText, href: '/billing/sales' },
  ],
}

// Role-based ring colors
const roleRingColors: Record<string, string> = {
  ADMIN: 'ring-blue-500',
  PHARMACIST: 'ring-emerald-500',
  INVENTORY_MANAGER: 'ring-amber-500',
  ACCOUNTANT: 'ring-purple-500',
  SALESPERSON: 'ring-orange-500',
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

import { useSettingsStore } from '@/stores/settingsStore'

export function Sidebar({ currentPath }: SidebarProps) {
  const { user, sidebarCollapsed, toggleSidebar, mobileSidebarOpen, setMobileSidebarOpen } = useAuthStore()
  const unreadCount = useNotificationStore((s) => s.unreadCount())
  const businessProfile = useSettingsStore((s) => s.businessProfile)
  const [pendingApprovals, setPendingApprovals] = useState(0)

  // Persist nav scroll position across renders. Without this, clicking any
  // sidebar link triggers a parent re-render (currentPath prop changes) and
  // some downstream layout-animations cause the scrollable container to jump
  // back to 0. We snapshot scrollTop on user scroll and restore it after every
  // render via useLayoutEffect (runs before paint, so the user never sees the
  // jump).
  const navScrollRef = useRef<HTMLDivElement | null>(null)
  const navScrollPosRef = useRef(0)
  const handleNavScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    navScrollPosRef.current = e.currentTarget.scrollTop
  }, [])
  useLayoutEffect(() => {
    if (navScrollRef.current && navScrollRef.current.scrollTop !== navScrollPosRef.current) {
      navScrollRef.current.scrollTop = navScrollPosRef.current
    }
  })

  // Intercept anchor clicks for SPA navigation. Without this, the bare
  // <a href="/path"> triggers a full browser navigation, which reloads the
  // app, resets scroll, and wipes in-page state (including the auto-draft
  // session). We preserve modifier clicks (Ctrl/Cmd/Shift/middle-button) so
  // power users can still open in a new tab.
  const handleNavLinkClick = useCallback((path: string) => (e: React.MouseEvent<HTMLAnchorElement>) => {
    // Let the browser handle modified clicks (open in new tab, etc.)
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
    e.preventDefault()
    navigate(path)
  }, [])

  useEffect(() => {
    if (!user) return
    const fetchCount = () => {
      import('@/lib/api').then(({ default: api }) => {
        api.get('/approvals/pending-count').then(r => setPendingApprovals(r.data.count ?? 0)).catch(() => {})
      })
    }
    fetchCount()
    const interval = setInterval(fetchCount, 60000)
    return () => clearInterval(interval)
  }, [user])
  const isMobile = useIsMobile()
  const mobileOpen = mobileSidebarOpen
  const setMobileOpen = setMobileSidebarOpen
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
    const t = setTimeout(() => {
      setMobileOpen(false)
      setMoreSheetOpen(false)
    }, 0)
    return () => clearTimeout(t)
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
    const role = (user?.role ?? '').toUpperCase().replace(/[\s-]/g, '_')
    // Admin sees everything; other roles are filtered by rolePermissions
    const allowedPaths = (role === 'ADMIN' || !role) ? null : (rolePermissions[role] ?? [])

    return navigationGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          if (allowedPaths === null) return true // Admin: all items
          if (item.adminOnly) return false // non-admin never sees adminOnly items
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
    <a
      href={hashHref('/dashboard')}
      onClick={handleNavLinkClick('/dashboard')}
      className="flex h-16 items-center gap-3 px-4 cursor-pointer hover:bg-sidebar-accent/30 transition-colors"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/20">
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
            {businessProfile?.name || 'Hospital Suppliers'}
          </span>
          <span className="text-[10px] font-medium uppercase tracking-widest text-sidebar-muted">
            PBIMS
          </span>
        </motion.div>
      )}
    </a>
  )

  const renderNavGroups = (collapsed: boolean) => (
    <div
      ref={navScrollRef}
      onScroll={handleNavScroll}
      className="flex-1 overflow-y-auto py-2 sidebar-scroll"
    >
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
                  onClick={handleNavLinkClick(item.href)}
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
                      className="absolute left-0 top-1.5 bottom-1.5 w-0.75 rounded-r-full bg-blue-500"
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
                  <Icon className="h-4.5 w-4.5 shrink-0" />
                  {!collapsed && (
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.12 }}
                      className="flex flex-1 items-center justify-between truncate"
                    >
                      {item.label}
                      {item.href === '/notifications' && unreadCount > 0 && (
                        <span className="ml-1.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                          {unreadCount > 99 ? '99+' : unreadCount}
                        </span>
                      )}
                      {item.href === '/admin/approvals' && pendingApprovals > 0 && (
                        <span className="ml-1.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white">
                          {pendingApprovals > 99 ? '99+' : pendingApprovals}
                        </span>
                      )}
                    </motion.span>
                  )}
                  {collapsed && item.href === '/notifications' && unreadCount > 0 && (
                    <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-rose-500" />
                  )}
                  {collapsed && item.href === '/admin/approvals' && pendingApprovals > 0 && (
                    <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-amber-500" />
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
    </div>
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
                className="fixed left-0 top-0 z-50 flex h-full w-70 flex-col bg-sidebar text-sidebar-foreground"
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
              >
                {/* Subtle gradient overlay */}
                <div className="pointer-events-none absolute inset-0 bg-linear-to-b from-white/2 to-transparent" />
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
                            onClick={(e) => {
                              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
                              e.preventDefault()
                              setMoreSheetOpen(false)
                              navigate(item.href)
                            }}
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
          {(mobileBottomItemsByRole[user?.role ?? ''] ?? mobileBottomItemsByRole.default).map((item) => {
            const active = isActive(item)
            const Icon = item.icon
            return (
              <a
                key={item.href}
                href={hashHref(item.href)}
                onClick={handleNavLinkClick(item.href)}
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
        <div className="pointer-events-none absolute inset-0 bg-linear-to-b from-white/2 via-transparent to-black/2" />

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
