import { useState, useMemo, useEffect, useRef } from 'react'
import dayjs from 'dayjs'
import api from '@/lib/api'
import { useBranchRefresh } from '@/hooks/useBranchRefresh'
import { usePaginatedSearch } from '@/hooks/usePaginatedSearch'
import { DataTableFilterBar } from '@/components/shared/DataTableFilterBar'
import { EmptyState } from '@/components/shared/EmptyState'
import { KpiTile } from '@/components/dashboard/KpiTile'
import type { KpiTileData, KpiDelta } from '@/components/dashboard/types'
import { motion } from 'framer-motion'
import {
  Search,
  BookOpen,
  ArrowUpRight,
  ArrowDownLeft,
  Wallet,
  Receipt,
  Check,
  X,
  ArrowUpDown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Rows3,
  LineChart as LineChartIcon,
  Phone,
  RefreshCw,
  Users,
  TrendingUp,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Card,
  CardContent,
} from '@/components/ui/card'
import { ExportMenu } from '@/components/shared/ExportMenu'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SkeletonCard, SkeletonTable } from '@/components/ui/skeleton'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { Customer, Supplier } from '@/types'
import { cn, formatCurrency, formatCurrencyCompact, formatDate, formatLedgerBalance, ledgerBalanceSuffix, LEDGER_COL_BILLED, LEDGER_COL_PAID } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface LedgerEntry {
  date: string
  particular: string
  debit: number
  credit: number
  // Refund / replacement returns are shown for visibility but must NOT move the
  // running balance, totals, or trend — they're cash/goods-neutral to the party.
  neutral?: boolean
}

type Period = 'year' | 'month'

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// ─────────────────────────────────────────────────────────────
// Date helpers
// ─────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0')
const isoDate = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

function periodToRange(period: Period, year: number, monthIdx: number): { from: string; to: string } {
  if (period === 'year') {
    return {
      from: dayjs().year(year).startOf('year').format('YYYY-MM-DD'),
      to: dayjs().year(year).endOf('year').format('YYYY-MM-DD'),
    }
  }
  const m = dayjs().year(year).month(monthIdx)
  return {
    from: m.startOf('month').format('YYYY-MM-DD'),
    to: m.endOf('month').format('YYYY-MM-DD'),
  }
}

function periodDisplay(period: Period, year: number, monthIdx: number): string {
  if (period === 'year') return `Year ${year}`
  return `${MONTH_NAMES[monthIdx]} ${year}`
}

const addDaysISO = (iso: string, n: number): string => {
  const d = new Date(iso)
  d.setDate(d.getDate() + n)
  return isoDate(d)
}
const daysBetweenISO = (a: string, b: string): number =>
  Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000)

// ─────────────────────────────────────────────────────────────
// Aggregations
// ─────────────────────────────────────────────────────────────

function sumInWindow(entries: LedgerEntry[], from: string, to: string) {
  let debit = 0
  let credit = 0
  let count = 0
  for (const e of entries) {
    if (from && e.date < from) continue
    if (to && e.date > to) continue
    count++
    // Neutral rows (refund/replacement returns) are counted as transactions but
    // excluded from the debit/credit totals so the net reconciles with balance.
    if (e.neutral) continue
    debit += e.debit
    credit += e.credit
  }
  return { debit, credit, net: debit - credit, count }
}

function dirFor(curr: number, prev: number): KpiDelta {
  if (prev === 0) return { pct: 0, dir: curr === 0 ? 'flat' : 'up' }
  const pct = ((curr - prev) / Math.abs(prev)) * 100
  return { pct, dir: curr > prev ? 'up' : curr < prev ? 'down' : 'flat' }
}

interface DayPoint { date: string; balance: number; debit: number; credit: number }

function buildDailySeries(entries: LedgerEntry[], from: string, to: string): DayPoint[] {
  if (!from || !to) return []
  // The API may return `date` as a full ISO timestamp (e.g. "2026-05-15T08:30:00.000Z").
  // String compares against YYYY-MM-DD work fine for ordering, but Map keys require
  // exact equality with the day-walk's YYYY-MM-DD output — so normalize once here.
  const dayOf = (d: string) => d.slice(0, 10)

  let bal = 0
  for (const e of entries) if (dayOf(e.date) < from && !e.neutral) bal += e.debit - e.credit

  const dayMap = new Map<string, { debit: number; credit: number }>()
  for (const e of entries) {
    const ed = dayOf(e.date)
    if (ed < from || ed > to) continue
    // Neutral rows don't contribute to the trend's debit/credit/balance.
    if (e.neutral) continue
    const cur = dayMap.get(ed) ?? { debit: 0, credit: 0 }
    cur.debit += e.debit
    cur.credit += e.credit
    dayMap.set(ed, cur)
  }

  const out: DayPoint[] = []
  const start = new Date(from)
  const end = new Date(to)
  // Cap at ~370 days to keep render cost bounded if someone picks a huge custom range.
  let safety = 400
  for (const d = new Date(start); d <= end && safety-- > 0; d.setDate(d.getDate() + 1)) {
    const iso = isoDate(d)
    const day = dayMap.get(iso) ?? { debit: 0, credit: 0 }
    bal += day.debit - day.credit
    out.push({ date: iso, balance: bal, debit: day.debit, credit: day.credit })
  }
  return out
}

function downsample<T>(arr: T[], maxPoints: number): T[] {
  if (arr.length <= maxPoints) return arr
  const step = arr.length / maxPoints
  const out: T[] = []
  for (let i = 0; i < maxPoints; i++) out.push(arr[Math.floor(i * step)])
  out[out.length - 1] = arr[arr.length - 1]
  return out
}

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .join('') || '?'

// Wraps the matched substring of `text` in a <mark> so a search hit reads
// clearly even though the row itself is no longer filtered out of view.
function highlightMatch(text: string, query: string) {
  const idx = text.toLowerCase().indexOf(query)
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded-sm bg-amber-300/70 px-0.5 text-inherit dark:bg-amber-500/50">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  )
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export default function LedgerPage() {
  const [partyType, setPartyType] = useState<'customer' | 'supplier'>('customer')
  const [selectedPartyId, setSelectedPartyId] = useState<string>('')
  const [partySearch, setPartySearch] = useState('')
  const [ledgerSearch, setLedgerSearch] = useState('')
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('oldest')

  const [selectedPeriod, setSelectedPeriod] = useState<Period>('month')
  const [selectedYear, setSelectedYear] = useState(() => dayjs().year())
  const [selectedMonthIdx, setSelectedMonthIdx] = useState(() => dayjs().month())
  const [yearPopoverOpen, setYearPopoverOpen] = useState(false)
  const [monthPopoverOpen, setMonthPopoverOpen] = useState(false)

  const { from: dateFrom, to: dateTo } = useMemo(
    () => periodToRange(selectedPeriod, selectedYear, selectedMonthIdx),
    [selectedPeriod, selectedYear, selectedMonthIdx],
  )

  const [activeTab, setActiveTab] = useState<'ledger' | 'trend'>('ledger')
  const [isLoading, setIsLoading] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  // Which tab is active INSIDE the picker. Independent of `partyType` (which
  // tracks the currently-selected party's type — they happen to align after a pick).
  const [pickerType, setPickerType] = useState<'customer' | 'supplier'>('customer')
  const [hasMoreBelow, setHasMoreBelow] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  // First-match row/card — searching no longer filters the list (see below),
  // so with 100+ rows the hit can be scrolled well out of view; these let us
  // jump straight to it instead of making the user hunt for the highlight.
  const firstMatchRowRef = useRef<HTMLTableRowElement>(null)
  const firstMatchCardRef = useRef<HTMLDivElement>(null)

  const [allLedgerEntries, setAllLedgerEntries] = useState<LedgerEntry[]>([])
  // Captured at pick-time from the paginated search response, or fetched on
  // first render when only an id is known (e.g. ?customerId= deep-link).
  const [selectedPartyDetail, setSelectedPartyDetail] = useState<Customer | Supplier | null>(null)

  // Force the ledger fetch effect to re-run on branch change so the table
  // reflects the new branch's data without the user having to re-pick the party.
  useBranchRefresh(() => {
    setSelectedPartyDetail(null)
    setRefreshKey((k) => k + 1)
  })

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const cid = params.get('customerId')
    if (cid) {
      setPartyType('customer')
      setSelectedPartyId(cid)
    }
  }, [])

  // ── Paginated party search (one hook per type — switching tabs flips which is enabled) ──
  // Enabled when the popover is open OR when the no-party hero state is shown
  // (in which case the picker renders inline and should fetch immediately).
  const pickerEnabled = pickerOpen || !selectedPartyId
  const customerResults = usePaginatedSearch<Customer>({
    endpoint: '/customers',
    pageSize: 20,
    enabled: pickerEnabled && pickerType === 'customer',
  })
  const supplierResults = usePaginatedSearch<Supplier>({
    endpoint: '/suppliers',
    pageSize: 20,
    enabled: pickerEnabled && pickerType === 'supplier',
  })

  useEffect(() => {
    customerResults.setQuery(partySearch)
    supplierResults.setQuery(partySearch)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partySearch])

  // When the popover opens with an existing selection, default the picker tab to that party's type.
  useEffect(() => {
    if (pickerOpen && selectedPartyId) setPickerType(partyType)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickerOpen])

  const activeResults = pickerType === 'customer' ? customerResults : supplierResults

  const selectedParty = useMemo(() => {
    if (!selectedPartyId || !selectedPartyDetail) return null
    return { id: selectedPartyDetail.id, name: selectedPartyDetail.name, type: partyType }
  }, [selectedPartyId, selectedPartyDetail, partyType])

  // Fetch the selected party's full record by id when we don't already have it
  // (e.g. arrived via ?customerId= deep-link, or after a branch switch).
  const fetchedDetailFor = useRef<string | null>(null)
  useEffect(() => {
    if (!selectedPartyId) {
      setSelectedPartyDetail(null)
      fetchedDetailFor.current = null
      return
    }
    if (selectedPartyDetail && (selectedPartyDetail as any).id === selectedPartyId) return
    if (fetchedDetailFor.current === selectedPartyId) return
    fetchedDetailFor.current = selectedPartyId

    const endpoint = partyType === 'customer'
      ? `/customers/${selectedPartyId}`
      : `/suppliers/${selectedPartyId}`
    let cancelled = false
    api.get(endpoint)
      .then((res) => { if (!cancelled) setSelectedPartyDetail(res.data) })
      .catch(() => { /* leave detail null; ledger still loads by id */ })
    return () => { cancelled = true }
  }, [selectedPartyId, partyType, selectedPartyDetail])

  useEffect(() => {
    if (!selectedPartyId) {
      setAllLedgerEntries([])
      setIsLoading(false)
      return
    }

    const endpoint = partyType === 'customer'
      ? `/reports/financial/ledger/${selectedPartyId}`
      : `/reports/financial/supplier-ledger/${selectedPartyId}`

    let cancelled = false
    setIsLoading(true)
    api
      .get(endpoint, { params: { from: '1900-01-01', to: '2099-12-31' } })
      .then((res) => {
        if (cancelled) return
        const rows = res.data?.tableData ?? []
        setAllLedgerEntries(
          rows.map((r: any) => ({
            date: r.date,
            particular: `${r.description} (${r.ref})`,
            debit: Number(r.debit),
            credit: Number(r.credit),
            neutral: !!r.neutral,
          })),
        )
      })
      .catch(() => { if (!cancelled) setAllLedgerEntries([]) })
      .finally(() => { if (!cancelled) setIsLoading(false) })

    return () => { cancelled = true }
  }, [selectedPartyId, partyType, refreshKey])

  // Apply date filter, compute opening/closing balance, then apply search + sort.
  // Balances are always computed chronologically; sort order only affects display.
  const ledgerData = useMemo(() => {
    const sorted = [...allLedgerEntries].sort((a, b) => a.date.localeCompare(b.date))

    let openingBal = 0
    if (dateFrom) {
      for (const e of sorted) {
        if (e.date < dateFrom) { if (!e.neutral) openingBal += e.debit - e.credit }
        else break
      }
    }

    const inRange = sorted.filter((e) => {
      if (dateFrom && e.date < dateFrom) return false
      if (dateTo && e.date > dateTo) return false
      return true
    })

    let bal = openingBal
    const withBal = inRange.map((e) => {
      // Neutral rows (refund/replacement returns) display their amount but don't
      // move the running balance.
      if (!e.neutral) bal += e.debit - e.credit
      return { ...e, balance: bal }
    })
    const closingBal = withBal.length > 0 ? withBal[withBal.length - 1].balance : openingBal

    // Search no longer hides non-matching rows — the full ledger stays
    // visible (losing surrounding context made it hard to see a search hit
    // in relation to the transactions around it); matches are highlighted
    // in the render instead, and matchCount drives the "N found" badge.
    let displayed = withBal
    const q = ledgerSearch.trim().toLowerCase()
    const matchCount = q ? withBal.filter((e) => e.particular.toLowerCase().includes(q)).length : withBal.length
    if (sortOrder === 'newest') {
      displayed = [...displayed].reverse()
    }

    return {
      openingBalance: openingBal,
      closingBalance: closingBal,
      entries: displayed,
      inRangeCount: inRange.length,
      matchCount,
    }
  }, [allLedgerEntries, dateFrom, dateTo, ledgerSearch, sortOrder])

  const { openingBalance, closingBalance } = ledgerData
  const ledgerWithBalance = ledgerData.entries
  const ledgerSearchQuery = ledgerSearch.trim().toLowerCase()

  // Summary stats reflect the date-range window (search filter excluded so totals stay stable)
  const summary = useMemo(() => {
    const s = sumInWindow(allLedgerEntries, dateFrom, dateTo)
    return {
      totalDebit: s.debit,
      totalCredit: s.credit,
      netBalance: closingBalance,
      txnCount: ledgerData.inRangeCount,
    }
  }, [allLedgerEntries, dateFrom, dateTo, closingBalance, ledgerData.inRangeCount])

  // Deltas vs prior equivalent-length window (ending the day before dateFrom).
  const deltas = useMemo(() => {
    if (!dateFrom || !dateTo) return null
    const lenDays = daysBetweenISO(dateFrom, dateTo) + 1
    const priorTo = addDaysISO(dateFrom, -1)
    const priorFrom = addDaysISO(priorTo, -(lenDays - 1))
    const prev = sumInWindow(allLedgerEntries, priorFrom, priorTo)
    return {
      debit: dirFor(summary.totalDebit, prev.debit),
      credit: dirFor(summary.totalCredit, prev.credit),
      net: dirFor(summary.netBalance, prev.net),
      txn: dirFor(summary.txnCount, prev.count),
    }
  }, [allLedgerEntries, dateFrom, dateTo, summary])

  // Full-resolution series for the Trend tab; downsampled copy for the Net sparkline.
  const dailySeries = useMemo(
    () => buildDailySeries(allLedgerEntries, dateFrom, dateTo),
    [allLedgerEntries, dateFrom, dateTo],
  )
  // Sparkline plots the absolute outstanding amount, so the line always reads
  // as "up = outstanding grew" regardless of Dr/Cr side. Side direction is
  // conveyed elsewhere (KPI subtitle, big chart's color and chip).
  const netSparkline = useMemo(() => {
    if (dailySeries.length < 2) return undefined
    return downsample(dailySeries.map((d) => Math.abs(d.balance)), 30)
  }, [dailySeries])

  const periodLabel = useMemo(
    () => periodDisplay(selectedPeriod, selectedYear, selectedMonthIdx),
    [selectedPeriod, selectedYear, selectedMonthIdx],
  )

  const activeFilterCount = sortOrder !== 'oldest' ? 1 : 0

  const ledgerExportRows = () => ledgerWithBalance.map((e) => ({
    Date: formatDate(e.date),
    Particular: e.particular,
    [LEDGER_COL_BILLED]: e.debit,
    [LEDGER_COL_PAID]: e.credit,
    Balance: e.balance,
  }))

  const selectedPartyName = selectedParty?.name ?? ''

  // Track whether the ledger scroll container has content below the fold
  // so we can show a "more below" chevron above the sticky closing row.
  // Depends on activeTab so we re-attach when the table remounts after switching tabs.
  useEffect(() => {
    if (activeTab !== 'ledger') return
    const el = scrollRef.current
    if (!el) return
    const update = () => {
      setHasMoreBelow(el.scrollHeight - el.scrollTop - el.clientHeight > 8)
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', update)
      ro.disconnect()
    }
  }, [ledgerWithBalance.length, selectedPartyId, activeTab])

  // Jump to the first search hit — with the list no longer filtered (see
  // renderLedgerCard), a match in a 100+ row ledger can render well outside
  // the current scroll position, so the highlight alone is easy to miss.
  // rAF-deferred so the ref is attached to the just-rendered row/card first.
  useEffect(() => {
    if (!ledgerSearchQuery) return
    const raf = requestAnimationFrame(() => {
      const target = firstMatchRowRef.current ?? firstMatchCardRef.current
      target?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    })
    return () => cancelAnimationFrame(raf)
  }, [ledgerSearchQuery, ledgerWithBalance])

  const resetToCurrentMonth = () => {
    setSelectedPeriod('month')
    setSelectedYear(dayjs().year())
    setSelectedMonthIdx(dayjs().month())
  }
  const handleClearFilters = () => {
    setSortOrder('oldest')
  }

  const handlePickParty = (p: Customer | Supplier, type: 'customer' | 'supplier') => {
    setPartyType(type)
    setSelectedPartyId(p.id)
    setSelectedPartyDetail(p)
    fetchedDetailFor.current = p.id
    setPartySearch('')
    setPickerOpen(false)
  }

  // ── Picker list — reused by the hero picker (no-party state) and the header "Change party" button.
  // Tabs at the top switch between server-paginated customer and supplier searches; only the
  // active tab fetches. Scrolling near the bottom loads the next page.
  const PartyPickerList = (
    <>
      <div className="grid grid-cols-2 gap-0.5 p-1 m-2 mb-0 rounded-md bg-muted">
        {(['customer', 'supplier'] as const).map((t) => {
          const isActive = pickerType === t
          const total = (t === 'customer' ? customerResults : supplierResults).total
          return (
            <button
              key={t}
              type="button"
              onClick={() => setPickerType(t)}
              className={cn(
                'h-7 rounded text-xs font-medium transition-colors',
                isActive
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t === 'customer' ? 'Customers' : 'Suppliers'}
              {total > 0 && (
                <span className="ml-1 text-[10px] opacity-60 tabular-nums">{total}</span>
              )}
            </button>
          )
        })}
      </div>
      <div className="p-2 border-b border-border/40">
        <Input
          autoFocus
          icon={<Search className="h-4 w-4" />}
          placeholder={`Search ${pickerType === 'customer' ? 'customers' : 'suppliers'}...`}
          value={partySearch}
          onChange={(e) => setPartySearch(e.target.value)}
          className="h-8"
        />
      </div>
      <div
        className="h-72 overflow-y-auto"
        onScroll={(e) => {
          const el = e.currentTarget
          if (el.scrollTop + el.clientHeight >= el.scrollHeight - 32) {
            activeResults.loadMore()
          }
        }}
      >
        {activeResults.loading && activeResults.items.length === 0 && (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">Loading…</p>
        )}
        {!activeResults.loading && activeResults.items.length === 0 && (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            {partySearch
              ? `No ${pickerType}s match "${partySearch}"`
              : `No ${pickerType}s found`}
          </p>
        )}
        {activeResults.items.map((p) => {
          const isSelected = selectedPartyId === p.id && partyType === pickerType
          const phone = (p as any).phone
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => handlePickParty(p, pickerType)}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-muted/50 transition-colors',
                isSelected && 'bg-muted/40',
              )}
            >
              <Badge
                variant={pickerType === 'customer' ? 'info' : 'purple'}
                size="sm"
                className="shrink-0"
              >
                {pickerType === 'customer' ? 'Cust' : 'Supp'}
              </Badge>
              <div className="min-w-0 flex-1">
                <p className="truncate">{p.name}</p>
                {phone && phone !== '0000000000' && (
                  <p className="text-[10px] text-muted-foreground tabular-nums truncate">{phone}</p>
                )}
              </div>
              {isSelected && <Check className="h-4 w-4 text-primary shrink-0" />}
            </button>
          )
        })}
        {activeResults.items.length > 0 && activeResults.loading && (
          <p className="px-3 py-2 text-center text-[10px] text-muted-foreground">Loading more…</p>
        )}
        {activeResults.items.length > 0
          && !activeResults.loading
          && !activeResults.hasMore && (
            <p className="px-3 py-2 text-center text-[10px] text-muted-foreground/60">
              {activeResults.total} {pickerType}
              {activeResults.total !== 1 ? 's' : ''}
            </p>
        )}
      </div>
      {selectedParty && (
        <div className="border-t border-border/40 p-1">
          <button
            type="button"
            onClick={() => {
              setSelectedPartyId('')
              setSelectedPartyDetail(null)
              setPartySearch('')
              setPickerOpen(false)
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/50 rounded-sm transition-colors"
          >
            <X className="h-3.5 w-3.5" />
            Clear selection
          </button>
        </div>
      )}
    </>
  )

  // ── KPI tile data (re-built each render — cheap)
  const kpis: KpiTileData[] = [
    {
      key: 'debit',
      title: 'Total Billed',
      value: summary.totalDebit,
      subtitle: periodLabel,
      icon: ArrowUpRight,
      iconBg: 'bg-rose-500/10',
      iconColor: 'text-rose-600 dark:text-rose-400',
      sparkColor: '#f43f5e',
      href: '#',
      delta: deltas?.debit,
    },
    {
      key: 'credit',
      title: 'Total Paid / Returned',
      value: summary.totalCredit,
      subtitle: periodLabel,
      icon: ArrowDownLeft,
      iconBg: 'bg-emerald-500/10',
      iconColor: 'text-emerald-600 dark:text-emerald-400',
      sparkColor: '#10b981',
      href: '#',
      delta: deltas?.credit,
    },
    {
      key: 'net',
      title: 'Closing Balance',
      value: Math.abs(summary.netBalance),
      subtitle:
        summary.netBalance > 0
          ? `${partyType === 'customer' ? 'Due' : 'Payable'} (end of period)`
          : summary.netBalance < 0
            ? 'Advance (end of period)'
            : 'Settled',
      icon: Wallet,
      iconBg:
        summary.netBalance > 0
          ? 'bg-rose-500/10'
          : summary.netBalance < 0
            ? 'bg-emerald-500/10'
            : 'bg-slate-500/10',
      iconColor:
        summary.netBalance > 0
          ? 'text-rose-600 dark:text-rose-400'
          : summary.netBalance < 0
            ? 'text-emerald-600 dark:text-emerald-400'
            : 'text-slate-600 dark:text-slate-400',
      sparkColor:
        summary.netBalance > 0 ? '#f43f5e' : summary.netBalance < 0 ? '#10b981' : '#64748b',
      href: '#',
      delta: deltas?.net,
      sparkline: netSparkline,
    },
    {
      key: 'txn',
      title: 'Transactions',
      value: summary.txnCount,
      subtitle: `of ${allLedgerEntries.length} total`,
      icon: Receipt,
      iconBg: 'bg-blue-500/10',
      iconColor: 'text-blue-600 dark:text-blue-400',
      sparkColor: '#3b82f6',
      href: '#',
      isCurrency: false,
      delta: deltas?.txn,
    },
  ]

  // ── Year / Month switcher (matches the ProfitLossPage pattern) ──
  const nowYear = dayjs().year()
  const nowMonth = dayjs().month()
  const cannotGoNextMonth = selectedYear === nowYear && selectedMonthIdx >= nowMonth
  const goPrevMonth = () => {
    if (selectedMonthIdx === 0) {
      setSelectedMonthIdx(11)
      setSelectedYear((y) => y - 1)
    } else {
      setSelectedMonthIdx((m) => m - 1)
    }
  }
  const goNextMonth = () => {
    if (cannotGoNextMonth) return
    if (selectedMonthIdx === 11) {
      setSelectedMonthIdx(0)
      setSelectedYear((y) => y + 1)
    } else {
      setSelectedMonthIdx((m) => m + 1)
    }
  }
  const yearOptions = Array.from({ length: 10 }, (_, i) => nowYear - i)

  const periodSwitcher = (
    <div className="flex flex-nowrap items-center gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {/* Year / Month toggle */}
      <div className="inline-flex shrink-0 rounded-md border border-border/60 overflow-hidden h-9">
        {(['year', 'month'] as Period[]).map((p) => (
          <button
            key={p}
            type="button"
            className={cn(
              'px-3 text-xs font-medium transition-colors',
              selectedPeriod === p
                ? 'bg-primary text-primary-foreground'
                : 'bg-background hover:bg-muted dark:hover:bg-muted/50',
            )}
            onClick={() => setSelectedPeriod(p)}
          >
            {p === 'year' ? 'Year' : 'Month'}
          </button>
        ))}
      </div>

      {/* Year picker — always visible */}
      <Popover open={yearPopoverOpen} onOpenChange={setYearPopoverOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-9 shrink-0 gap-1 px-2.5 font-medium min-w-16 sm:gap-1.5 sm:px-3 sm:min-w-20">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            {selectedYear}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-32 p-1" align="start">
          <div className="flex flex-col gap-0.5 max-h-60 overflow-y-auto">
            {yearOptions.map((y) => (
              <button
                key={y}
                type="button"
                onClick={() => { setSelectedYear(y); setYearPopoverOpen(false) }}
                className={cn(
                  'rounded px-2 py-1.5 text-sm text-left transition-colors hover:bg-muted',
                  selectedYear === y && 'bg-primary/10 text-primary font-medium',
                )}
              >
                {y}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {/* Month navigator — only when period === 'month' */}
      {selectedPeriod === 'month' && (
        <div className="flex shrink-0 items-center gap-1.5">
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={goPrevMonth} aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Popover open={monthPopoverOpen} onOpenChange={setMonthPopoverOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 shrink-0 px-2.5 font-medium min-w-14 sm:px-3 sm:min-w-20">
                {MONTH_NAMES[selectedMonthIdx]}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-2" align="start">
              <div className="grid grid-cols-3 gap-1">
                {MONTH_NAMES.map((name, idx) => {
                  const disabled = selectedYear === nowYear && idx > nowMonth
                  return (
                    <button
                      key={name}
                      type="button"
                      disabled={disabled}
                      onClick={() => { setSelectedMonthIdx(idx); setMonthPopoverOpen(false) }}
                      className={cn(
                        'rounded px-2 py-1.5 text-xs font-medium transition-colors',
                        selectedMonthIdx === idx
                          ? 'bg-primary text-primary-foreground'
                          : 'hover:bg-muted',
                        disabled && 'opacity-40 cursor-not-allowed hover:bg-transparent',
                      )}
                    >
                      {name}
                    </button>
                  )
                })}
              </div>
            </PopoverContent>
          </Popover>
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            onClick={goNextMonth}
            disabled={cannotGoNextMonth}
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  )

  // ── Export dropdown (single trigger replaces 3 buttons)
  const exportDropdown = (
    <ExportMenu
      title={`Party Ledger — ${selectedPartyName}`}
      filename={`ledger-${selectedPartyName}`}
      noun="entry"
      disabled={!ledgerWithBalance.length}
      rows={ledgerExportRows}
      className="w-full sm:w-auto"
    />
  )

  // ── No-party hero state — inline embedded picker, no popover ──
  if (!selectedPartyId) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      >
        <Card className="rounded-2xl border-border/60 overflow-hidden">
          <CardContent className="p-0">
            {/* Hero copy */}
            <div className="flex flex-col items-center text-center px-6 pt-10 pb-6">
              <div className="relative mb-4">
                <div className="absolute inset-0 -m-3 rounded-full bg-linear-to-br from-sky-500/15 to-purple-500/15 blur-2xl" />
                <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-linear-to-br from-sky-500/15 to-purple-500/15 ring-1 ring-border/40">
                  <Users className="h-7 w-7 text-sky-600 dark:text-sky-400" />
                </div>
              </div>
              <h2 className="text-lg font-semibold tracking-tight">
                Pick a customer or supplier
              </h2>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Browse a party's full ledger — running balance, debit/credit history, and exports.
              </p>
            </div>

            {/* Inline picker — no popover, results visible immediately */}
            <div className="mx-auto max-w-md px-6 pb-8">
              <div className="rounded-xl border border-border/60 bg-background overflow-hidden shadow-sm">
                {PartyPickerList}
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    )
  }

  // ── Party-selected layout
  const partyTypeLabel =
    selectedParty?.type === 'customer' ? 'Customer' : 'Supplier'
  const outstanding = (selectedPartyDetail as any)?.currentOutstanding ?? 0
  const creditLimit =
    selectedParty?.type === 'customer'
      ? ((selectedPartyDetail as Customer | null)?.creditLimit ?? 0)
      : 0
  const creditUsagePct =
    creditLimit > 0 ? Math.min(100, Math.max(0, (outstanding / creditLimit) * 100)) : 0
  const phone =
    (selectedPartyDetail as any)?.phone ?? ''
  const subMeta =
    selectedParty?.type === 'customer'
      ? (selectedPartyDetail as Customer | null)?.gstin
      : (selectedPartyDetail as Supplier | null)?.contactPerson

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="space-y-4"
    >
      {/* ── Year / Month switcher ── */}
      <div className="flex flex-wrap items-center gap-2">{periodSwitcher}</div>

      {/* ── Party Header Card ── */}
      <Card
        className={cn(
          'rounded-2xl border-l-[3px]',
          selectedParty?.type === 'customer' ? 'border-l-sky-500' : 'border-l-purple-500',
        )}
      >
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          {/* Avatar + identity */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div
              className={cn(
                'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-base font-semibold',
                selectedParty?.type === 'customer'
                  ? 'bg-linear-to-br from-sky-500/20 to-blue-500/20 text-sky-700 dark:text-sky-300'
                  : 'bg-linear-to-br from-purple-500/20 to-fuchsia-500/20 text-purple-700 dark:text-purple-300',
              )}
            >
              {initialsOf(selectedPartyName)}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-semibold tracking-tight truncate max-w-xs sm:max-w-md">
                  {selectedPartyName}
                </h2>
                <Badge
                  variant={selectedParty?.type === 'customer' ? 'info' : 'purple'}
                  size="sm"
                >
                  {partyTypeLabel}
                </Badge>
              </div>
              <div className="mt-0.5 flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                {phone && (
                  <span className="inline-flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {phone}
                  </span>
                )}
                {subMeta && (
                  <>
                    <span className="opacity-50">·</span>
                    <span className="truncate max-w-40 sm:max-w-xs">{subMeta}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Outstanding + credit usage + change party */}
          {/* responsive: full-width, top-aligned & spread on phones; inline centered at sm+ */}
          <div className="flex w-full items-start justify-between gap-4 sm:w-auto sm:items-center sm:justify-start sm:ml-auto">
            <div className="shrink-0 sm:text-right">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Outstanding
              </p>
              <p
                className={cn(
                  'text-base font-bold font-mono tabular-nums',
                  outstanding > 0
                    ? 'text-rose-600 dark:text-rose-400'
                    : outstanding < 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : '',
                )}
              >
                {formatLedgerBalance(outstanding, partyType)}
              </p>
              {selectedParty?.type === 'customer' && creditLimit > 0 && (
                <div className="mt-1.5 w-32">
                  <div className="h-1 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all',
                        creditUsagePct >= 90
                          ? 'bg-rose-500'
                          : creditUsagePct >= 70
                            ? 'bg-amber-500'
                            : 'bg-emerald-500',
                      )}
                      style={{ width: `${creditUsagePct}%` }}
                    />
                  </div>
                  <p className="mt-0.5 text-[10px] text-muted-foreground text-right">
                    {creditUsagePct.toFixed(0)}% of {formatCurrencyCompact(creditLimit)}
                  </p>
                </div>
              )}
            </div>

            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 shrink-0">
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Change</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-0" align="end">
                {PartyPickerList}
              </PopoverContent>
            </Popover>
          </div>
        </CardContent>
      </Card>

      {/* ── KPI Strip ── */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
          {kpis.map((kpi) => (
            <KpiTile key={kpi.key} kpi={kpi} />
          ))}
        </div>
      )}

      {/* ── Filter Bar ── */}
      <DataTableFilterBar
        searchQuery={ledgerSearch}
        onSearchChange={setLedgerSearch}
        searchPlaceholder="Search ledger particulars..."
        resultsCount={ledgerData.matchCount}
        activeFilterCount={activeFilterCount}
        onClearFilters={handleClearFilters}
        actionNode={exportDropdown}
        compactActionsRow
      >
        <div className="space-y-1.5">
          <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Sort Order
          </Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 w-full justify-start gap-2 font-normal"
            onClick={() => setSortOrder(sortOrder === 'oldest' ? 'newest' : 'oldest')}
          >
            <ArrowUpDown className="h-3.5 w-3.5 opacity-70" />
            <span className="text-xs">
              {sortOrder === 'oldest' ? 'Oldest first' : 'Newest first'}
            </span>
          </Button>
        </div>
      </DataTableFilterBar>

      {/* ── Tabs: Ledger | Trend ── */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'ledger' | 'trend')}>
        <TabsList className="grid w-full grid-cols-2 sm:w-auto sm:inline-flex">
          <TabsTrigger value="ledger" className="gap-1.5">
            <Rows3 className="h-3.5 w-3.5" />
            Ledger
          </TabsTrigger>
          <TabsTrigger value="trend" className="gap-1.5">
            <LineChartIcon className="h-3.5 w-3.5" />
            Trend
          </TabsTrigger>
        </TabsList>

        {/* ── Ledger Tab ── */}
        <TabsContent value="ledger" className="mt-3">
          {isLoading ? (
            <Card className="rounded-2xl border-border/60">
              <CardContent className="p-4">
                <SkeletonTable rows={8} cols={5} />
              </CardContent>
            </Card>
          ) : (
            renderLedgerCard()
          )}
        </TabsContent>

        {/* ── Trend Tab ── */}
        <TabsContent value="trend" className="mt-3">
          {isLoading ? (
            <Card className="rounded-2xl border-border/60">
              <CardContent className="p-4">
                <div className="h-72 sm:h-80 flex items-center justify-center">
                  <div className="h-full w-full animate-pulse rounded-lg bg-muted/40" />
                </div>
              </CardContent>
            </Card>
          ) : (
            renderTrendCard()
          )}
        </TabsContent>
      </Tabs>
    </motion.div>
  )

  // ─────────────────────────────────────────────────────────────
  // Ledger card (table + mobile list)
  // ─────────────────────────────────────────────────────────────
  function renderLedgerCard() {
    // Fixed header + fixed opening/closing balance rows, with ONLY the
    // transaction rows scrolling in between — each piece is its own <table>
    // (not position:sticky stacked inside one scrolling table, which was
    // fragile: stacking multiple sticky offsets — header at top-0, balance
    // row at top-10, another at bottom-0 — inside a single scroll container
    // is inconsistent across browsers and produced overlapping/ghosted rows).
    // A shared <colgroup> keeps columns aligned across the separate tables.
    const LEDGER_COL_WIDTHS = ['14%', '38%', '16%', '16%', '16%']
    const ledgerColGroup = (
      <colgroup>
        {LEDGER_COL_WIDTHS.map((w, i) => <col key={i} style={{ width: w }} />)}
      </colgroup>
    )

    // We swap WHICH balance row goes top vs bottom based on sort order so it
    // always reads naturally (oldest-first: opening above, closing below).
    const renderBalanceRow = (kind: 'opening' | 'closing', position: 'top' | 'bottom') => {
      const isOpening = kind === 'opening'
      const date = isOpening ? dateFrom : dateTo
      const label = isOpening ? 'Opening Balance' : 'Closing Balance'
      const balance = isOpening ? openingBalance : closingBalance
      const rowBorder = position === 'top' ? 'border-b-2 border-border/60' : 'border-t-2 border-border/60'
      const cellCls = 'px-3 py-2.5 text-sm bg-zinc-100 dark:bg-zinc-800'
      return (
        <tr key={kind} className={rowBorder}>
          <td className={cn(cellCls, 'font-semibold')}>{date ? formatDate(date) : '-'}</td>
          <td className={cn(cellCls, 'font-semibold')}>{label}</td>
          <td className={cn(cellCls, 'text-right font-mono')}>-</td>
          <td className={cn(cellCls, 'text-right font-mono')}>-</td>
          <td className={cn(
            cellCls,
            'text-right font-mono font-bold',
            balance > 0 ? 'text-rose-600 dark:text-rose-400'
              : balance < 0 ? 'text-emerald-600 dark:text-emerald-400' : ''
          )}>
            {formatLedgerBalance(balance, partyType)}
          </td>
        </tr>
      )
    }
    const topBalanceRow = sortOrder === 'oldest'
      ? renderBalanceRow('opening', 'top')
      : renderBalanceRow('closing', 'top')
    const bottomBalanceRow = sortOrder === 'oldest'
      ? renderBalanceRow('closing', 'bottom')
      : renderBalanceRow('opening', 'bottom')

    const isEmpty = ledgerWithBalance.length === 0
    const firstMatchIndex = ledgerSearchQuery
      ? ledgerWithBalance.findIndex((e) => e.particular.toLowerCase().includes(ledgerSearchQuery))
      : -1

    return (
      <Card className="rounded-2xl border-border/60 flex flex-col overflow-hidden">
        <CardContent className="p-0 flex flex-col min-h-0">
          {/* Mobile card list */}
          <div className="md:hidden max-h-[calc(100vh-28rem)] overflow-y-auto">
            {isEmpty ? (
              <EmptyState
                icon={BookOpen}
                title="No transactions in this period"
                description="Try widening the date range or pick a different party."
                actionLabel="Reset to This Month"
                onAction={resetToCurrentMonth}
              />
            ) : (
              <div className="divide-y divide-border/40">
                {ledgerWithBalance.map((entry, idx) => {
                  const isMatch = ledgerSearchQuery && entry.particular.toLowerCase().includes(ledgerSearchQuery)
                  return (
                  <div
                    key={idx}
                    ref={idx === firstMatchIndex ? firstMatchCardRef : undefined}
                    className={cn(
                      'flex items-start justify-between gap-2 px-4 py-3',
                      isMatch && 'bg-amber-50 dark:bg-amber-900/20',
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {isMatch ? highlightMatch(entry.particular, ledgerSearchQuery) : entry.particular}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{formatDate(entry.date)}</p>
                    </div>
                    <div className="text-right shrink-0">
                      {entry.debit > 0 && (
                        <p className="font-mono text-xs text-rose-600 dark:text-rose-400">Billed {formatCurrency(entry.debit)}</p>
                      )}
                      {entry.credit > 0 && (
                        <p className="font-mono text-xs text-emerald-600 dark:text-emerald-400">Paid {formatCurrency(entry.credit)}</p>
                      )}
                      <p className={cn('font-mono text-xs font-semibold', entry.balance > 0 ? 'text-rose-600 dark:text-rose-400' : entry.balance < 0 ? 'text-emerald-600 dark:text-emerald-400' : '')}>
                        Bal: {formatLedgerBalance(entry.balance, partyType)}
                      </p>
                    </div>
                  </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Desktop table — a fixed header, a fixed top-balance row, only
              the transaction rows scrolling, then a fixed bottom-balance
              row: four separate <table>s (a single table can't have some
              rows scroll and others stay put without position:sticky, which
              is what we're moving away from) sharing one <colgroup> so their
              columns stay aligned. Raw <table> throughout — shadcn's <Table>
              adds its own overflow-auto wrapper, which would fight ours. */}
          <div className="hidden md:flex md:flex-col relative">
            <table className="w-full table-fixed shrink-0 caption-bottom text-sm">
              {ledgerColGroup}
              <thead>
                <tr className="border-b border-border/60">
                  {[
                    { label: 'Date', align: 'text-left' },
                    { label: 'Particular', align: 'text-left' },
                    { label: LEDGER_COL_BILLED, align: 'text-right' },
                    { label: LEDGER_COL_PAID, align: 'text-right' },
                    { label: 'Running Balance', align: 'text-right' },
                  ].map((col) => (
                    <th
                      key={col.label}
                      className={cn('h-10 px-3 align-middle bg-background', col.align)}
                    >
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {col.label}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
            </table>

            {!isEmpty && (
              <table className="w-full table-fixed shrink-0 text-sm">
                {ledgerColGroup}
                <tbody>{topBalanceRow}</tbody>
              </table>
            )}

            {/* Fixed height sized to ~7 data rows (each row is h-10/2.5rem
                via the header + py-2.5 cell padding), not a viewport
                fraction — so "7 rows visible, then scroll" holds on any
                screen size rather than varying with window height. */}
            <div ref={scrollRef} className="h-70 overflow-auto">
              <table className="w-full table-fixed text-sm">
                {ledgerColGroup}
                <tbody>
                  {isEmpty ? (
                    <tr>
                      <td colSpan={5} className="p-0">
                        <EmptyState
                          icon={BookOpen}
                          title="No transactions in this period"
                          description="Try widening the date range or pick a different party."
                          actionLabel="Reset to This Month"
                          onAction={resetToCurrentMonth}
                        />
                      </td>
                    </tr>
                  ) : (
                    ledgerWithBalance.map((entry, idx) => {
                      const isMatch = ledgerSearchQuery && entry.particular.toLowerCase().includes(ledgerSearchQuery)
                      return (
                      <tr
                        key={idx}
                        ref={idx === firstMatchIndex ? firstMatchRowRef : undefined}
                        className={cn(
                          'border-b border-border/40 transition-colors hover:bg-muted/30',
                          isMatch
                            ? 'bg-amber-50 dark:bg-amber-900/20'
                            : idx % 2 === 0 ? 'bg-background' : 'bg-muted/20 dark:bg-muted/10',
                        )}
                      >
                        <td className="px-3 py-2.5 text-sm text-muted-foreground whitespace-nowrap">
                          {formatDate(entry.date)}
                        </td>
                        <td className="px-3 py-2.5 text-sm font-medium">
                          {isMatch ? highlightMatch(entry.particular, ledgerSearchQuery) : entry.particular}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-sm text-rose-600 dark:text-rose-400">
                          {entry.debit > 0 ? formatCurrency(entry.debit) : '-'}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-sm text-emerald-600 dark:text-emerald-400">
                          {entry.credit > 0 ? formatCurrency(entry.credit) : '-'}
                        </td>
                        <td
                          className={cn(
                            'px-3 py-2.5 text-right font-mono text-sm font-semibold',
                            entry.balance > 0
                              ? 'text-rose-600 dark:text-rose-400'
                              : entry.balance < 0
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : '',
                          )}
                        >
                          {formatLedgerBalance(entry.balance, partyType)}
                        </td>
                      </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>

            {!isEmpty && (
              <table className="w-full table-fixed shrink-0 text-sm">
                {ledgerColGroup}
                <tbody>{bottomBalanceRow}</tbody>
              </table>
            )}

            {hasMoreBelow && (
              <div className="pointer-events-none absolute inset-x-0 bottom-14 flex justify-center">
                <div className="flex items-center gap-1 rounded-full border border-border/60 bg-background/90 backdrop-blur px-2.5 py-1 shadow-sm text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  <span>More</span>
                  <ChevronDown className="h-3 w-3 animate-bounce" />
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  // ─────────────────────────────────────────────────────────────
  // Trend card (running-balance area chart)
  // ─────────────────────────────────────────────────────────────
  function renderTrendCard() {
    if (dailySeries.length < 2) {
      return (
        <Card className="rounded-2xl border-border/60">
          <CardContent className="p-4">
            <EmptyState
              icon={TrendingUp}
              title="Not enough data to chart"
              description="Pick a wider date range to see the running balance trend."
              actionLabel="Reset to This Month"
              onAction={resetToCurrentMonth}
            />
          </CardContent>
        </Card>
      )
    }

    // Reconstruct the period's opening balance (chronological balance right before dateFrom).
    const opening = dailySeries[0].balance - (dailySeries[0].debit - dailySeries[0].credit)
    const closing = dailySeries[dailySeries.length - 1].balance

    // Plot absolute outstanding — line always reads "up = outstanding grew".
    // Side direction (Dr / Cr) is conveyed by the color and labels, not by the
    // line going below zero. This is simpler to read for both customer and
    // supplier ledgers regardless of which side they sit on.
    const plotData = dailySeries.map((d) => ({ ...d, plot: Math.abs(d.balance) }))

    // Peak outstanding (highest |balance|) and its date.
    let peakIdx = 0
    for (let i = 1; i < plotData.length; i++) {
      if (plotData[i].plot > plotData[peakIdx].plot) peakIdx = i
    }
    const peak = plotData[peakIdx]

    // Days that had any activity in this period.
    const activeDays = dailySeries.filter((d) => d.debit > 0 || d.credit > 0).length

    // Color & meaning derived from the closing balance side.
    const accentHex = closing > 0 ? '#f43f5e' : closing < 0 ? '#10b981' : '#64748b'
    const accentTextClass = closing > 0
      ? 'text-rose-600 dark:text-rose-400'
      : closing < 0
        ? 'text-emerald-600 dark:text-emerald-400'
        : 'text-muted-foreground'
    const sideLabel = ledgerBalanceSuffix(closing, partyType)
    const sideMeaning = closing === 0
      ? 'settled'
      : partyType === 'customer'
        ? (closing > 0 ? 'receivable — they owe you' : 'credit balance — you owe them')
        : (closing > 0 ? 'you owe this supplier' : 'you overpaid this supplier')

    // Change vs opening — direction interpreted contextually.
    const change = closing - opening
    const changeAbs = Math.abs(change)
    const changeGrew = Math.abs(closing) > Math.abs(opening)

    return (
      <Card className="rounded-2xl border-border/60">
        <CardContent className="p-5">
          {/* Hero header — the closing balance leads the eye. */}
          <div className="mb-5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Closing balance · {periodLabel}
            </p>
            <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
              <p className={cn('font-mono font-bold tabular-nums text-3xl sm:text-4xl', accentTextClass)}>
                {formatCurrency(Math.abs(closing))}
              </p>
              {sideLabel && (
                <Badge
                  variant={closing > 0 ? 'destructive' : 'success'}
                  size="sm"
                  className="uppercase tracking-wider"
                >
                  {sideLabel} · {sideMeaning}
                </Badge>
              )}
              {change !== 0 && (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  {changeGrew ? (
                    <ArrowUpRight className="h-3 w-3 text-rose-500" />
                  ) : (
                    <ArrowDownLeft className="h-3 w-3 text-emerald-500" />
                  )}
                  <span className="font-mono font-medium">{formatCurrency(changeAbs)}</span>
                  <span>{changeGrew ? 'increase' : 'decrease'} from opening</span>
                </span>
              )}
            </div>
          </div>

          {/* Chart. overflow-hidden guards against ResponsiveContainer ever
              painting taller than its box (e.g. mid-resize) and bleeding
              into the footer stats below. */}
          <div className="h-56 sm:h-72 overflow-hidden">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={plotData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="balGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={accentHex} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={accentHex} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} className="opacity-20" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(d: string) => {
                    const parts = d.split('-')
                    return `${parts[2]}/${parts[1]}`
                  }}
                  interval="preserveStartEnd"
                  minTickGap={32}
                  stroke="currentColor"
                  strokeOpacity={0.3}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: number) => formatCurrencyCompact(v)}
                  width={56}
                  stroke="currentColor"
                  strokeOpacity={0.3}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const d = payload[0].payload as DayPoint
                    return (
                      <div className="rounded-lg border border-border/60 bg-popover/95 backdrop-blur px-3 py-2 text-xs shadow-md">
                        <p className="font-semibold mb-1">{formatDate(d.date)}</p>
                        <p className="font-mono">
                          Balance:{' '}
                          <span className={d.balance > 0 ? 'text-rose-600 dark:text-rose-400' : d.balance < 0 ? 'text-emerald-600 dark:text-emerald-400' : ''}>
                            {formatLedgerBalance(d.balance, partyType)}
                          </span>
                        </p>
                        {(d.debit > 0 || d.credit > 0) && (
                          <p className="font-mono mt-0.5 text-muted-foreground">
                            {d.debit > 0 && <span className="text-rose-600 dark:text-rose-400">Billed {formatCurrency(d.debit)}</span>}
                            {d.debit > 0 && d.credit > 0 && ' · '}
                            {d.credit > 0 && <span className="text-emerald-600 dark:text-emerald-400">Paid {formatCurrency(d.credit)}</span>}
                          </p>
                        )}
                      </div>
                    )
                  }}
                />
                <Area
                  type="stepAfter"
                  dataKey="plot"
                  stroke={accentHex}
                  strokeWidth={2.5}
                  fill="url(#balGradient)"
                  isAnimationActive
                  activeDot={{ r: 5, fill: accentHex, stroke: '#fff', strokeWidth: 2 }}
                  dot={(props: any) => {
                    const { cx, cy, payload, index } = props
                    if (!payload || (payload.debit === 0 && payload.credit === 0)) {
                      return <g key={`dot-${index}`} />
                    }
                    const isDebitDominant = payload.debit >= payload.credit
                    return (
                      <circle
                        key={`dot-${index}`}
                        cx={cx}
                        cy={cy}
                        r={3}
                        fill={isDebitDominant ? '#f43f5e' : '#10b981'}
                      />
                    )
                  }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Footer stats */}
          <div className="mt-4 grid grid-cols-3 gap-3 border-t border-border/40 pt-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Opening
              </p>
              <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums wrap-break-word">
                {formatCurrency(Math.abs(opening))}
                {opening !== 0 && (
                  <span className="ml-1 text-[10px] text-muted-foreground">
                    {' '}{ledgerBalanceSuffix(opening, partyType)}
                  </span>
                )}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Peak
              </p>
              <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums wrap-break-word">
                {formatCurrency(peak.plot)}
                {peak.plot > 0 && (
                  <span className="ml-1 text-[10px] text-muted-foreground">
                    {' '}on {formatDate(peak.date)}
                  </span>
                )}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Active days
              </p>
              <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums wrap-break-word">
                {activeDays}
                <span className="ml-1 text-[10px] text-muted-foreground">
                  {' '}of {plotData.length}
                </span>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }
}
