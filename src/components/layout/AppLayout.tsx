import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore } from '@/stores/authStore'
import { navigate } from '@/lib/router'
import { resolveListView } from '@/lib/listView'
import { Sidebar } from './Sidebar'
import { Header } from './Header'

interface BreadcrumbItem {
  label: string
  href?: string
}

interface AppLayoutProps {
  children: React.ReactNode
  breadcrumbs: BreadcrumbItem[]
  title: string
  currentPath: string
}

const pageVariants = {
  initial: { opacity: 0, y: 6 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] as const },
  },
  exit: {
    opacity: 0,
    y: -4,
    transition: { duration: 0.15 },
  },
}

import { useSettingsStore } from '@/stores/settingsStore'
import { useColumnPrefsStore } from '@/stores/useColumnPrefsStore'
import { useIdleTimeout } from '@/hooks/useIdleTimeout'
import { useIsTouchCompact, useIsCompactChrome } from '@/hooks/useMediaQuery'
import { useRoute } from '@/lib/router'
import { ImportProgressPill } from '@/components/shared/ImportProgressPill'

export default function AppLayout({
  children,
  breadcrumbs,
  title,
  currentPath,
}: AppLayoutProps) {
  const { isAuthenticated, sidebarCollapsed, theme, resolvedTheme } = useAuthStore()
  // Any touch device up to tablet width (phone OR tablet) — mirrors
  // Sidebar.tsx's own branch exactly. A narrow desktop/laptop window (whether
  // from display scaling or just a small restored window) never matches
  // this — see isTabletTouch below instead.
  const isMobile = useIsTouchCompact()
  // Non-touch narrow windows only (display scaling, a small restored
  // window) — touch tablets are already caught by isMobile above. Docks the
  // collapsed icon rail; Sidebar.tsx always docks it and "expanding" opens
  // an overlay on top (never widens the docked rail), so content's margin
  // must stay pinned at the rail width, not animate with sidebarCollapsed.
  const isTabletTouch = useIsCompactChrome()
  const showBottomNav = isMobile
  const fetchSettings = useSettingsStore((s) => s.fetchSettings)
  const fetchGeneralSettings = useSettingsStore((s) => s.fetchGeneralSettings)
  const loadColumnPrefs = useColumnPrefsStore((s) => s.loadFromServer)
  const { search: routeSearch } = useRoute()

  // Auto-logout on inactivity. Reads sessionTimeoutMinutes from generalSettings.
  useIdleTimeout()

  // Initialize settings
  useEffect(() => {
    if (isAuthenticated) {
      fetchSettings()
      fetchGeneralSettings()
      // Pull the user's saved table-column choices (server wins over the
      // localStorage cache that already gave us a correct first paint).
      loadColumnPrefs()
    }
  }, [isAuthenticated, fetchSettings, fetchGeneralSettings, loadColumnPrefs])

  // Apply theme class to document
  useEffect(() => {
    const apply = () => {
      const resolved = resolvedTheme()
      document.documentElement.classList.toggle('dark', resolved === 'dark')
    }
    apply()

    // Listen for OS-level theme changes when in "system" mode
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme, resolvedTheme])

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login')
    }
  }, [isAuthenticated])

  if (!isAuthenticated) {
    return (
      <div className="flex h-screen-z items-center justify-center bg-background">
        <p className="text-muted-foreground">Redirecting to login...</p>
      </div>
    )
  }

  // rem (not px) so the sidebar scales with the display-scale font-size.
  const sidebarWidth = sidebarCollapsed ? '4rem' : '16rem'

  // POS-style routes use full viewport with no global header/padding
  const isFullViewport = currentPath === '/billing/new'

  // Compact routes keep the header but use minimal padding so the page
  // owns its own spacing and the split panel can fill the viewport correctly.
  const urlSearchParams = new URLSearchParams(routeSearch)
  // Legacy pages signal split via ?view=split. New pages use split-as-default
  // (no param = split; ?view=table = table). Both need the compact layout.
  // Uses the same resolver as the pages so mobile (where split defaults to the
  // scrollable list) gets the normal scrollable main — not the split view's
  // overflow-hidden compact shell, which would clip the list with no scroll.
  const tableViewActive = resolveListView(urlSearchParams.get('view')) === 'table'
  // Pages where split view is the DEFAULT (compact unless ?view=table).
  const SPLIT_DEFAULT_PAGES = [
    '/billing/sales',
    '/billing/quotations',
    '/billing/credit-notes',
    '/purchase/grn-list',
    '/purchase/orders',
    '/purchase/debit-notes',
    '/purchase/suppliers',
    '/customers',
    '/inventory/products',
    '/crm/leads',
  ]
  const isCompactPage = !tableViewActive && SPLIT_DEFAULT_PAGES.includes(currentPath)

  // Tight-scroll routes use the normal scrollable main, but with the same
  // minimal horizontal padding as compact pages — for long dashboards that
  // need the extra width without owning their own scroll containers.
  const isTightScrollPage = currentPath === '/crm/leads/analytics'

  // Auto-collapse the sidebar when entering a compact page so the table
  // gets every pixel of horizontal space. We only force-collapse once on
  // entry — the user can still toggle it back open manually afterwards.
  useEffect(() => {
    if (isCompactPage && !sidebarCollapsed) {
      useAuthStore.setState({ sidebarCollapsed: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCompactPage])

  // Same auto-collapse-once behavior for non-touch windows narrower than xl
  // (1280px) — display scaling or a small restored browser window — the
  // desktop-style sidebar would otherwise open expanded (260px) and squeeze
  // page content into a narrow column. Touch tablets never reach this (they
  // get the bottom-bar shell via isMobile instead). Real desktops (non-touch,
  // >=1280px) keep today's expanded-by-default behavior.
  useEffect(() => {
    if (isTabletTouch && !sidebarCollapsed) {
      useAuthStore.setState({ sidebarCollapsed: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTabletTouch])

  return (
    <div
      className={
        isFullViewport || isCompactPage
          ? 'flex h-screen-z overflow-hidden bg-background'
          : 'flex min-h-screen-z bg-background'
      }
    >
      {/* Sidebar */}
      <Sidebar currentPath={currentPath} />

      {/* Main Area - shifts based on sidebar width on desktop, full width on mobile */}
      <motion.div
        initial={false}
        animate={{ marginLeft: isMobile ? 0 : isTabletTouch ? '4rem' : sidebarWidth }}
        transition={{ duration: 0.2, ease: 'easeInOut' }}
        className={
          // min-w-0 is critical: without it this flex-1 column's min-width
          // defaults to its content's min-content, so a wide header/page can
          // stretch it past the viewport and the whole shell scrolls sideways
          // on mobile. min-w-0 lets it shrink so `main`'s overflow-x-hidden clips.
          isFullViewport || isCompactPage
            ? 'flex min-w-0 flex-1 flex-col h-screen-z overflow-hidden'
            : 'flex min-w-0 flex-1 flex-col'
        }
      >
        {/* Header - hidden on POS-style full-viewport pages */}
        {!isFullViewport && <Header breadcrumbs={breadcrumbs} />}

        {/* Page Content */}
        <main
          className={
            isFullViewport
              ? 'flex-1 min-h-0 overflow-hidden'
              : isCompactPage
                // Reserve room on any touch device (phone or tablet — the
                // bottom-bar shell) so it doesn't cover the split view's
                // content. Desktop docks a side rail instead, so no bar, no padding.
                ? showBottomNav
                  ? 'flex-1 min-h-0 overflow-hidden pb-24'
                  : 'flex-1 min-h-0 overflow-hidden'
                : 'flex-1 overflow-x-hidden overflow-y-auto'
          }
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={currentPath}
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className={
                isFullViewport
                  ? 'content-area min-w-0 h-full flex flex-col'
                  : isCompactPage
                    ? 'content-area min-w-0 h-full flex flex-col px-2 pt-2 pb-2 sm:px-3 md:px-4'
                    : isTightScrollPage
                      ? 'content-area min-w-0 px-2 py-2 sm:px-3 md:px-4'
                      // Keep the tall bottom pad (pb-24) on any touch device so
                      // the last rows clear the bottom tab bar; desktop shrinks it.
                      : showBottomNav
                        ? 'content-area min-w-0 px-3 pt-3 pb-24 md:px-4 md:pt-4 lg:px-6 lg:pt-6'
                        : 'content-area min-w-0 p-3 md:p-4 lg:p-6'
              }
            >
              {title && (
                <h1 className="sr-only">{title}</h1>
              )}
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </motion.div>

      {/* App-wide import indicator — the import runs in importStore, so it keeps
          going (and stays visible here) even if the drawer is closed. */}
      <ImportProgressPill />
    </div>
  )
}
