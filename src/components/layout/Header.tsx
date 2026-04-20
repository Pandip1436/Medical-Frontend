import { useState, useRef, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search,
  Bell,
  Sun,
  Moon,
  Globe,
  ChevronRight,
  User,
  Settings,
  HelpCircle,
  LogOut,
  Package,
  Clock,
  IndianRupee,
  AlertTriangle,
  ShieldCheck,
  Menu,
  CheckCircle2,
  ExternalLink,
  Building2,
  ChevronDown,
} from 'lucide-react'
import { cn, getInitials, timeAgo } from '@/lib/utils'
import { navigate as routerNavigate, href as hashHref } from '@/lib/router'
import { useAuthStore } from '@/stores/authStore'
import { useNotificationStore } from '@/stores/notificationStore'
import { useBranchStore } from '@/stores/branchStore'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Notification } from '@/types'

interface BreadcrumbItem {
  label: string
  href?: string
}

interface HeaderProps {
  breadcrumbs: BreadcrumbItem[]
}

const notificationIcons: Record<Notification['type'], typeof Package> = {
  LOW_STOCK: Package,
  EXPIRY: Clock,
  PAYMENT_DUE: IndianRupee,
  SYSTEM: AlertTriangle,
  APPROVAL: ShieldCheck,
}

const notificationStripColors: Record<Notification['type'], string> = {
  LOW_STOCK: 'bg-amber-500',
  EXPIRY: 'bg-red-500',
  PAYMENT_DUE: 'bg-blue-500',
  SYSTEM: 'bg-amber-500',
  APPROVAL: 'bg-emerald-500',
}

const notificationIconColors: Record<Notification['type'], string> = {
  LOW_STOCK: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  EXPIRY: 'bg-red-500/10 text-red-600 dark:text-red-400',
  PAYMENT_DUE: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  SYSTEM: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  APPROVAL: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
}

const notificationActionLabels: Record<Notification['type'], string> = {
  LOW_STOCK: 'Create PO',
  EXPIRY: 'View Item',
  PAYMENT_DUE: 'View Item',
  SYSTEM: 'View',
  APPROVAL: 'Review',
}

const roleRingColors: Record<string, string> = {
  admin: 'ring-blue-500',
  pharmacist: 'ring-emerald-500',
  inventory_manager: 'ring-amber-500',
  accountant: 'ring-purple-500',
}

function groupNotificationsByTime(notifications: Notification[]) {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterdayStart = new Date(todayStart.getTime() - 86400000)

  const groups: { label: string; items: Notification[] }[] = []
  const justNow: Notification[] = []
  const earlierToday: Notification[] = []
  const yesterday: Notification[] = []
  const older: Notification[] = []

  for (const n of notifications) {
    const ts = new Date(n.timestamp)
    const diffMinutes = (now.getTime() - ts.getTime()) / 60000
    if (diffMinutes < 5) {
      justNow.push(n)
    } else if (ts >= todayStart) {
      earlierToday.push(n)
    } else if (ts >= yesterdayStart) {
      yesterday.push(n)
    } else {
      older.push(n)
    }
  }

  if (justNow.length > 0) groups.push({ label: 'Just now', items: justNow })
  if (earlierToday.length > 0) groups.push({ label: 'Earlier today', items: earlierToday })
  if (yesterday.length > 0) groups.push({ label: 'Yesterday', items: yesterday })
  if (older.length > 0) groups.push({ label: 'Older', items: older })

  return groups
}

export function Header({ breadcrumbs }: HeaderProps) {
  const { user, theme, setTheme, resolvedTheme, language, setLanguage, logout, toggleSidebar } =
    useAuthStore()
  const { notifications, unreadCount, markAsRead, markAllAsRead } =
    useNotificationStore()
  const { branches, activeBranch, setActiveBranch, fetchBranches } = useBranchStore()

  const isAdmin = user?.role?.toUpperCase() === 'ADMIN'
  const userHasFixedBranch = !!(user as any)?.branchId

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchBranches() }, [])

  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const notificationsRef = useRef<HTMLDivElement>(null)

  const currentTheme = resolvedTheme()

  // Close notification dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        notificationsRef.current &&
        !notificationsRef.current.contains(event.target as Node)
      ) {
        setNotificationsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const toggleTheme = () => {
    if (theme === 'light') {
      setTheme('dark')
    } else if (theme === 'dark') {
      setTheme('light')
    } else {
      // system -> toggle based on resolved
      setTheme(currentTheme === 'dark' ? 'light' : 'dark')
    }
  }

  const unread = unreadCount()
  const displayedNotifications = notifications.slice(0, 8)
  const groupedNotifications = useMemo(
    () => groupNotificationsByTime(displayedNotifications),
    [displayedNotifications]
  )

  const languageLabels: Record<string, string> = {
    en: 'English',
    ta: '\u0BA4\u0BAE\u0BBF\u0BB4\u0BCD',
    hi: '\u0939\u093F\u0928\u094D\u0926\u0940',
  }

  const userRole = user?.role || 'admin'
  const ringColor = roleRingColors[userRole] || 'ring-blue-500'

  return (
    <header
      className={cn(
        'sticky top-0 z-30 flex h-14 items-center justify-between px-4 md:px-6',
        'border-b border-border/40 dark:border-border/60',
        'bg-background/80 backdrop-blur-xl backdrop-saturate-180',
        'supports-backdrop-filter:bg-background/60'
      )}
    >
      {/* Left: Hamburger (mobile) + Breadcrumbs */}
      <div className="flex items-center gap-3">
        {/* Hamburger menu - mobile only */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 md:hidden"
          onClick={toggleSidebar}
        >
          <Menu className="h-4 w-4" />
        </Button>

        {/* Breadcrumbs - hidden on mobile */}
        <nav className="hidden items-center gap-1 text-sm md:flex">
          {breadcrumbs.map((crumb, index) => (
            <div key={index} className="flex items-center gap-1">
              {index > 0 && (
                <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
              )}
              {crumb.href ? (
                <a
                  href={crumb.href}
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  {crumb.label}
                </a>
              ) : (
                <span className="font-semibold text-foreground">
                  {crumb.label}
                </span>
              )}
            </div>
          ))}
        </nav>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-1.5 md:gap-2">
        {/* Global Search - Pill-shaped trigger, hidden on mobile */}
        <Button
          variant="outline"
          className={cn(
            'hidden h-8 w-60 justify-start gap-2 rounded-full md:flex',
            'border-border/60 bg-muted/40 text-muted-foreground',
            'hover:bg-accent hover:text-accent-foreground',
            'transition-all duration-200'
          )}
          onClick={() => {
            document.dispatchEvent(
              new KeyboardEvent('keydown', { key: 'k', ctrlKey: true })
            )
          }}
        >
          <Search className="h-3.5 w-3.5" />
          <span className="flex-1 text-left text-xs">Search...</span>
          <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-0.5 rounded-md border border-border/60 bg-background/80 px-1.5 font-mono text-[10px] font-medium text-muted-foreground/70">
            Ctrl+K
          </kbd>
        </Button>

        {/* Branch indicator/selector — non-admins see a locked badge; admins get a switcher */}
        {activeBranch && (
          isAdmin && branches.length > 1 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="hidden h-8 items-center gap-1.5 rounded-full border-border/60 bg-muted/40 px-3 text-xs font-medium md:flex"
                >
                  <Building2 className="h-3.5 w-3.5 text-primary" />
                  <span className="max-w-30 truncate">{activeBranch.name}</span>
                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>Switch Branch</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {branches.filter(b => b.isActive).map((b) => (
                  <DropdownMenuItem
                    key={b.id}
                    onClick={() => setActiveBranch(b.id)}
                    className={cn(activeBranch.id === b.id && 'bg-accent font-medium')}
                  >
                    <div className="flex items-center gap-2 w-full">
                      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[9px] font-bold bg-muted">
                        {b.code}
                      </div>
                      <span className="truncate flex-1">{b.name}</span>
                      {b.isDefault && <span className="text-[10px] text-muted-foreground">default</span>}
                    </div>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : userHasFixedBranch ? (
            <div className="hidden h-8 items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-3 text-xs font-medium md:flex">
              <Building2 className="h-3.5 w-3.5 text-primary" />
              <span className="max-w-30 truncate">{activeBranch.name}</span>
            </div>
          ) : null
        )}

        {/* Notification Bell */}
        <div className="relative" ref={notificationsRef}>
          <Button
            variant="ghost"
            size="icon"
            className="relative h-8 w-8"
            onClick={() => setNotificationsOpen(!notificationsOpen)}
          >
            <Bell className="h-4 w-4" />
            <AnimatePresence>
              {unread > 0 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                  className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground"
                >
                  {unread > 9 ? '9+' : unread}
                </motion.span>
              )}
            </AnimatePresence>
          </Button>

          <AnimatePresence>
            {notificationsOpen && (
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.96 }}
                transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
                className={cn(
                  'absolute right-0 top-full mt-2 w-90 overflow-hidden rounded-xl',
                  'border border-border/60 bg-popover shadow-xl shadow-black/8 dark:shadow-black/25'
                )}
              >
                {/* Notification header */}
                <div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-semibold">Notifications</h4>
                    {unread > 0 && (
                      <Badge
                        variant="secondary"
                        className="h-5 rounded-full px-1.5 text-[10px] font-semibold"
                      >
                        {unread}
                      </Badge>
                    )}
                  </div>
                  {unread > 0 && (
                    <button
                      onClick={() => markAllAsRead()}
                      className="text-xs font-medium text-primary transition-colors hover:text-primary/80"
                    >
                      Mark all as read
                    </button>
                  )}
                </div>

                {/* Notification body */}
                {displayedNotifications.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10">
                      <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <p className="text-sm font-medium text-foreground">
                      All caught up
                    </p>
                    <p className="text-xs text-muted-foreground">
                      No new notifications
                    </p>
                  </div>
                ) : (
                  <div className="max-h-100 overflow-y-auto overscroll-contain">
                    {groupedNotifications.map((group) => (
                      <div key={group.label}>
                        <div className="sticky top-0 z-10 bg-popover/95 px-4 py-1.5 backdrop-blur-sm">
                          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
                            {group.label}
                          </p>
                        </div>
                        {group.items.map((notification) => {
                          const Icon = notificationIcons[notification.type]
                          return (
                            <motion.button
                              key={notification.id}
                              initial={{ opacity: 0, x: 8 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ duration: 0.2 }}
                              className={cn(
                                'group relative flex w-full items-start gap-3 overflow-hidden px-4 py-3 text-left transition-colors',
                                'hover:bg-accent/50',
                                !notification.isRead && 'bg-accent/20'
                              )}
                              onClick={() => {
                                markAsRead(notification.id)
                                if (notification.actionUrl) {
                                  routerNavigate(notification.actionUrl)
                                }
                              }}
                            >
                              {/* Colored left strip */}
                              <div
                                className={cn(
                                  'absolute inset-y-0 left-0 w-1',
                                  notificationStripColors[notification.type]
                                )}
                              />

                              {/* Icon circle */}
                              <div
                                className={cn(
                                  'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                                  notificationIconColors[notification.type]
                                )}
                              >
                                <Icon className="h-3.5 w-3.5" />
                              </div>

                              {/* Content */}
                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-2">
                                  <p className="truncate text-sm font-semibold leading-tight">
                                    {notification.title}
                                  </p>
                                  {!notification.isRead && (
                                    <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                                  )}
                                </div>
                                <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                                  {notification.message}
                                </p>
                                <div className="mt-1.5 flex items-center gap-2">
                                  <span className="text-[10px] text-muted-foreground/60">
                                    {timeAgo(notification.timestamp)}
                                  </span>
                                  {notification.actionUrl && (
                                    <span className="inline-flex items-center gap-0.5 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                                      {notificationActionLabels[notification.type]}
                                      <ExternalLink className="h-2.5 w-2.5" />
                                    </span>
                                  )}
                                </div>
                              </div>
                            </motion.button>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                )}

                {/* Footer */}
                {notifications.length > 5 && (
                  <div className="border-t border-border/40 px-4 py-2.5 text-center">
                    <a
                      href="#/notifications"
                      className="text-xs font-medium text-primary transition-colors hover:text-primary/80"
                    >
                      View all notifications
                    </a>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Theme Toggle with rotation animation */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={toggleTheme}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={currentTheme}
              initial={{ rotate: -180, opacity: 0, scale: 0.5 }}
              animate={{ rotate: 0, opacity: 1, scale: 1 }}
              exit={{ rotate: 180, opacity: 0, scale: 0.5 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
            >
              {currentTheme === 'dark' ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </motion.div>
          </AnimatePresence>
        </Button>

        {/* Language Selector - hidden on mobile */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="hidden h-8 w-8 md:inline-flex">
              <Globe className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Language</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {(Object.entries(languageLabels) as [string, string][]).map(
              ([code, label]) => (
                <DropdownMenuItem
                  key={code}
                  onClick={() => setLanguage(code as 'en' | 'ta' | 'hi')}
                  className={cn(language === code && 'bg-accent')}
                >
                  {label}
                </DropdownMenuItem>
              )
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <Separator
          orientation="vertical"
          className="mx-1 hidden h-5 md:block"
        />

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="gap-2 rounded-full px-1.5 py-1 md:pr-3"
            >
              <Avatar
                className={cn(
                  'h-7 w-7 ring-2 ring-offset-1 ring-offset-background',
                  ringColor
                )}
              >
                {user?.avatar && (
                  <AvatarImage src={user.avatar} alt={user.name} />
                )}
                <AvatarFallback className="text-[10px] font-semibold">
                  {user ? getInitials(user.name) : '?'}
                </AvatarFallback>
              </Avatar>
              <span className="hidden text-sm font-medium md:inline-block">
                {user?.name}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex items-center gap-3 py-1">
                <Avatar
                  className={cn(
                    'h-9 w-9 ring-2 ring-offset-1 ring-offset-background',
                    ringColor
                  )}
                >
                  {user?.avatar && (
                    <AvatarImage src={user.avatar} alt={user.name} />
                  )}
                  <AvatarFallback className="text-xs font-semibold">
                    {user ? getInitials(user.name) : '?'}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col">
                  <p className="text-sm font-semibold">{user?.name}</p>
                  <p className="text-xs text-muted-foreground">{user?.email}</p>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <a href={hashHref('/settings')} className="flex items-center gap-2">
                <User className="h-4 w-4" />
                Profile
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href={hashHref('/settings')} className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Settings
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href={hashHref('/dashboard')} className="flex items-center gap-2">
                <HelpCircle className="h-4 w-4" />
                Help
              </a>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                logout()
                routerNavigate('/login')
              }}
              className="text-destructive focus:text-destructive"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
