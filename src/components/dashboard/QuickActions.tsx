import { motion, type Variants } from 'framer-motion'
import { ArrowUpRight, Package, ShoppingCart, UserPlus, Zap } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { navigate } from '@/lib/router'
import { cn } from '@/lib/utils'

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
}

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 16, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] as const } },
}

const ACTIONS = [
  { label: 'New Sale',     shortcut: 'Alt+N', icon: Zap,          iconBg: 'bg-blue-500/15',    iconColor: 'text-blue-600 dark:text-blue-400',       href: '/billing/new' },
  { label: 'New Purchase', shortcut: 'F2',    icon: ShoppingCart, iconBg: 'bg-purple-500/15',  iconColor: 'text-purple-600 dark:text-purple-400',   href: '/purchase/orders' },
  { label: 'Add Product',  shortcut: '',      icon: Package,      iconBg: 'bg-emerald-500/15', iconColor: 'text-emerald-600 dark:text-emerald-400', href: '/inventory/products' },
  { label: 'Add Customer', shortcut: '',      icon: UserPlus,     iconBg: 'bg-amber-500/15',   iconColor: 'text-amber-600 dark:text-amber-400',     href: '/customers' },
]

export function QuickActions() {
  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="h-full">
      {/*
        Layout per breakpoint:
        - default: 2 cols (mobile, 2x2 grid)
        - sm: 4 cols (full-width tablet, single row)
        - lg: 1 col (lives in narrow col-5 next to the sales chart; cards stack
              vertically and stretch with grid-rows-4 to match the chart's height)
      */}
      <div className="grid h-full grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-1 lg:grid-rows-4">
        {ACTIONS.map((action) => {
          const Icon = action.icon
          return (
            <motion.div key={action.label} variants={itemVariants} className="h-full">
              <Card hover className="group h-full cursor-pointer" onClick={() => navigate(action.href)}>
                <CardContent className="flex h-full items-center gap-3 p-4">
                  <div className={cn('rounded-xl p-2.5 transition-transform group-hover:scale-110', action.iconBg)}>
                    <Icon className={cn('h-4.5 w-4.5', action.iconColor)} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{action.label}</p>
                    {action.shortcut && (
                      <kbd className="mt-0.5 inline-flex h-4 items-center rounded border border-border/60 bg-muted/50 px-1 font-mono text-[9px] text-muted-foreground">
                        {action.shortcut}
                      </kbd>
                    )}
                  </div>
                  <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40 transition-all group-hover:text-muted-foreground" />
                </CardContent>
              </Card>
            </motion.div>
          )
        })}
      </div>
    </motion.div>
  )
}
