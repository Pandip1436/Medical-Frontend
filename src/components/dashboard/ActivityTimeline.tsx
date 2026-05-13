import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Activity, ArrowUpRight, IndianRupee, Package, RotateCcw, ShoppingCart, UserPlus, type LucideIcon } from 'lucide-react'
import dayjs from 'dayjs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { navigate } from '@/lib/router'
import { cn } from '@/lib/utils'
import type { ActivityItem } from './types'

// Visual language matches NeedsAttentionInbox: type-colored left border,
// tinted row background that deepens on hover, colored icon circle, and
// a tag pill. The tag is a 3-letter shorthand so the row stays compact.
const TYPE_CONFIG: Record<ActivityItem['type'], {
  icon: LucideIcon
  iconBg: string
  iconColor: string
  rowBg: string
  hoverBg: string
  border: string
  tag: string
  tagColor: string
}> = {
  SALE:     { icon: IndianRupee,  iconBg: 'bg-blue-500/15',    iconColor: 'text-blue-600 dark:text-blue-400',       rowBg: 'bg-blue-500/5',    hoverBg: 'hover:bg-blue-500/10',    border: 'border-l-blue-500',    tag: 'SALE', tagColor: 'bg-blue-500/15 text-blue-700 dark:text-blue-400' },
  PURCHASE: { icon: ShoppingCart, iconBg: 'bg-purple-500/15',  iconColor: 'text-purple-600 dark:text-purple-400',   rowBg: 'bg-purple-500/5',  hoverBg: 'hover:bg-purple-500/10',  border: 'border-l-purple-500',  tag: 'PUR',  tagColor: 'bg-purple-500/15 text-purple-700 dark:text-purple-400' },
  STOCK:    { icon: Package,      iconBg: 'bg-emerald-500/15', iconColor: 'text-emerald-600 dark:text-emerald-400', rowBg: 'bg-emerald-500/5', hoverBg: 'hover:bg-emerald-500/10', border: 'border-l-emerald-500', tag: 'STK',  tagColor: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
  PAYMENT:  { icon: RotateCcw,    iconBg: 'bg-amber-500/15',   iconColor: 'text-amber-600 dark:text-amber-400',     rowBg: 'bg-amber-500/5',   hoverBg: 'hover:bg-amber-500/10',   border: 'border-l-amber-500',   tag: 'PAY',  tagColor: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  CUSTOMER: { icon: UserPlus,     iconBg: 'bg-cyan-500/15',    iconColor: 'text-cyan-600 dark:text-cyan-400',       rowBg: 'bg-cyan-500/5',    hoverBg: 'hover:bg-cyan-500/10',    border: 'border-l-cyan-500',    tag: 'CUS',  tagColor: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-400' },
  SYSTEM:   { icon: Activity,     iconBg: 'bg-rose-500/15',    iconColor: 'text-rose-600 dark:text-rose-400',       rowBg: 'bg-rose-500/5',    hoverBg: 'hover:bg-rose-500/10',    border: 'border-l-rose-500',    tag: 'SYS',  tagColor: 'bg-rose-500/15 text-rose-700 dark:text-rose-400' },
}

interface Group {
  label: string
  items: ActivityItem[]
}

function groupByDate(activities: ActivityItem[]): Group[] {
  const today = dayjs().startOf('day')
  const yesterday = today.subtract(1, 'day')
  const weekAgo = today.subtract(7, 'day')

  const groups: Record<string, ActivityItem[]> = {
    TODAY: [],
    YESTERDAY: [],
    'THIS WEEK': [],
    EARLIER: [],
  }

  ;[...activities]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .forEach((a) => {
      const d = dayjs(a.timestamp).startOf('day')
      if (d.isSame(today)) groups.TODAY.push(a)
      else if (d.isSame(yesterday)) groups.YESTERDAY.push(a)
      else if (d.isAfter(weekAgo)) groups['THIS WEEK'].push(a)
      else groups.EARLIER.push(a)
    })

  return Object.entries(groups)
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => ({ label, items }))
}

interface ActivityTimelineProps {
  activities: ActivityItem[]
}

export function ActivityTimeline({ activities }: ActivityTimelineProps) {
  const groups = useMemo(() => groupByDate(activities), [activities])

  return (
    <Card className="flex flex-col lg:h-[460px]">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <CardTitle className="text-base">Recent activity</CardTitle>
          </div>
          {activities.length > 0 && (
            <span className="rounded-md bg-muted/60 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
              {activities.length}
            </span>
          )}
        </div>
        <CardDescription>Latest actions across the system</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden">
        {activities.length === 0 ? (
          <EmptyState />
        ) : (
          <ScrollArea className="h-full pr-3">
            <div className="space-y-4">
              {groups.map((g) => (
                <section key={g.label}>
                  <DateHeader label={g.label} count={g.items.length} />
                  <div className="mt-1.5 space-y-1.5">
                    {g.items.map((activity, idx) => (
                      <TimelineRow key={activity.id} activity={activity} index={idx} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  )
}

function DateHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="sticky top-0 z-10 -mx-1 flex items-center gap-2 bg-card/95 px-1 py-1 backdrop-blur">
      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
      <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </h3>
      <div className="h-px flex-1 bg-border/60" />
      <span className="text-[10px] font-semibold tabular-nums text-muted-foreground/60">
        {count}
      </span>
    </div>
  )
}

function TimelineRow({ activity, index }: { activity: ActivityItem; index: number }) {
  const config = TYPE_CONFIG[activity.type] ?? TYPE_CONFIG.SYSTEM
  const Icon = config.icon
  const time = dayjs(activity.timestamp).format('HH:mm')
  const isClickable = Boolean(activity.href)

  const handleClick = () => {
    if (activity.href) navigate(activity.href)
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: Math.min(index, 10) * 0.025, duration: 0.2 }}
      onClick={isClickable ? handleClick : undefined}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={(e) => {
        if (isClickable && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          handleClick()
        }
      }}
      className={cn(
        'group flex items-center gap-2 rounded-lg border border-border/40 border-l-4 p-2 transition-colors',
        config.border,
        config.rowBg,
        isClickable ? cn('cursor-pointer', config.hoverBg) : '',
      )}
    >
      <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full', config.iconBg)}>
        <Icon className={cn('h-3.5 w-3.5', config.iconColor)} />
      </div>

      <span className={cn('shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-wider', config.tagColor)}>
        {config.tag}
      </span>

      <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground/80">
        {time}
      </span>

      {activity.detail ? (
        <Tooltip delayDuration={100}>
          <TooltipTrigger asChild>
            <p className="min-w-0 flex-1 truncate text-sm font-medium leading-snug text-foreground">
              {activity.action}
            </p>
          </TooltipTrigger>
          <TooltipContent side="top" align="start">
            {activity.detail}
          </TooltipContent>
        </Tooltip>
      ) : (
        <p className="min-w-0 flex-1 truncate text-sm font-medium leading-snug text-foreground">
          {activity.action}
        </p>
      )}

      {isClickable && (
        <ArrowUpRight
          className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:text-muted-foreground"
          aria-hidden
        />
      )}
    </motion.div>
  )
}

function EmptyState() {
  return (
    <div className="flex h-[300px] flex-col items-center justify-center gap-2 text-center">
      <div className="rounded-full bg-blue-500/10 p-3">
        <Activity className="h-6 w-6 text-blue-600 dark:text-blue-400" />
      </div>
      <p className="text-sm font-medium">Nothing yet</p>
      <p className="text-xs text-muted-foreground">
        Sales, purchases and stock changes will show up here as they happen.
      </p>
    </div>
  )
}
