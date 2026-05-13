import { useEffect, useState } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import dayjs from 'dayjs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import api from '@/lib/api'
import { cn, formatCurrencyCompact } from '@/lib/utils'
import { useDateRange } from './useDateRange'
import type { DateRangePreset } from './types'

const PRESETS: Array<{ value: DateRangePreset; label: string }> = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
]

interface ChartPoint {
  label: string
  amount: number
}

function bucketForPreset(preset: DateRangePreset): 'day' | 'month' {
  // Year view shows monthly totals; week/month show daily buckets.
  return preset === 'year' ? 'month' : 'day'
}

export function SalesHeroChart() {
  const { resolved, range, setPreset } = useDateRange()
  const bucket = bucketForPreset(range.preset)

  const [data, setData] = useState<ChartPoint[]>([])
  const [total, setTotal] = useState(0)
  const [invoiceCount, setInvoiceCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setIsLoading(true)
      try {
        const res = await api.get('/reports/sales/range', {
          params: { from: resolved.from, to: resolved.to, bucket },
        })
        if (cancelled) return
        const chartData = (res.data?.chartData ?? []) as ChartPoint[]
        setData(chartData)
        setTotal(Number(res.data?.total ?? 0))
        setInvoiceCount(Number(res.data?.invoiceCount ?? 0))
      } catch {
        if (!cancelled) {
          setData([])
          setTotal(0)
          setInvoiceCount(0)
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [resolved.from, resolved.to, bucket])

  const subtitle = (() => {
    if (range.preset === 'week') return 'Last 7 days · daily'
    if (range.preset === 'month') return `${dayjs(resolved.from).format('MMM YYYY')} · daily`
    return `${dayjs(resolved.from).format('YYYY')} · monthly`
  })()

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Sales overview</CardTitle>
            <CardDescription>{subtitle}</CardDescription>
          </div>
          <div className="flex items-center gap-3">
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
          <Skeleton className="h-[260px] w-full" />
        ) : data.length === 0 ? (
          <EmptyState />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="hero-area" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
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
          </ResponsiveContainer>
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
    <div className="flex h-[260px] flex-col items-center justify-center gap-2 text-center text-muted-foreground">
      <p className="text-sm">No sales in this period.</p>
    </div>
  )
}
