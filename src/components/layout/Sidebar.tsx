import { useMemo, useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Pill,
  LayoutDashboard,
  Zap,
  Plus,
  FileText,
  FileCheck,
  FileCheck2,
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
  ChevronDown,
  MoreHorizontal,
  X,
  Building2,
  UserCheck,
  Tag,
  Bell,
  CalendarClock,
  ShieldCheck,
  Sparkles,
  MousePointer2,
  type LucideIcon,
} from 'lucide-react'
import { cn, getInitials } from '@/lib/utils'
import { href as hashHref, navigate } from '@/lib/router'
import { useAuthStore } from '@/stores/authStore'
import { useIsTouchCompact, useIsCompactChrome } from '@/hooks/useMediaQuery'
import { useNotificationStore } from '@/stores/notificationStore'
import { rolePermissions } from '@/App'
import { userRoles, primaryRole, isAdminish } from '@/types'
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
  // Roles for which this item is hidden from the sidebar even though the
  // page itself stays accessible (e.g. Notifications is reached via the
  // header bell for salespersons, so the sidebar entry is decluttered).
  hiddenForRoles?: string[]
  // Highlighted shortcut (e.g. Quick Sale): rendered as an accent action
  // button rather than a plain link, and skips active-state styling.
  action?: boolean
  // When set, renders a trailing "+" quick-add button that navigates here
  // (the entity's create flow / ?add=1 deep-link) without opening the page.
  quickAdd?: string
}

interface NavGroup {
  title: string
  items: NavItem[]
  // Pinned group: always visible, no clickable header (the items render as
  // plain top-level links). Used for MAIN so the primary pages are always
  // reachable without expanding an accordion.
  alwaysOpen?: boolean
}

const navigationGroups: NavGroup[] = [
  {
    title: 'MAIN',
    alwaysOpen: true,
    items: [
      { label: 'Dashboard', icon: LayoutDashboard, href: '/dashboard' },
      { label: 'Notifications', icon: Bell, href: '/notifications', hiddenForRoles: ['SALESPERSON'] },
      { label: 'Reminders', icon: CalendarClock, href: '/reminders' },
      { label: 'Approvals', icon: ShieldCheck, href: '/admin/approvals', adminOnly: true },
      { label: 'Quick Sale', icon: Zap, href: '/billing/new', action: true },
    ],
  },
  {
    title: 'BILLING',
    items: [
      { label: 'Invoices', icon: FileText, href: '/billing/sales', quickAdd: '/billing/new' },
      { label: 'Quotations', icon: FileCheck, href: '/billing/quotations', quickAdd: '/billing/new?type=quotation' },
      { label: 'Credit Notes', icon: FileCheck2, href: '/billing/credit-notes', quickAdd: '/billing/returns' },
      { label: 'Delivery Tracking', icon: Truck, href: '/delivery' },
      { label: 'Customers', icon: Users, href: '/customers', quickAdd: '/customers?add=1' },
      { label: 'Customer Outstanding', icon: IndianRupee, href: '/customers/outstanding' },
    ],
  },
  {
    title: 'PURCHASE',
    items: [
      { label: 'Purchase Orders', icon: ShoppingCart, href: '/purchase/orders', quickAdd: '/purchase/orders?add=1' },
      { label: 'Purchase Entry', icon: PackageCheck, href: '/purchase/grn-list', quickAdd: '/purchase/grn' },
      { label: 'Debit Notes', icon: FileText, href: '/purchase/debit-notes', quickAdd: '/purchase/returns' },
      { label: 'Suppliers', icon: Truck, href: '/purchase/suppliers', quickAdd: '/purchase/suppliers?add=1' },
      { label: 'Supplier Outstanding', icon: IndianRupee, href: '/purchase/suppliers/outstanding' },
    ],
  },
  {
    title: 'INVENTORY',
    items: [
      { label: 'Products', icon: Package, href: '/inventory/products', quickAdd: '/inventory/products?add=1' },
      { label: 'Categories', icon: Tag, href: '/inventory/categories', quickAdd: '/inventory/categories?add=1' },
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
  // Delivery staff: only the Delivery module.
  DELIVERY: [
    { label: 'Delivery', icon: Truck, href: '/delivery' },
  ],
}

// Role-based ring colors
const roleRingColors: Record<string, string> = {
  ADMIN: 'ring-blue-500',
  PHARMACIST: 'ring-emerald-500',
  INVENTORY_MANAGER: 'ring-amber-500',
  ACCOUNTANT: 'ring-purple-500',
  SALESPERSON: 'ring-orange-500',
  DELIVERY: 'ring-cyan-500',
}

interface SidebarProps {
  currentPath: string
}

import { useSettingsStore } from '@/stores/settingsStore'

export function Sidebar({ currentPath }: SidebarProps) {
  const { user, sidebarCollapsed, toggleSidebar, sidebarHoverExpand, toggleSidebarHoverExpand, expandedSection, toggleSection, mobileSidebarOpen, setMobileSidebarOpen } = useAuthStore()
  const unreadCount = useNotificationStore((s) => s.unreadCount())
  const businessProfile = useSettingsStore((s) => s.businessProfile)
  const [pendingApprovals, setPendingApprovals] = useState(0)
  // Hover-to-expand (desktop only): the slim rail widens on mouse-enter and
  // shrinks on mouse-leave when `sidebarHoverExpand` is on.
  const [hovered, setHovered] = useState(false)

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
    // Clicking any page collapses the hover-expanded rail (e.g. jumping to
    // Quick Sale). Harmless when hover-expand is off.
    setHovered(false)
    navigate(path)
  }, [])

  useEffect(() => {
    if (!user) return
    // Only admins can ever see the approvals badge — don't poll for the
    // other roles. Saves ~60 API calls/hour per non-admin user.
    if (!isAdminish(user)) {
      setPendingApprovals(0)
      return
    }
    const fetchCount = () => {
      // Skip the round-trip when the tab is hidden.
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      import('@/lib/api').then(({ default: api }) => {
        api.get('/approvals/pending-count').then(r => setPendingApprovals(r.data.count ?? 0)).catch(() => {})
      })
    }
    fetchCount()
    const interval = setInterval(fetchCount, 60000)
    return () => clearInterval(interval)
  }, [user])
  // Any touch device up to tablet width (phone OR tablet) — see the branch below.
  const isMobile = useIsTouchCompact()
  // Non-touch narrow windows only (display scaling, a small restored browser
  // window) — touch tablets are already caught by isMobile above and go to
  // the bottom-bar shell instead. Always docks the slim icon rail;
  // "expanding" opens a temporary overlay instead of pushing it wider (see
  // the branch further below) so main content never re-animates its margin.
  const isTabletTouch = useIsCompactChrome()
  const mobileOpen = mobileSidebarOpen
  const setMobileOpen = setMobileSidebarOpen
  const [moreSheetOpen, setMoreSheetOpen] = useState(false)
  // Hover-to-expand only applies to a real docked desktop rail — never the
  // touch/tablet bottom-bar shell or the narrow-window click overlay.
  const hoverMode = sidebarHoverExpand && !isMobile && !isTabletTouch

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
    // Admin / Super Admin see everything; other roles get the UNION of every
    // assigned role's allowed routes.
    const admin = isAdminish(user)
    const allowedPaths = admin
      ? null
      : new Set(userRoles(user).flatMap((r) => rolePermissions[r] ?? []))

    return navigationGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          // Per-role sidebar hide — page stays accessible (e.g. reached via
          // the header bell), only the nav entry is removed for these roles.
          if (item.hiddenForRoles && userRoles(user).some((r) => item.hiddenForRoles!.includes(r))) return false
          if (allowedPaths === null) return true // Admin: all items
          if (item.adminOnly) return false // non-admin never sees adminOnly items
          return allowedPaths.has(item.href)
        }),
      }))
      .filter((group) => group.items.length > 0)
  }, [user])

  // rem (not px) so the sidebar scales with the display-scale font-size.
  const sidebarWidth = sidebarCollapsed ? '4rem' : '16.25rem'

  // All nav hrefs, used to resolve the "most specific" match below.
  const allHrefs = useMemo(
    () => filteredGroups.flatMap((g) => g.items.map((it) => it.href)),
    [filteredGroups],
  )

  // An item is active when the current path is its href, OR a descendant of it
  // (segment-boundary prefix, so `/purchase/suppliers` doesn't match
  // `/purchase/suppliers-foo`). For nested routes where one item's href is a
  // prefix of another's (e.g. `/purchase/suppliers` vs
  // `/purchase/suppliers/outstanding`), only the MOST specific matching item
  // highlights — otherwise both the parent and the child tab appear active.
  const isActive = (item: NavItem) => {
    if (currentPath === item.href) return true
    if (item.href === '/dashboard' || item.href === '/billing/new') return false
    if (!currentPath.startsWith(item.href + '/')) return false
    // Suppress the parent when a longer sibling href also matches the path.
    const hasMoreSpecificMatch = allHrefs.some(
      (h) =>
        h.length > item.href.length &&
        (currentPath === h || currentPath.startsWith(h + '/')),
    )
    return !hasMoreSpecificMatch
  }

  // On first load with no remembered choice, auto-open the (multi-item)
  // section that contains the current page. Runs once per mount; afterwards
  // the persisted `expandedSection` wins. The ref guard keeps it from
  // re-firing when filteredGroups/currentPath change mid-session.
  const didInitSectionRef = useRef(false)
  useEffect(() => {
    if (didInitSectionRef.current) return
    didInitSectionRef.current = true
    if (expandedSection !== null) return
    const activeGroup = filteredGroups.find(
      (g) => !g.alwaysOpen && g.items.length >= 2 && g.items.some((it) => isActive(it))
    )
    if (activeGroup) toggleSection(activeGroup.title)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const userRoleRing = user ? (roleRingColors[user.role] || 'ring-blue-500') : 'ring-blue-500'

  // ─── Shared sidebar content ─────────────────────────────────────────────
  const renderLogo = (collapsed: boolean) => (
    <a
      href={hashHref('/dashboard')}
      onClick={handleNavLinkClick('/dashboard')}
      className="flex h-16 items-center gap-3 px-4 cursor-pointer hover:bg-sidebar-accent/30 transition-colors"
    >
      <img
        src="/logo.png"
        alt="Hospital Suppliers"
        className="h-9 w-9 shrink-0 rounded-full object-cover shadow-lg shadow-brand/20"
        // Fall back to the brand pill mark if the logo file isn't present.
        onError={(e) => {
          const el = e.currentTarget
          el.onerror = null
          el.src =
            "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='36' height='36'%3E%3Crect width='36' height='36' rx='18' fill='%23e11d48'/%3E%3C/svg%3E"
        }}
      />
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

  // A single nav link. Shared by flat (collapsed icon-rail), single-item
  // sections, and the items inside an expanded accordion section.
  const renderNavItem = (item: NavItem, collapsed: boolean) => {
    // Action shortcuts (Quick Sale) read as a primary accent button and never
    // show the active indicator — they're a shortcut, not a "current page".
    const isAction = !!item.action
    const active = !isAction && isActive(item)
    const Icon = item.icon

    const linkContent = (
      <a
        href={hashHref(item.href)}
        onClick={handleNavLinkClick(item.href)}
        className={cn(
          'group relative flex h-9 items-center rounded-lg px-3 text-[13px] font-medium transition-all duration-150',
          isAction
            ? 'bg-brand/10 text-brand hover:bg-brand/15'
            : active
              ? 'bg-sidebar-active text-sidebar-active-foreground font-semibold'
              : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent',
          collapsed && 'justify-center px-0'
        )}
        style={{ gap: collapsed ? 0 : 12 }}
      >
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
              <span className="ml-1.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
            {item.href === '/admin/approvals' && pendingApprovals > 0 && (
              <span className="ml-1.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-warning px-1 text-[10px] font-bold text-white">
                {pendingApprovals > 99 ? '99+' : pendingApprovals}
              </span>
            )}
            {item.quickAdd && (
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(item.quickAdd!) }}
                className={cn(
                  'ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded transition-colors',
                  // On the active (solid red) row the brand-red icon would vanish,
                  // so use the row's white foreground there; brand red elsewhere.
                  active
                    ? 'text-sidebar-active-foreground hover:bg-white/20'
                    : 'text-brand hover:bg-brand/15',
                )}
                aria-label={`Add new — ${item.label}`}
                title={`Add new — ${item.label}`}
              >
                <Plus className="h-4.5 w-4.5" strokeWidth={2.75} />
              </button>
            )}
          </motion.span>
        )}
        {collapsed && item.href === '/notifications' && unreadCount > 0 && (
          <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-destructive" />
        )}
        {collapsed && item.href === '/admin/approvals' && pendingApprovals > 0 && (
          <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-warning" />
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
  }

  const renderNavGroups = (collapsed: boolean) => (
    <div
      ref={navScrollRef}
      onScroll={handleNavScroll}
      className="flex-1 overflow-y-auto py-2 sidebar-scroll"
    >
      <nav className="flex flex-col gap-0.5 px-2">
        {filteredGroups.map((group) => {
          // Icon-only rail: keep the flat layout (divider + every item).
          if (collapsed) {
            return (
              <div key={group.title} className="mb-1">
                <div className="my-2.5 mx-auto h-px w-5 bg-sidebar-border/60" />
                {group.items.map((item) => renderNavItem(item, true))}
              </div>
            )
          }

          // Pinned group (MAIN): always visible, no header — items render as
          // plain top-level links.
          if (group.alwaysOpen) {
            return (
              <div key={group.title} className="mb-0.5 flex flex-col gap-0.5">
                {group.items.map((item) => renderNavItem(item, false))}
              </div>
            )
          }

          // Single-page section: render the page as a plain top-level link.
          if (group.items.length === 1) {
            return (
              <div key={group.title} className="mt-1 mb-0.5">
                {renderNavItem(group.items[0], false)}
              </div>
            )
          }

          // Multi-page section: collapsible accordion group.
          const open = expandedSection === group.title
          const hasActiveChild = group.items.some((it) => isActive(it))
          return (
            // A top divider + spacing visually separates each section
            // (Billing / Purchase / Inventory …) from the one above it.
            <div key={group.title} className="mb-0.5 mt-2 border-t border-sidebar-border/60 pt-2">
              <button
                onClick={() => toggleSection(group.title)}
                className={cn(
                  'flex w-full items-center justify-between gap-1 rounded-lg px-3 py-1.5 text-[11px] font-bold uppercase transition-colors hover:bg-sidebar-accent/50',
                  hasActiveChild && !open ? 'text-brand' : 'text-sidebar-foreground/70'
                )}
                style={{ letterSpacing: '0.12em' }}
              >
                <span className="flex items-center gap-1.5">
                  {group.title}
                  {hasActiveChild && !open && (
                    <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                  )}
                </span>
                <motion.div
                  animate={{ rotate: open ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </motion.div>
              </button>
              <AnimatePresence initial={false}>
                {open && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
                    className="overflow-hidden"
                  >
                    <div className="flex flex-col gap-0.5 pt-0.5">
                      {group.items.map((item) => renderNavItem(item, false))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        })}
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
                {(primaryRole(user) ?? '').toLowerCase().replace('_', ' ')}
                {userRoles(user).length > 1 ? ` +${userRoles(user).length - 1}` : ''}
              </Badge>
            </motion.div>
          )}
        </div>
      )}

      {/* Hover-to-expand toggle — desktop docked rail only. Compact icon + an
          ON/OFF pill; the tooltip explains the behavior. (The `[` keyboard
          shortcut still collapses/expands the rail.) */}
      {!isMobile && !isTabletTouch && (
        <button
          onClick={() => {
            if (!sidebarHoverExpand) {
              // Enabling hover-mode while the cursor is already on the rail: keep
              // it expanded until the mouse actually leaves (mouse-enter won't
              // re-fire while the pointer is already inside).
              setHovered(true)
            } else {
              // Turning hover-mode OFF: leave the rail fully open. There's no
              // manual collapse button, so without this the rail could get stuck
              // collapsed (e.g. after a compact page auto-collapsed it).
              useAuthStore.setState({ sidebarCollapsed: false })
            }
            toggleSidebarHoverExpand()
          }}
          className={cn(
            'flex w-full items-center gap-2 rounded-lg p-2 transition-colors',
            collapsed ? 'justify-center' : 'justify-between',
            sidebarHoverExpand
              ? 'text-brand hover:bg-brand/10'
              : 'text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-foreground',
          )}
          aria-label="Toggle hover to expand"
          aria-pressed={sidebarHoverExpand}
          title={sidebarHoverExpand
            ? 'Hover-to-expand is ON — the rail opens on mouse-over. Click to turn off.'
            : 'Hover-to-expand is OFF — click to turn on (rail opens on mouse-over).'}
        >
          <span className="flex items-center gap-2">
            <MousePointer2 className="h-4 w-4 shrink-0" />
            {!collapsed && <span className="text-xs">Hover to expand</span>}
          </span>
          {!collapsed && (
            <span className={cn(
              'rounded px-1.5 py-0.5 text-[10px] font-bold',
              sidebarHoverExpand ? 'bg-brand/15 text-brand' : 'bg-sidebar-accent text-sidebar-muted',
            )}>
              {sidebarHoverExpand ? 'ON' : 'OFF'}
            </span>
          )}
        </button>
      )}

      {/* Vendor attribution — only in the expanded rail */}
      {!collapsed && (
        <p className="mt-2.5 border-t border-sidebar-border/40 pt-2.5 text-center text-[10px] leading-none text-sidebar-muted/70">
          Powered by{' '}
          <a
            href="https://unitednexa.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-sidebar-muted transition-colors hover:text-primary hover:underline"
          >
            United Nexa Tech
          </a>
        </p>
      )}
    </div>
  )

  // ─── MOBILE / TABLET LAYOUT ─────────────────────────────────────────────
  // Any touch device up to tablet width (phone OR tablet, e.g. an iPad Pro)
  // hides the side rail entirely and uses the full-screen hamburger sheet +
  // fixed bottom tab bar. Gated on `hover: none` so a desktop/laptop browser
  // window — even one that's narrow because of display scaling or a small
  // restored (non-maximized) window — never falls into this branch; it
  // always gets a docked sidebar instead (see the branch further below).
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
                      {group.title}
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

        {/* Bottom tab bar — sized to include safe-area padding on notched devices */}
        <div className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t border-sidebar-border bg-sidebar px-1 pb-[max(0px,env(safe-area-inset-bottom))] min-h-16">
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
                    ? 'text-brand'
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
  // Touch tablets never reach here (isMobile catches them above). This
  // branch is real desktops, plus non-touch narrow windows (display scaling,
  // a small restored window) — for those, the docked rail is always
  // icon-only (4rem) and tapping "expand" opens a translucent overlay on top
  // of it instead of widening the rail, so `AppLayout`'s content margin
  // never re-animates.
  // In hover-expand mode the rail is collapsed unless the mouse is over it.
  // Its width animates between the slim rail and the full width; AppLayout
  // keeps the content margin pinned at the rail width, so the expanded rail
  // overlays the page instead of pushing it.
  const dockedCollapsed = isTabletTouch ? true : hoverMode ? !hovered : sidebarCollapsed
  const dockedWidth = isTabletTouch ? '4rem' : hoverMode ? (hovered ? '16.25rem' : '4rem') : sidebarWidth
  const tabletOverlayOpen = isTabletTouch && !sidebarCollapsed

  return (
    <TooltipProvider delayDuration={0}>
      <motion.aside
        initial={false}
        animate={{ width: dockedWidth }}
        transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
        onMouseEnter={hoverMode ? () => setHovered(true) : undefined}
        onMouseLeave={hoverMode ? () => setHovered(false) : undefined}
        className={cn(
          'fixed left-0 top-0 flex h-screen-z flex-col bg-sidebar text-sidebar-foreground',
          // When the hover rail is expanded it floats over the page — a shadow
          // lifts it off the content it's covering, and its z-index jumps above
          // the popover layer (z-50) so open dropdowns (e.g. the supplier
          // search) don't render on top of the expanded rail. Collapsed, it
          // stays at z-40 so those dropdowns layer normally over the page.
          hoverMode && hovered ? 'z-[60] shadow-2xl shadow-black/20' : 'z-40',
        )}
      >
        {/* Subtle gradient overlay - barely visible */}
        <div className="pointer-events-none absolute inset-0 bg-linear-to-b from-white/2 via-transparent to-black/2" />

        <div className="relative flex h-full flex-col">
          {/* Logo */}
          {renderLogo(dockedCollapsed)}

          {/* Separator */}
          <div className="mx-3 h-px bg-sidebar-border/60" />

          {/* Navigation */}
          {renderNavGroups(dockedCollapsed)}

          {/* Bottom section */}
          {renderBottom(dockedCollapsed)}
        </div>
      </motion.aside>

      {/* Non-touch-narrow-only expand overlay. A light blurred tint (not
          mobile's opaque backdrop) so dashboard data stays visible behind it. */}
      {isTabletTouch && (
        <AnimatePresence>
          {tabletOverlayOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-50 bg-background/40 backdrop-blur-sm"
                onClick={toggleSidebar}
              />
              <motion.aside
                initial={{ x: -280 }}
                animate={{ x: 0 }}
                exit={{ x: -280 }}
                transition={{ type: 'spring', stiffness: 350, damping: 35 }}
                className="fixed left-0 top-0 z-50 flex h-screen-z w-70 flex-col bg-sidebar text-sidebar-foreground shadow-2xl"
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
              >
                <div className="pointer-events-none absolute inset-0 bg-linear-to-b from-white/2 to-transparent" />
                <div className="relative flex h-full flex-col">
                  {renderLogo(false)}
                  <div className="mx-3 h-px bg-sidebar-border/60" />
                  {renderNavGroups(false)}
                  {renderBottom(false)}
                </div>
              </motion.aside>
            </>
          )}
        </AnimatePresence>
      )}
    </TooltipProvider>
  )
}
