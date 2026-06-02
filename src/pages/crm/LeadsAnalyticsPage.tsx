import { useState } from 'react'
import { AnimatePresence, motion, type Variants } from 'framer-motion'
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Calendar,
  CalendarRange,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  PhoneCall,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { navigate, goBack } from '@/lib/router'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import {
  useLeadsAnalytics,
  type AnalyticsPeriod,
  type AnalyticsPresetKey,
  currentMonthAnchor,
  shiftMonthAnchor,
} from './hooks/useLeadsAnalytics'
import { STAGES, SOURCES, type LeadStage, type LeadSource } from './types'

// ─── Color helpers (match STAGES color names) ────────────────────────────

const STAGE_HEX: Record<LeadStage, string> = {
  LEAD: '#3b82f6', // blue-500
  QUALIFIED: '#a855f7', // purple-500
  PROPOSAL: '#f59e0b', // amber-500
  NEGOTIATION: '#f97316', // orange-500
  WON: '#10b981', // emerald-500
  LOST: '#f43f5e', // rose-500
}

const SOURCE_HEX: Record<LeadSource, string> = {
  MANUAL: '#64748b', // slate
  INDIAMART: '#0ea5e9', // sky
  REFERRAL: '#8b5cf6', // violet
  WEBSITE: '#06b6d4', // cyan
  WHATSAPP: '#22c55e', // green
  CALL: '#f59e0b', // amber
  EMAIL: '#a855f7', // purple
  OTHER: '#94a3b8', // slate-400
}

const stageLabel = (s: LeadStage) =>
  STAGES.find((x) => x.value === s)?.label ?? s
const sourceLabel = (s: LeadSource) =>
  SOURCES.find((x) => x.value === s)?.label ?? s

// ─── Compact INR formatter (for big numbers in KPI tiles) ────────────────

function formatCurrencyCompact(n: number): string {
  if (Math.abs(n) >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(1)}Cr`
  if (Math.abs(n) >= 1_00_000) return `₹${(n / 1_00_000).toFixed(1)}L`
  if (Math.abs(n) >= 1000) return `₹${(n / 1000).toFixed(1)}K`
  return `₹${n.toFixed(0)}`
}

const formatPct = (n: number) => `${(n * 100).toFixed(0)}%`

// ─────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────

// Spring-y entrance — feels lighter than the linear easeInOut default.
const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.04 },
  },
}

// Inner grids share the same item variant but cascade their own children
// faster so the tiles still feel like one beat, not four separate ones.
const tileGroupVariants: Variants = {
  hidden: { opacity: 1 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.04 },
  },
}

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 280, damping: 24 },
  },
}

export default function LeadsAnalyticsPage() {
  const [period, setPeriod] = useState<AnalyticsPeriod>({
    kind: 'preset',
    preset: '30d',
  })
  const { summary, trend, needsAttention, loading, refetch, range } =
    useLeadsAnalytics(period)

  return (
    <div className="flex flex-col gap-2">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 gap-1.5 shrink-0"
            onClick={() => goBack('/crm/leads')}
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              <h1 className="text-lg font-bold tracking-tight truncate">
                Lead Analytics
              </h1>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              How your pipeline is performing — where leads come from, where they get stuck, what needs attention.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {period.kind === 'month' && (
            <div className="hidden sm:flex items-center gap-0.5 rounded-md border border-border/60 bg-background overflow-hidden">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9 w-9 p-0 rounded-none"
                onClick={() =>
                  setPeriod({
                    kind: 'month',
                    anchor: shiftMonthAnchor(period.anchor, -1),
                  })
                }
                title="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9 w-9 p-0 rounded-none"
                onClick={() => {
                  const next = shiftMonthAnchor(period.anchor, 1)
                  // Don't allow navigating past current month.
                  if (next > currentMonthAnchor()) return
                  setPeriod({ kind: 'month', anchor: next })
                }}
                disabled={
                  shiftMonthAnchor(period.anchor, 1) > currentMonthAnchor()
                }
                title="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
          <PeriodPicker period={period} label={range.label} onChange={setPeriod} />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 gap-1.5"
            onClick={refetch}
            disabled={loading}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Animated content area — restages every time the period changes so
          KPI tiles and charts re-enter with a soft cascade. */}
      <motion.div
        key={
          period.kind === 'preset'
            ? `preset:${period.preset}`
            : `month:${period.anchor}`
        }
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="flex flex-col gap-2"
      >
      {/* Tier 1 — KPI cards (own micro-stagger so the 4 tiles cascade) */}
      <motion.div variants={tileGroupVariants} className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <KpiCard
          title="Total Leads"
          value={summary?.kpis.totalLeads ?? 0}
          delta={summary?.kpis.totalLeadsDelta ?? null}
          subtitle={
            summary
              ? `vs ${summary.kpis.totalLeadsPrev} in previous period`
              : '—'
          }
          icon={<Users className="h-4 w-4" />}
          iconBg="bg-blue-500/10"
          iconColor="text-blue-600 dark:text-blue-400"
          loading={loading}
        />
        <KpiCard
          title="Pipeline Value"
          value={formatCurrencyCompact(summary?.kpis.pipelineValue ?? 0)}
          subtitle={
            summary ? `${summary.kpis.openLeads} open leads` : '—'
          }
          icon={<Wallet className="h-4 w-4" />}
          iconBg="bg-violet-500/10"
          iconColor="text-violet-600 dark:text-violet-400"
          loading={loading}
        />
        <KpiCard
          title="Win Rate"
          value={formatPct(summary?.kpis.winRate ?? 0)}
          subtitle={
            summary
              ? `${summary.kpis.wonCount} won · ${summary.kpis.lostCount} lost`
              : '—'
          }
          icon={<TrendingUp className="h-4 w-4" />}
          iconBg="bg-emerald-500/10"
          iconColor="text-emerald-600 dark:text-emerald-400"
          loading={loading}
        />
        <KpiCard
          title="Avg Deal Size"
          value={formatCurrencyCompact(summary?.kpis.avgDealSize ?? 0)}
          subtitle="Average WON deal in period"
          icon={<BarChart3 className="h-4 w-4" />}
          iconBg="bg-amber-500/10"
          iconColor="text-amber-600 dark:text-amber-400"
          loading={loading}
        />
      </motion.div>

      {/* Tier 2 — Funnel + Source */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-2">
        <FunnelCard
          data={summary?.funnel ?? []}
          loading={loading}
          onPick={(stage) => navigate(`/crm/leads?stage=${stage}`)}
        />
        <SourceBreakdownCard
          data={summary?.sourceBreakdown ?? []}
          loading={loading}
          onPick={(source) => navigate(`/crm/leads?source=${source}`)}
        />
      </motion.div>

      {/* Tier 3 — Trend + Aging */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-3 gap-2">
        <div className="lg:col-span-2">
          <TrendCard data={trend} loading={loading} />
        </div>
        <AgingCard data={summary?.aging ?? []} loading={loading} />
      </motion.div>

      {/* Tier 4 — Needs Attention */}
      <motion.div variants={itemVariants}>
        <NeedsAttentionCard data={needsAttention} loading={loading} />
      </motion.div>
      </motion.div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────

interface KpiCardProps {
  title: string
  value: number | string
  subtitle: string
  delta?: number | null
  icon: React.ReactNode
  iconBg: string
  iconColor: string
  loading?: boolean
}

function KpiCard({
  title,
  value,
  subtitle,
  delta,
  icon,
  iconBg,
  iconColor,
  loading,
}: KpiCardProps) {
  const deltaDir =
    delta == null ? null : delta > 0.01 ? 'up' : delta < -0.01 ? 'down' : 'flat'
  return (
    <motion.div
      variants={itemVariants}
      whileHover={{ y: -2, transition: { duration: 0.15 } }}
    >
      <Card className="h-full transition-shadow hover:shadow-md">
        <CardContent className="p-3 flex flex-col gap-1.5">
          <div className="flex items-start justify-between">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              {title}
            </p>
            <div className={cn('rounded-lg p-1.5', iconBg, iconColor)}>
              {icon}
            </div>
          </div>
          <div className="text-2xl font-bold tracking-tight">
            {loading ? (
              <Skeleton className="h-8 w-24" />
            ) : typeof value === 'number' ? (
              value.toLocaleString('en-IN')
            ) : (
              value
            )}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            {deltaDir === 'up' && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 font-semibold">
                <TrendingUp className="h-3 w-3" />
                {formatPct(Math.abs(delta!))}
              </span>
            )}
            {deltaDir === 'down' && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-rose-500/10 text-rose-700 dark:text-rose-400 px-1.5 py-0.5 font-semibold">
                <TrendingDown className="h-3 w-3" />
                {formatPct(Math.abs(delta!))}
              </span>
            )}
            <span className="truncate">{subtitle}</span>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

// ─── Funnel card ─────────────────────────────────────────────────────────

function FunnelCard({
  data,
  loading,
  onPick,
}: {
  data: { stage: LeadStage; count: number }[]
  loading: boolean
  onPick: (stage: LeadStage) => void
}) {
  // Only show progression stages (not LOST) — LOST is a sibling, not a step.
  const progression = data.filter((d) => d.stage !== 'LOST')
  const max = Math.max(1, ...progression.map((d) => d.count))

  return (
    <Card>
      <CardContent className="p-4">
        <SectionHeader
          title="Conversion Funnel"
          subtitle="Where leads drop off"
        />
        {loading ? (
          <div className="space-y-2 mt-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : (
          <div className="space-y-2 mt-3">
            {progression.map((d, i) => {
              const next = progression[i + 1]
              const conv = next && d.count > 0 ? next.count / d.count : null
              const widthPct = (d.count / max) * 100
              return (
                <div key={d.stage}>
                  <button
                    type="button"
                    onClick={() => onPick(d.stage)}
                    className="group flex items-center w-full gap-3 hover:bg-muted/40 rounded-md px-2 py-1.5 transition-colors text-left"
                  >
                    <span
                      className="inline-block h-2 w-2 rounded-full shrink-0"
                      style={{ background: STAGE_HEX[d.stage] }}
                    />
                    <span className="w-24 text-xs font-semibold shrink-0">
                      {stageLabel(d.stage)}
                    </span>
                    <div className="flex-1 h-6 rounded bg-muted/30 overflow-hidden relative">
                      <div
                        className="h-full rounded transition-all duration-300"
                        style={{
                          width: `${widthPct}%`,
                          background: `linear-gradient(to right, ${STAGE_HEX[d.stage]}cc, ${STAGE_HEX[d.stage]})`,
                        }}
                      />
                      <span className="absolute inset-y-0 left-2 flex items-center text-[11px] font-bold text-white drop-shadow">
                        {d.count > 0 ? d.count : ''}
                      </span>
                    </div>
                    <span className="w-12 text-right tabular-nums text-xs font-semibold">
                      {d.count}
                    </span>
                  </button>
                  {conv != null && i < progression.length - 1 && (
                    <div className="flex items-center gap-2 pl-7 py-0.5 text-[10px] text-muted-foreground">
                      <span className="inline-block h-3 w-px bg-border" />
                      <span className="font-medium">
                        {formatPct(conv)} convert →
                      </span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Source breakdown card ───────────────────────────────────────────────

function SourceBreakdownCard({
  data,
  loading,
  onPick,
}: {
  data: { source: LeadSource; count: number; won: number; winRate: number }[]
  loading: boolean
  onPick: (source: LeadSource) => void
}) {
  const total = data.reduce((s, d) => s + d.count, 0)
  return (
    <Card>
      <CardContent className="p-4">
        <SectionHeader
          title="Lead Sources"
          subtitle="Where your leads come from"
        />
        {loading ? (
          <Skeleton className="h-60 w-full mt-3" />
        ) : data.length === 0 ? (
          <EmptyState text="No leads in this period yet." />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3 items-center">
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data}
                    dataKey="count"
                    nameKey="source"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={2}
                  >
                    {data.map((d) => (
                      <Cell
                        key={d.source}
                        fill={SOURCE_HEX[d.source]}
                        stroke="transparent"
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.[0]) return null
                      const p = payload[0].payload as (typeof data)[number]
                      return (
                        <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg">
                          <div className="font-semibold mb-1">
                            {sourceLabel(p.source)}
                          </div>
                          <div className="text-muted-foreground">
                            {p.count} leads · {p.won} won · {formatPct(p.winRate)} win rate
                          </div>
                        </div>
                      )
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-1">
              {data.map((d) => {
                const sharePct = total > 0 ? (d.count / total) * 100 : 0
                return (
                  <button
                    key={d.source}
                    type="button"
                    onClick={() => onPick(d.source)}
                    className="group flex items-center gap-2 w-full text-left hover:bg-muted/40 rounded-md px-2 py-1.5 transition-colors"
                  >
                    <span
                      className="inline-block h-2 w-2 rounded-full shrink-0"
                      style={{ background: SOURCE_HEX[d.source] }}
                    />
                    <span className="text-xs font-semibold flex-1 truncate">
                      {sourceLabel(d.source)}
                    </span>
                    <span className="text-[10px] font-mono text-muted-foreground tabular-nums">
                      {sharePct.toFixed(0)}%
                    </span>
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold w-16 text-right">
                      {formatPct(d.winRate)} win
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Trend card ──────────────────────────────────────────────────────────

function TrendCard({
  data,
  loading,
}: {
  data: { bucket: 'day' | 'month'; series: { key: string; created: number; won: number }[] } | null
  loading: boolean
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <SectionHeader
          title="Lead Activity"
          subtitle="Leads created vs won over time"
        />
        {loading || !data ? (
          <Skeleton className="h-60 w-full mt-3" />
        ) : data.series.length === 0 ? (
          <EmptyState text="No activity in this period." />
        ) : (
          <div className="h-60 mt-3">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.series} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="g-created" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="g-won" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} opacity={0.4} />
                <XAxis
                  dataKey="key"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(k) => {
                    if (data.bucket === 'month') {
                      const [, m] = k.split('-')
                      return [
                        'Jan',
                        'Feb',
                        'Mar',
                        'Apr',
                        'May',
                        'Jun',
                        'Jul',
                        'Aug',
                        'Sep',
                        'Oct',
                        'Nov',
                        'Dec',
                      ][Number(m) - 1]
                    }
                    const [, , d] = k.split('-')
                    return d
                  }}
                  interval="preserveStartEnd"
                />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} width={28} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null
                    return (
                      <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg">
                        <div className="font-semibold mb-1">{label}</div>
                        {payload.map((p) => {
                          const key = String(p.dataKey ?? '')
                          return (
                            <div key={key} className="flex items-center gap-2">
                              <span
                                className="h-2 w-2 rounded-full"
                                style={{ background: p.color }}
                              />
                              <span className="capitalize text-muted-foreground">{key}:</span>
                              <span className="font-semibold tabular-nums">{p.value}</span>
                            </div>
                          )
                        })}
                      </div>
                    )
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area
                  type="monotone"
                  dataKey="created"
                  stroke="#3b82f6"
                  fill="url(#g-created)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="won"
                  stroke="#10b981"
                  fill="url(#g-won)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Aging card ──────────────────────────────────────────────────────────

const AGING_BUCKETS = ['0-7d', '7-30d', '30-90d', '90d+'] as const
const AGING_COLORS: Record<(typeof AGING_BUCKETS)[number], string> = {
  '0-7d': '#10b981',
  '7-30d': '#3b82f6',
  '30-90d': '#f59e0b',
  '90d+': '#f43f5e',
}

function AgingCard({
  data,
  loading,
}: {
  data: ({ stage: LeadStage } & Record<(typeof AGING_BUCKETS)[number], number>)[]
  loading: boolean
}) {
  const formatted = data.map((d) => ({ ...d, label: stageLabel(d.stage) }))
  const total = data.reduce(
    (s, d) =>
      s + d['0-7d'] + d['7-30d'] + d['30-90d'] + d['90d+'],
    0,
  )
  return (
    <Card>
      <CardContent className="p-4">
        <SectionHeader
          title="Stage Aging"
          subtitle="How long open leads have been sitting"
        />
        {loading ? (
          <Skeleton className="h-60 w-full mt-3" />
        ) : total === 0 ? (
          <EmptyState text="No open leads." />
        ) : (
          <div className="h-60 mt-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={formatted}
                layout="vertical"
                margin={{ top: 5, right: 10, left: 0, bottom: 0 }}
              >
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" horizontal={false} opacity={0.4} />
                <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                <YAxis type="category" dataKey="label" tick={{ fontSize: 10 }} width={70} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null
                    return (
                      <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg min-w-32">
                        <div className="font-semibold mb-1">{label}</div>
                        {payload.map((p) => {
                          const key = String(p.dataKey ?? '')
                          return (
                            <div key={key} className="flex items-center gap-2">
                              <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
                              <span className="text-muted-foreground">{key}:</span>
                              <span className="font-semibold ml-auto tabular-nums">{p.value}</span>
                            </div>
                          )
                        })}
                      </div>
                    )
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                {AGING_BUCKETS.map((b) => (
                  <Bar key={b} dataKey={b} stackId="a" fill={AGING_COLORS[b]} radius={[0, 0, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}


// ─── Needs Attention card ────────────────────────────────────────────────

function NeedsAttentionCard({
  data,
  loading,
}: {
  data: {
    staleDays: number
    total: number
    leads: Array<{
      id: string
      leadNumber: string
      title: string
      stage: LeadStage
      value: number
      updatedAt: string
      daysSinceUpdate: number
      contact: {
        firstName: string
        lastName: string | null
        phone: string | null
      } | null
      assignedToUser: { name: string } | null
    }>
  } | null
  loading: boolean
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <SectionHeader
          title="Needs Attention"
          subtitle={`Open leads with no activity in 7+ days · highest value first`}
          right={
            data && data.total > 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 px-2 py-0.5 text-[10px] font-semibold">
                <ChevronDown className="h-3 w-3 rotate-180" />
                {data.total} stale
              </span>
            ) : null
          }
        />
        {loading || !data ? (
          <div className="space-y-2 mt-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : data.leads.length === 0 ? (
          <EmptyState text="All leads are fresh — nothing waiting." />
        ) : (
          <div className="mt-3 divide-y divide-border/40">
            {data.leads.map((l) => {
              const name = l.contact
                ? `${l.contact.firstName}${l.contact.lastName ? ' ' + l.contact.lastName : ''}`
                : '—'
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => navigate(`/crm/leads?leadId=${l.id}`)}
                  className="group flex items-center gap-3 w-full py-2.5 px-1 hover:bg-muted/40 rounded transition-colors text-left"
                >
                  <span
                    className="inline-block h-2 w-2 rounded-full shrink-0"
                    style={{ background: STAGE_HEX[l.stage] }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold truncate">{name}</span>
                      <span className="text-[10px] font-mono text-muted-foreground tabular-nums shrink-0">
                        {l.leadNumber}
                      </span>
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                      {l.title}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold tabular-nums">
                      {l.value > 0 ? formatCurrency(l.value) : '—'}
                    </div>
                    <div className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold">
                      {l.daysSinceUpdate}d cold · {formatDate(l.updatedAt)}
                    </div>
                  </div>
                  <div className="hidden sm:flex items-center gap-2 shrink-0">
                    {l.contact?.phone && (
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-muted/40 text-muted-foreground group-hover:bg-emerald-500/10 group-hover:text-emerald-600 transition-colors">
                        <PhoneCall className="h-3 w-3" />
                      </span>
                    )}
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-foreground transition-colors" />
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Small primitives ────────────────────────────────────────────────────

function SectionHeader({
  title,
  subtitle,
  right,
}: {
  title: string
  subtitle?: string
  right?: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div>
        <h3 className="text-sm font-bold">{title}</h3>
        {subtitle && <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {right}
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-muted/40">
        <BarChart3 className="h-5 w-5 text-muted-foreground/40" />
      </div>
      <p className="mt-3 text-xs text-muted-foreground/70">{text}</p>
    </div>
  )
}

// ─── Period picker (preset chips + month navigator) ─────────────────────

const PRESET_OPTIONS: { key: AnalyticsPresetKey; label: string }[] = [
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: '90d', label: 'Last 90 days' },
  { key: 'ytd', label: 'This Year' },
]

const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

function PeriodPicker({
  period,
  label,
  onChange,
}: {
  period: AnalyticsPeriod
  label: string
  onChange: (p: AnalyticsPeriod) => void
}) {
  const [open, setOpen] = useState(false)
  const [calendarYear, setCalendarYear] = useState(() => {
    if (period.kind === 'month') return Number(period.anchor.split('-')[0])
    return new Date().getFullYear()
  })

  const today = new Date()
  const todayMonth = today.getMonth()
  const todayYear = today.getFullYear()
  const activeMonthAnchor = period.kind === 'month' ? period.anchor : null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 gap-1.5 min-w-44 justify-between font-semibold"
        >
          <span className="flex items-center gap-1.5">
            {period.kind === 'month' ? (
              <CalendarRange className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            )}
            {label}
          </span>
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-72 p-3 rounded-lg border border-border/60 bg-popover shadow-xl"
      >
        {/* Presets */}
        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 mb-2">
          Quick ranges
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {PRESET_OPTIONS.map((opt) => {
            const active =
              period.kind === 'preset' && period.preset === opt.key
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => {
                  onChange({ kind: 'preset', preset: opt.key })
                  setOpen(false)
                }}
                className={cn(
                  'rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors',
                  active
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border/60 hover:bg-muted',
                )}
              >
                {opt.label}
              </button>
            )
          })}
        </div>

        {/* Month picker */}
        <div className="mt-3 pt-3 border-t border-border/60">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
              Pick a month
            </span>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => setCalendarYear((y) => y - 1)}
                className="h-6 w-6 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center"
                aria-label="Previous year"
              >
                <ChevronLeft className="h-3 w-3" />
              </button>
              <span className="text-xs font-bold tabular-nums px-1">
                {calendarYear}
              </span>
              <button
                type="button"
                onClick={() => setCalendarYear((y) => y + 1)}
                disabled={calendarYear >= todayYear}
                className="h-6 w-6 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center disabled:opacity-30 disabled:hover:bg-transparent"
                aria-label="Next year"
              >
                <ChevronRight className="h-3 w-3" />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-1">
            {MONTH_SHORT.map((m, idx) => {
              const anchor = `${calendarYear}-${String(idx + 1).padStart(2, '0')}`
              const isFuture =
                calendarYear > todayYear ||
                (calendarYear === todayYear && idx > todayMonth)
              const active = anchor === activeMonthAnchor
              return (
                <button
                  key={m}
                  type="button"
                  disabled={isFuture}
                  onClick={() => {
                    onChange({ kind: 'month', anchor })
                    setOpen(false)
                  }}
                  className={cn(
                    'rounded-md py-1.5 text-xs font-semibold transition-colors',
                    active
                      ? 'bg-primary text-primary-foreground'
                      : isFuture
                        ? 'text-muted-foreground/30 cursor-not-allowed'
                        : 'hover:bg-muted text-foreground',
                  )}
                >
                  {m}
                </button>
              )
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
