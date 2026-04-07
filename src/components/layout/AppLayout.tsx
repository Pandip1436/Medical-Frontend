import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore } from '@/stores/authStore'
import { navigate } from '@/lib/router'
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

export default function AppLayout({
  children,
  breadcrumbs,
  title,
  currentPath,
}: AppLayoutProps) {
  const { isAuthenticated, sidebarCollapsed, theme, resolvedTheme } = useAuthStore()

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
      <div className="flex h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Redirecting to login...</p>
      </div>
    )
  }

  const sidebarWidth = sidebarCollapsed ? 64 : 256

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <Sidebar currentPath={currentPath} />

      {/* Main Area - shifts based on sidebar width on desktop, full width on mobile */}
      <motion.div
        initial={false}
        animate={{ marginLeft: sidebarWidth }}
        transition={{ duration: 0.2, ease: 'easeInOut' }}
        className="flex flex-1 flex-col max-md:!ml-0"
      >
        {/* Header - sticky at top of content area */}
        <Header breadcrumbs={breadcrumbs} />

        {/* Page Content */}
        <main className="flex-1 overflow-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentPath}
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="content-area p-3 pb-24 md:p-4 lg:p-6"
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
