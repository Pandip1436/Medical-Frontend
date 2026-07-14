import { useEffect, useState, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'
import { Truck, Search, PackageSearch, ChevronRight, Phone, MapPin, RefreshCw, Loader2, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { PageHeader } from '@/components/shared/PageHeader'
import { DateRangeFilter, type DateRangeValue } from '@/components/shared/DateRangeFilter'
import { DeliveryStatusFilter } from '@/components/shared/DeliveryStatusFilter'
import { DeliveryCourierFilter } from '@/components/shared/DeliveryCourierFilter'
import { Skeleton } from '@/components/ui/skeleton'
import api from '@/lib/api'
import { cn, formatDate } from '@/lib/utils'
import { navigate } from '@/lib/router'
import { useBranchRefresh } from '@/hooks/useBranchRefresh'
import { usePageFilter } from '@/hooks/usePageFilter'
import { displayDeliveryStatus } from '@/lib/courierOcr'
import type { DeliveryTracking, DeliveryStatus } from '@/types'

// How many shipments to pull per request — the list pages in as the user
// scrolls instead of fetching everything up front.
const PAGE_SIZE = 10

export default function DeliveriesPage() {
  const [items, setItems] = useState<DeliveryTracking[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [q, setQ] = usePageFilter<string>('delivery.list', 'q', '')
  const [status, setStatus] = usePageFilter<DeliveryStatus | 'ALL'>('delivery.list', 'status', 'ALL')
  const [courier, setCourier] = usePageFilter<string>('delivery.list', 'courier', 'ALL')
  const [dateRange, setDateRange] = usePageFilter<DateRangeValue>('delivery.list', 'dateRange', { preset: 'all' })
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({})
  const [courierCounts, setCourierCounts] = useState<Record<string, number>>({})

  // Guards the infinite-scroll observer against firing a second fetch while one
  // is already in flight (a ref so the observer reads it synchronously).
  const loadingMoreRef = useRef(false)
  const sentinelRef = useRef<HTMLDivElement>(null)

  // Fetch a single page. `skip` drives pagination; counts come back on every
  // page so the headline chips stay fresh.
  const fetchPage = useCallback(
    (skip: number) =>
      api.get('/delivery', {
        params: {
          q: q || undefined,
          status: status === 'ALL' ? undefined : status,
          courier: courier === 'ALL' ? undefined : courier,
          from: dateRange.from,
          to: dateRange.to,
          skip,
          take: PAGE_SIZE,
        },
      }),
    [q, status, courier, dateRange],
  )

  // Reset load — first page. Used on mount, filter change and branch refresh.
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchPage(0)
      setItems(res.data.items ?? [])
      setTotal(res.data.total ?? 0)
      setStatusCounts(res.data.statusCounts ?? {})
      setCourierCounts(res.data.courierCounts ?? {})
    } catch {
      setItems([])
      setTotal(0)
      setStatusCounts({})
      setCourierCounts({})
    } finally {
      setLoading(false)
    }
  }, [fetchPage])

  // Append the next page as the user scrolls toward the bottom.
  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current) return
    loadingMoreRef.current = true
    setLoadingMore(true)
    try {
      const res = await fetchPage(items.length)
      setItems((prev) => [...prev, ...(res.data.items ?? [])])
      setTotal(res.data.total ?? 0)
      setStatusCounts(res.data.statusCounts ?? {})
      setCourierCounts(res.data.courierCounts ?? {})
    } catch {
      /* keep what we have; the sentinel will retry on the next scroll */
    } finally {
      loadingMoreRef.current = false
      setLoadingMore(false)
    }
  }, [fetchPage, items.length])

  const hasMore = items.length < total

  // Debounce search; reload on filter / branch change.
  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0)
    return () => clearTimeout(t)
  }, [load, q])
  useBranchRefresh(load)

  // Infinite scroll — load the next page when the sentinel scrolls into view.
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || loading || !hasMore) return
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore()
      },
      { rootMargin: '300px' },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [loadMore, loading, hasMore])

  // Bulk "Check All" — refresh every active shipment's tracking in one click.
  const [checkingAll, setCheckingAll] = useState(false)
  const handleCheckAll = async () => {
    setCheckingAll(true)
    try {
      // Only sync the shipments matching the active filters (search / status /
      // courier / date) — so "Check All" respects what the user is looking at.
      // Body is `undefined` (not null): axios's default JSON content-type would
      // serialize null → the string "null", which Express's strict JSON parser
      // rejects ("… 'null' is not valid JSON"). The filters ride as query params.
      const res = await api.post('/delivery/check-all', undefined, {
        params: {
          q: q || undefined,
          status: status === 'ALL' ? undefined : status,
          courier: courier === 'ALL' ? undefined : courier,
          from: dateRange.from,
          to: dateRange.to,
        },
      })
      const d = res.data ?? {}
      if (d.liveIntegration === false) {
        toast.info('Live courier sync isn’t connected — set TRACKINGMORE_API_KEY and restart the backend.')
      } else if (d.total === 0) {
        toast.info('No active shipments with a tracking ID to check.')
      } else if (d.totalNewCheckpoints > 0) {
        toast.success(`Checked ${d.checked} shipment${d.checked === 1 ? '' : 's'} · ${d.totalNewCheckpoints} new update${d.totalNewCheckpoints === 1 ? '' : 's'} across ${d.updated}`)
      } else {
        toast.success(`Checked ${d.checked} shipment${d.checked === 1 ? '' : 's'} — all up to date`)
      }
      if (d.failed > 0) toast.warning(`${d.failed} shipment${d.failed === 1 ? '' : 's'} couldn’t be fetched.`)
      await load()
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Failed to check shipments')
    } finally {
      setCheckingAll(false)
    }
  }

  // Headline counts for the summary chips — from the server-side per-status
  // counts so they're accurate regardless of the active status filter.
  const inTransit =
    (statusCounts.DISPATCHED ?? 0) +
    (statusCounts.IN_TRANSIT ?? 0) +
    (statusCounts.ARRIVED_AT_HUB ?? 0) +
    (statusCounts.OUT_FOR_DELIVERY ?? 0)
  const booked = statusCounts.BOOKED ?? 0
  const delivered = statusCounts.DELIVERED ?? 0
  const totalCount = statusCounts.ALL ?? total

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
      <PageHeader title="Delivery Tracking" description="Courier shipments dispatched from invoices." className="!flex-col !items-stretch sm:!flex-row sm:!items-end">
        <div className="flex w-full flex-wrap items-center gap-1.5 text-xs sm:w-auto sm:gap-2">
          <Stat label="Total" value={totalCount} className="bg-muted text-foreground"
            onClick={() => setStatus('ALL')} active={status === 'ALL'} />
          <Stat label="Booked" value={booked} className="bg-blue-500/10 text-blue-600 dark:text-blue-400"
            onClick={() => setStatus(status === 'BOOKED' ? 'ALL' : 'BOOKED')} active={status === 'BOOKED'} />
          <Stat label="In Transit" value={inTransit} className="bg-violet-500/10 text-violet-600 dark:text-violet-400"
            onClick={() => setStatus(status === 'IN_TRANSIT' ? 'ALL' : 'IN_TRANSIT')} active={status === 'IN_TRANSIT'} />
          <Stat label="Delivered" value={delivered} className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            onClick={() => setStatus(status === 'DELIVERED' ? 'ALL' : 'DELIVERED')} active={status === 'DELIVERED'} />
          <Button size="sm" onClick={handleCheckAll} disabled={checkingAll} className="ml-auto w-full gap-1.5 sm:ml-1 sm:w-auto">
            {checkingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {checkingAll ? 'Checking…' : 'Check All Tracking'}
          </Button>
        </div>
      </PageHeader>

      {/* Filters */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search invoice, customer, tracking ID, courier…"
            className="pl-9"
          />
        </div>
        <DeliveryCourierFilter value={courier} onChange={setCourier} counts={courierCounts} className="sm:w-48" />
        <DeliveryStatusFilter value={status} onChange={setStatus} counts={statusCounts} className="sm:w-48" />
        <DateRangeFilter value={dateRange} onChange={setDateRange} className="sm:w-52" />
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/60">
              <PackageSearch className="h-5 w-5 text-muted-foreground/50" />
            </div>
            <div>
              <p className="text-sm font-medium">No deliveries yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Enable the Courier toggle on an invoice to start tracking.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((d, idx) => (
            <motion.div
              key={d.id}
              role="button"
              tabIndex={0}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(idx * 0.03, 0.3) }}
              onClick={() => navigate(`/delivery/tracking?id=${d.id}`)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/delivery/tracking?id=${d.id}`) } }}
              className="group flex w-full cursor-pointer items-center gap-3 rounded-xl border border-border/60 bg-card p-3 text-left transition hover:border-primary/40 hover:shadow-sm sm:gap-4 sm:p-4"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary sm:h-11 sm:w-11">
                <Truck className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1 overflow-hidden">
                {/* Customer name + status first */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 max-w-full truncate text-sm font-semibold">{d.customerName}</span>
                  <StatusBadge status={displayDeliveryStatus(d.status)} />
                </div>
                {/* Delivery address second */}
                {d.deliveryAddress && (
                  <p className="mt-0.5 flex min-w-0 items-center gap-1 text-sm text-muted-foreground">
                    <MapPin className="h-3 w-3 shrink-0" /> <span className="min-w-0 flex-1 truncate">{d.deliveryAddress}</span>
                  </p>
                )}
                {/* Invoice id + courier / tracking / mobile */}
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground/80">
                  <button
                    onClick={(e) => { e.stopPropagation(); navigate(`/billing/sales?view=split&invoiceId=${d.invoiceId}`) }}
                    className="inline-flex shrink-0 items-center gap-1 font-mono font-semibold text-foreground hover:text-primary hover:underline"
                    title="Open invoice"
                  >
                    {d.invoiceNumber}
                    <ExternalLink className="h-3 w-3 opacity-0 transition group-hover:opacity-60" />
                  </button>
                  {d.courierName && <span className="inline-flex min-w-0 items-center gap-1"><Truck className="h-3 w-3 shrink-0" /><span className="truncate max-w-[10rem]">{d.courierName}</span></span>}
                  {d.trackingId && <span className="font-mono break-all">#{d.trackingId}</span>}
                  {d.mobileNumber && <span className="inline-flex shrink-0 items-center gap-1"><Phone className="h-3 w-3" />{d.mobileNumber}</span>}
                  {/* Booked date — the side column is hidden on mobile, so surface it here. */}
                  <span className="inline-flex shrink-0 items-center gap-1 sm:hidden">Booked {formatDate(d.createdAt)}</span>
                </div>
              </div>
              <div className="hidden shrink-0 text-right text-xs text-muted-foreground sm:block">
                <p>Booked</p>
                <p className="font-medium text-foreground">{formatDate(d.createdAt)}</p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition group-hover:translate-x-0.5 group-hover:text-primary" />
            </motion.div>
          ))}

          {/* Infinite-scroll sentinel + status footer */}
          <div ref={sentinelRef} />
          {loadingMore && (
            <div className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading more…
            </div>
          )}
          {!hasMore && items.length > 0 && (
            <p className="py-4 text-center text-xs text-muted-foreground/70">
              All {total} {total === 1 ? 'shipment' : 'shipments'} loaded
            </p>
          )}
        </div>
      )}
    </motion.div>
  )
}

function Stat({
  label,
  value,
  className,
  onClick,
  active,
}: {
  label: string
  value: number
  className?: string
  onClick?: () => void
  active?: boolean
}) {
  const base = cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-medium', className)
  const content = (
    <>
      {value} <span className="opacity-70">{label}</span>
    </>
  )
  if (!onClick) return <span className={base}>{content}</span>
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={active ? `Clear ${label} filter` : `Filter by ${label}`}
      className={cn(
        base,
        'cursor-pointer transition hover:brightness-95 dark:hover:brightness-110',
        active
          ? 'ring-2 ring-current ring-offset-1 ring-offset-background'
          : 'opacity-80 hover:opacity-100',
      )}
    >
      {content}
    </button>
  )
}
