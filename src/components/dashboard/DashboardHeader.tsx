import { motion } from 'framer-motion'
import { Activity, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { navigate } from '@/lib/router'
import { cn } from '@/lib/utils'

interface DashboardHeaderProps {
  userName: string
  businessName: string
  isRefreshing: boolean
  onRefresh: () => void
}

export function DashboardHeader({ userName, businessName, isRefreshing, onRefresh }: DashboardHeaderProps) {
  const greeting = (() => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 17) return 'Good afternoon'
    return 'Good evening'
  })()

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] as const }}
      className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"
    >
      <div>
        <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">
          {greeting}, {userName}
        </h1>
        <p className="text-sm text-muted-foreground">
          Here&apos;s what&apos;s happening at {businessName} today.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" className="gap-1.5" onClick={onRefresh} disabled={isRefreshing}>
          <RefreshCw className={cn('h-3.5 w-3.5', isRefreshing && 'animate-spin')} />
          Refresh
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate('/reports')}>
          <Activity className="h-3.5 w-3.5" />
          Reports
        </Button>
      </div>
    </motion.div>
  )
}
