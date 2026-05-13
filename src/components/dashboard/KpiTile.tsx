import CountUpModule from 'react-countup'
import { motion, type Variants } from 'framer-motion'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { navigate } from '@/lib/router'
import { cn } from '@/lib/utils'
import type { KpiTileData } from './types'

const CountUp = typeof CountUpModule === 'function' ? CountUpModule : (CountUpModule as any).default

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 12, scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] as const },
  },
}

interface KpiTileProps {
  kpi: KpiTileData
  isLoading?: boolean
}

export function KpiTile({ kpi, isLoading }: KpiTileProps) {
  const Icon = kpi.icon
  const isCurrency = kpi.isCurrency !== false
  const delta = kpi.delta

  return (
    <motion.div variants={itemVariants}>
      <Card
        hover
        className="group relative h-full cursor-pointer overflow-hidden"
        onClick={() => navigate(kpi.href)}
      >
        <CardContent className="flex h-full flex-col p-3.5">
          {/* Row 1: title + icon. Icon is colored, title is uppercase muted. */}
          <div className="flex items-start justify-between gap-2">
            <p className="text-[10px] font-semibold uppercase leading-tight tracking-wider text-muted-foreground">
              {kpi.title}
            </p>
            <div className={cn('shrink-0 rounded-lg p-1.5 transition-transform group-hover:scale-110', kpi.iconBg)}>
              <Icon className={cn('h-3.5 w-3.5', kpi.iconColor)} />
            </div>
          </div>

          {/* Row 2: the number — the main visual weight of the tile. */}
          <div className="mt-1.5 text-xl font-bold tracking-tight">
            {isLoading ? (
              <Skeleton className="h-7 w-24" />
            ) : isCurrency ? (
              <>
                <span className="text-sm font-semibold text-muted-foreground">₹</span>
                <CountUp end={kpi.value} duration={1.2} separator="," useEasing />
              </>
            ) : (
              <CountUp end={kpi.value} duration={1.0} />
            )}
          </div>

          {/* Row 3: delta + subtitle on one line — context that explains the number. */}
          <div className="mt-auto flex items-center gap-1.5 pt-1 text-[10px] text-muted-foreground">
            {isLoading ? (
              <Skeleton className="h-3 w-20" />
            ) : (
              <>
                {delta && <DeltaChip delta={delta} />}
                <span className="truncate">{kpi.subtitle}</span>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

function DeltaChip({ delta }: { delta: { pct: number; dir: 'up' | 'down' | 'flat' } }) {
  const config = {
    up: { Icon: ArrowUpRight, cls: 'text-emerald-700 dark:text-emerald-400' },
    down: { Icon: ArrowDownRight, cls: 'text-rose-700 dark:text-rose-400' },
    flat: { Icon: Minus, cls: 'text-muted-foreground' },
  }[delta.dir]

  return (
    <span className={cn('inline-flex shrink-0 items-center gap-0.5 font-semibold', config.cls)}>
      <config.Icon className="h-2.5 w-2.5" />
      {Math.abs(delta.pct).toFixed(1)}%
    </span>
  )
}
