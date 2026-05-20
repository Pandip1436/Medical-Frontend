import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore } from '@/stores/authStore'
import { navigate } from '@/lib/router'
import { Sidebar } from './Sidebar'
import { Header } from './Header'

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const mql = window.matchMedia('(max-width: 767px)')
    const onChange = (e: MediaQueryList | MediaQueryListEvent) => setIsMobile(e.matches)
    onChange(mql)
    mql.addEventListener('change', onChange as (e: MediaQueryListEvent) => void)
    return () => mql.removeEventListener('change', onChange as (e: MediaQueryListEvent) => void)
  }, [])
  return isMobile
}

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

export default function AppLayout({
  children,
  breadcrumbs,
  title,
  currentPath,
}: AppLayoutProps) {
  const { isAuthenticated, sidebarCollapsed, theme, resolvedTheme } = useAuthStore()
  const isMobile = useIsMobile()
  const fetchSettings = useSettingsStore((s) => s.fetchSettings)

  // Initialize settings
  useEffect(() => {
    if (isAuthenticated) {
      fetchSettings()
    }
  }, [isAuthenticated, fetchSettings])

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
      <div className="flex h-dvh items-center justify-center bg-background">
        <p className="text-muted-foreground">Redirecting to login...</p>
      </div>
    )
  }

  const sidebarWidth = sidebarCollapsed ? 64 : 256

  // POS-style routes use full viewport with no global header/padding
  const isFullViewport = currentPath === '/billing/new'

  // Compact routes keep the header but use minimal padding so the page
  // owns its own spacing (Leads list is dense and needs the extra width).
  // Only pages that manage their own internal scrolling belong here —
  // long-scroll pages (like Analytics) should use the default layout so
  // `main` provides the scroll container.
  const isCompactPage = currentPath === '/crm/leads'

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

  return (
    <div
      className={
        isFullViewport || isCompactPage
          ? 'flex h-dvh overflow-hidden bg-background'
          : 'flex min-h-dvh bg-background'
      }
    >
      {/* Sidebar */}
      <Sidebar currentPath={currentPath} />

      {/* Main Area - shifts based on sidebar width on desktop, full width on mobile */}
      <motion.div
        initial={false}
        animate={{ marginLeft: isMobile ? 0 : sidebarWidth }}
        transition={{ duration: 0.2, ease: 'easeInOut' }}
        className={
          isFullViewport || isCompactPage
            ? 'flex flex-1 flex-col h-dvh overflow-hidden'
            : 'flex flex-1 flex-col'
        }
      >
        {/* Header - hidden on POS-style full-viewport pages */}
        {!isFullViewport && <Header breadcrumbs={breadcrumbs} />}

        {/* Page Content */}
        <main
          className={
            isFullViewport || isCompactPage
              ? 'flex-1 min-h-0 overflow-hidden'
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
                      : 'content-area min-w-0 p-3 pb-24 md:p-4 lg:p-6'
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
    </div>
  )
}
