import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Bell,
  Sun,
  Moon,
  Globe,
  ChevronRight,
  User,
  Settings,
  HelpCircle,
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
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { HeaderSearch } from '@/components/shared/HeaderSearch'
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
  const { user, theme, setTheme, resolvedTheme, language, setLanguage, logout, toggleMobileSidebar } =
    useAuthStore()
  const { unreadCount, fetchNotifications, startPolling } = useNotificationStore()
  const { branches, activeBranch, setActiveBranch, fetchBranches } = useBranchStore()

  const isAdmin = user?.role?.toUpperCase() === 'ADMIN'
  const userHasFixedBranch = !!(user as any)?.branchId

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchBranches() }, [])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchNotifications() }, [])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => startPolling(), [])

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
        {/* Global Master Search — inline input with a results dropdown.
            Hidden on mobile (the pill won't fit the header bar). */}
        <HeaderSearch />

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

        {/* Notification Bell — navigates straight to notifications page */}
        <Button
          variant="ghost"
          size="icon"
          className="relative h-8 w-8"
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
                className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground"
              >
                {unread > 9 ? '9+' : unread}
              </motion.span>
            )}
          </AnimatePresence>
        </Button>

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
