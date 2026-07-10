import { motion } from 'framer-motion'

interface DashboardHeaderProps {
  userName: string
  businessName: string
}

export function DashboardHeader({ userName, businessName }: DashboardHeaderProps) {
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
    >
      <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">
        {greeting}, {userName}
      </h1>
      <p className="text-sm text-muted-foreground">
        Here&apos;s what&apos;s happening at {businessName} today.
      </p>
    </motion.div>
  )
}
