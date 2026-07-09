import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Bell,
  Sun,
  Moon,
  ChevronRight,
  Settings,
  LogOut,
  Menu,
  Building2,
  ChevronDown,
} from 'lucide-react'
import { cn, getInitials } from '@/lib/utils'
import { navigate as routerNavigate, href as hashHref } from '@/lib/router'
import { useAuthStore } from '@/stores/authStore'
import { useNotificationStore } from '@/stores/notificationStore'
import { useBranchStore } from '@/stores/branchStore'
import { isSuperAdmin, isAdminish, userRoles } from '@/types'
import { rolePermissions } from '@/App'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { HeaderSearch } from '@/components/shared/HeaderSearch'
import { InstallAppButton } from '@/components/shared/InstallAppButton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface BreadcrumbItem {
  label: string
  href?: string
}

interface HeaderProps {
  breadcrumbs: BreadcrumbItem[]
}

const roleRingColors: Record<string, string> = {
  admin: 'ring-blue-500',
  pharmacist: 'ring-emerald-500',
  inventory_manager: 'ring-amber-500',
  accountant: 'ring-purple-500',
}

export function Header({ breadcrumbs }: HeaderProps) {
  const { user, theme, setTheme, resolvedTheme, logout, toggleMobileSidebar } =
    useAuthStore()
  const { unreadCount, fetchNotifications, startPolling } = useNotificationStore()
  const { branches, activeBranch, setActiveBranch, fetchBranches } = useBranchStore()

  // Branches this user may switch between. Super Admins reach every active
  // branch; everyone else is limited to their assigned set (branchIds).
  const superAdmin = isSuperAdmin(user)
  const allowedBranchIds = (user?.branchIds ?? []) as string[]
  const allowedBranches = branches.filter(
    (b) => b.isActive && (superAdmin || allowedBranchIds.includes(b.id)),
  )
  const canSwitchBranch = allowedBranches.length > 1

  // Roles with no notifications route (e.g. DELIVERY) don't see the bell and
  // never poll — avoids a pointless 403 loop and hides the feature entirely.
  const canSeeNotifications =
    isAdminish(user) ||
    userRoles(user).some((r) => (rolePermissions[r] ?? []).includes('/notifications'))

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchBranches() }, [])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (canSeeNotifications) fetchNotifications() }, [canSeeNotifications])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (canSeeNotifications) return startPolling() }, [canSeeNotifications])

  const currentTheme = resolvedTheme()

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

  const userRole = user?.role || 'admin'
  const ringColor = roleRingColors[userRole] || 'ring-blue-500'

  return (
    <header
      className={cn(
        'sticky top-0 z-30 flex h-14 items-center justify-between px-4 md:px-6',
        'relative border-b border-border/40 dark:border-border/60',
        'bg-linear-to-b from-background/90 to-background/65 backdrop-blur-xl backdrop-saturate-180',
        'supports-backdrop-filter:bg-background/55',
        'shadow-[0_1px_2px_-1px_rgb(0_0_0/0.06),0_4px_16px_-8px_rgb(0_0_0/0.08)]',
        // Brand-tinted hairline that fades in from the edges — adds depth
        // without a hard line under the bar.
        'after:pointer-events-none after:absolute after:inset-x-0 after:-bottom-px after:h-px',
        'after:bg-linear-to-r after:from-transparent after:via-brand/40 after:to-transparent'
      )}
    >
      {/* Left: Hamburger (mobile) + Breadcrumbs */}
      <div className="flex items-center gap-3">
        {/* Hamburger menu - mobile only */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 md:hidden"
          onClick={toggleMobileSidebar}
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
                  className="rounded-md px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
                >
                  {crumb.label}
                </a>
              ) : (
                <span className="flex items-center gap-1.5 font-semibold text-foreground">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand shadow-[0_0_8px_0] shadow-brand/50" />
                  {crumb.label}
                </span>
              )}
            </div>
          ))}
        </nav>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-1.5 md:gap-2">
        {/* Global Master Search — inline input with a results dropdown.
            Hidden on mobile (the pill won't fit the header bar). */}
        <HeaderSearch />

        {/* Branch selector — a switcher when the user may reach >1 branch
            (Super Admins and multi-branch staff), a locked badge otherwise. */}
        {activeBranch && (
          canSwitchBranch ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="hidden h-8 items-center gap-1.5 rounded-full border-border/60 bg-linear-to-b from-muted/30 to-muted/60 px-3 text-xs font-medium shadow-sm transition-all hover:shadow md:flex"
                >
                  <Building2 className="h-3.5 w-3.5 text-primary" />
                  <span className="max-w-30 truncate">{activeBranch.name}</span>
                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>Switch Branch</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {allowedBranches.map((b) => (
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
          ) : (
            <div className="hidden h-8 items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-3 text-xs font-medium md:flex">
              <Building2 className="h-3.5 w-3.5 text-primary" />
              <span className="max-w-30 truncate">{activeBranch.name}</span>
            </div>
          )
        )}

        {/* Control cluster — bell / theme / language grouped into a single
            glass pill for a more premium, cohesive toolbar. */}
        <div className="flex items-center gap-0.5 rounded-full border border-border/50 bg-muted/40 p-0.5 shadow-sm backdrop-blur-sm">
          {/* Install App — only renders when the browser can install (Chromium)
              or on iOS (manual Add to Home Screen instructions). */}
          <InstallAppButton />

          {/* Notification Bell — navigates straight to notifications page.
              Hidden for roles without notifications access (e.g. DELIVERY). */}
          {canSeeNotifications && (
          <Button
            variant="ghost"
            size="icon"
            className="relative h-8 w-8 rounded-full hover:bg-accent"
            onClick={() => routerNavigate('/notifications')}
            aria-label={unread > 0 ? `${unread} unread notifications` : 'Notifications'}
          >
            <Bell className="h-4 w-4" />
            <AnimatePresence>
              {unread > 0 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                  className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground ring-2 ring-background"
                >
                  {unread > 9 ? '9+' : unread}
                </motion.span>
              )}
            </AnimatePresence>
          </Button>
          )}

          {/* Theme Toggle with rotation animation */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full hover:bg-accent"
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
        </div>

        <Separator
          orientation="vertical"
          className="mx-1 hidden h-5 md:block"
        />

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="gap-2 rounded-full px-1.5 py-1 transition-colors hover:bg-accent/60 md:pr-3"
            >
              <Avatar
                className={cn(
                  'h-7 w-7 ring-2 ring-offset-2 ring-offset-background shadow-sm transition-transform hover:scale-105',
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
            {/* Settings is admin-only (see Sidebar) — hide it for roles that
                can't reach /settings, e.g. DELIVERY. */}
            {isAdminish(user) && (
              <>
                <DropdownMenuItem asChild>
                  <a href={hashHref('/settings')} className="flex items-center gap-2">
                    <Settings className="h-4 w-4" />
                    Settings
                  </a>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
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
