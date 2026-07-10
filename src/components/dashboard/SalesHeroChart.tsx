import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts'
import dayjs from 'dayjs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import api from '@/lib/api'
import { cn, formatCurrencyCompact } from '@/lib/utils'
import { useBranchRefresh } from '@/hooks/useBranchRefresh'
import { useDateRange } from './useDateRange'
import type { DateRangePreset } from './types'

const PRESETS: Array<{ value: DateRangePreset; label: string }> = [
  { value: 'month', label: 'Month' },
  { value: '6m', label: '6M' },
  { value: 'year', label: 'Year' },
]

const MONTH_OPTIONS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
].map((label, value) => ({ value, label }))

interface ChartPoint {
  label: string
  amount: number
}

function bucketForPreset(preset: DateRangePreset): 'day' | 'month' {
  // Month shows daily buckets; 6M and Year show monthly buckets.
  return preset === 'month' ? 'day' : 'month'
}

// Measure an element's box so we can hand recharts real pixel dimensions
// instead of ResponsiveContainer's percentage sizing. ResponsiveContainer
// paints once with its -1×-1 placeholder before its own observer fires, which
// logs the "width(-1) and height(-1)" warning; gating the chart on a measured
// width > 0 avoids that first zero-size render entirely.
function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, size] as const
}

export function SalesHeroChart() {
  const { resolved, range, setPreset, setAnchor } = useDateRange()
  const [chartRef, chartSize] = useElementSize<HTMLDivElement>()
  const bucket = bucketForPreset(range.preset)
  const anchor = useMemo(() => dayjs(range.anchor), [range.anchor])

  // 10-year window ending at the current year — enough for normal review,
  // small enough to fit comfortably in the dropdown.
  const yearOptions = useMemo(() => {
    const current = dayjs().year()
    return Array.from({ length: 10 }, (_, i) => current - 9 + i).reverse()
  }, [])

  const [data, setData] = useState<ChartPoint[]>([])
  const [total, setTotal] = useState(0)
  const [invoiceCount, setInvoiceCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)

  // Guards against an out-of-order response overwriting newer data — now
  // that `load` can be triggered from two independent places (the date-range
  // effect below, and useBranchRefresh's event listener), a slow request from
  // a since-superseded call could otherwise land after a faster, newer one.
  const requestIdRef = useRef(0)

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current
    setIsLoading(true)
    try {
      const res = await api.get('/reports/sales/range', {
        params: { from: resolved.from, to: resolved.to, bucket },
      })
      if (requestId !== requestIdRef.current) return
      const chartData = (res.data?.chartData ?? []) as ChartPoint[]
      setData(chartData)
      setTotal(Number(res.data?.total ?? 0))
      setInvoiceCount(Number(res.data?.invoiceCount ?? 0))
    } catch {
      if (requestId !== requestIdRef.current) return
      setData([])
      setTotal(0)
      setInvoiceCount(0)
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved.from, resolved.to, bucket])

  useEffect(() => { void load() }, [load])

  // The branch-scoped chart figures don't move when only the date range
  // changes, but they also don't refetch on branch switch — the effect
  // above is keyed on the date range alone. useBranchRefresh covers the
  // other axis (see DashboardPage's own KPI tiles, wired the same way).
  useBranchRefresh(load)

  const subtitle = (() => {
    if (range.preset === 'month') return `${resolved.label} · daily`
    if (range.preset === '6m') return `${resolved.label} · monthly`
    return `${resolved.label} · monthly`
  })()

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Sales overview</CardTitle>
            <CardDescription>{subtitle}</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Year preset only varies by year; hide the month selector then. */}
            {range.preset !== 'year' && (
              <Select
                value={String(anchor.month())}
                onValueChange={(v) => setAnchor(anchor.month(Number(v)).format('YYYY-MM-DD'))}
              >
                <SelectTrigger className="h-8 w-22 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTH_OPTIONS.map((m) => (
                    <SelectItem key={m.value} value={String(m.value)}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select
              value={String(anchor.year())}
              onValueChange={(v) => setAnchor(anchor.year(Number(v)).format('YYYY-MM-DD'))}
            >
              <SelectTrigger className="h-8 w-20 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <RangeTabs active={range.preset} onChange={setPreset} />
            <div className="text-right">
              <div className="text-2xl font-bold tracking-tight">{formatCurrencyCompact(total)}</div>
              <div className="text-[11px] text-muted-foreground">{invoiceCount} invoices</div>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-55 sm:h-65 lg:h-70 w-full" />
        ) : data.length === 0 ? (
          <EmptyState />
        ) : (
          <div ref={chartRef} className="h-55 sm:h-65 lg:h-70">
          {chartSize.width > 0 && (
            <AreaChart width={chartSize.width} height={chartSize.height} data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="hero-area" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={20}
              />
              <YAxis
                tick={{ fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={50}
                tickFormatter={(v: number) => formatCurrencyCompact(v).replace('₹', '')}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--popover) / 0.95)',
                  border: '1px solid hsl(var(--border) / 0.6)',
                  borderRadius: '10px',
                  fontSize: '12px',
                  backdropFilter: 'blur(8px)',
                }}
                formatter={(value: unknown) => [formatCurrencyCompact(Number(value)), 'Sales']}
              />
              <Area
                type="monotone"
                dataKey="amount"
                stroke="#3b82f6"
                strokeWidth={2}
                fill="url(#hero-area)"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, fill: '#fff' }}
              />
            </AreaChart>
          )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function RangeTabs({
  active,
  onChange,
}: {
  active: DateRangePreset
  onChange: (preset: DateRangePreset) => void
}) {
  return (
    <div className="inline-flex rounded-lg border border-border/60 bg-muted/30 p-0.5">
      {PRESETS.map((p) => (
        <button
          key={p.value}
          type="button"
          onClick={() => onChange(p.value)}
          className={cn(
            'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
            active === p.value
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {p.label}
        </button>
      ))}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex h-65 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
      <p className="text-sm">No sales in this period.</p>
    </div>
  )
}
