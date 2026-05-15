import { useState, useMemo, useEffect, useRef } from 'react'
import api from '@/lib/api'
import { useMasterDataStore } from '@/stores/masterDataStore'
import { useBranchRefresh } from '@/hooks/useBranchRefresh'
import { DataTableFilterBar } from '@/components/shared/DataTableFilterBar'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  Search,
  FileDown,
  FileSpreadsheet,
  Printer,
  BookOpen,
  ArrowUpRight,
  ArrowDownLeft,
  Wallet,
  Receipt,
  Check,
  ChevronsUpDown,
  X,
  ArrowUpDown,
  ChevronDown,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DatePicker } from '@/components/ui/date-picker'
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
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import { exportToCsv, exportToPdf, printReport } from '@/lib/exportUtils'

// ─────────────────────────────────────────────────────────────
// Ledger entry type
// ─────────────────────────────────────────────────────────────

interface LedgerEntry {
  date: string
  particular: string
  debit: number
  credit: number
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export default function LedgerPage() {
  const [partyType, setPartyType] = useState<'customer' | 'supplier'>('customer')
  const [selectedPartyId, setSelectedPartyId] = useState<string>('')
  const [dateFrom, setDateFrom] = useState('2026-03-01')
  const [dateTo, setDateTo] = useState('2026-03-31')
  const [partySearch, setPartySearch] = useState('')
  const [ledgerSearch, setLedgerSearch] = useState('')
  const [partyPopoverOpen, setPartyPopoverOpen] = useState(false)
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('oldest')
  const [hasMoreBelow, setHasMoreBelow] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const { customers, suppliers, fetchMasterData } = useMasterDataStore()
  // Full history for the selected party. Date range/search/sort applied client-side
  // so changing those doesn't re-hit the API.
  const [allLedgerEntries, setAllLedgerEntries] = useState<LedgerEntry[]>([])

  useBranchRefresh(fetchMasterData)

  useEffect(() => {
    if (customers.length === 0 || suppliers.length === 0) {
      fetchMasterData()
    }
    // Read ?customerId=&name= from URL (navigated from OutstandingPage)
    const params = new URLSearchParams(window.location.search)
    const cid = params.get('customerId')
    if (cid) {
      setPartyType('customer')
      setSelectedPartyId(cid)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Unified party list (customers + suppliers in one searchable pool)
  const unifiedParties = useMemo(() => {
    const all = [
      ...customers.map((c) => ({ id: c.id, name: c.name, type: 'customer' as const })),
      ...suppliers.map((s) => ({ id: s.id, name: s.name, type: 'supplier' as const })),
    ]
    if (!partySearch.trim()) return all
    const q = partySearch.toLowerCase()
    return all.filter((p) => p.name.toLowerCase().includes(q))
  }, [customers, suppliers, partySearch])

  const selectedParty = useMemo(() => {
    if (!selectedPartyId) return null
    if (partyType === 'customer') {
      const c = customers.find((c) => c.id === selectedPartyId)
      return c ? { id: c.id, name: c.name, type: 'customer' as const } : null
    }
    const s = suppliers.find((s) => s.id === selectedPartyId)
    return s ? { id: s.id, name: s.name, type: 'supplier' as const } : null
  }, [selectedPartyId, partyType, customers, suppliers])

  useEffect(() => {
    if (!selectedPartyId) {
      setAllLedgerEntries([])
      return
    }

    const endpoint = partyType === 'customer'
      ? `/reports/financial/ledger/${selectedPartyId}`
      : `/reports/financial/supplier-ledger/${selectedPartyId}`

    let cancelled = false
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
          })),
        )
      })
      .catch(() => { if (!cancelled) setAllLedgerEntries([]) })

    return () => { cancelled = true }
  }, [selectedPartyId, partyType])

  // Apply date filter, compute opening/closing balance, then apply search + sort.
  // Balances are always computed chronologically; sort order only affects display.
  const ledgerData = useMemo(() => {
    const sorted = [...allLedgerEntries].sort((a, b) => a.date.localeCompare(b.date))

    let openingBal = 0
    if (dateFrom) {
      for (const e of sorted) {
        if (e.date < dateFrom) openingBal += e.debit - e.credit
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
      bal += e.debit - e.credit
      return { ...e, balance: bal }
    })
    const closingBal = withBal.length > 0 ? withBal[withBal.length - 1].balance : openingBal

    let displayed = withBal
    if (ledgerSearch.trim()) {
      const q = ledgerSearch.toLowerCase()
      displayed = withBal.filter((e) => e.particular.toLowerCase().includes(q))
    }
    if (sortOrder === 'newest') {
      displayed = [...displayed].reverse()
    }

    return {
      openingBalance: openingBal,
      closingBalance: closingBal,
      entries: displayed,
      inRangeCount: inRange.length,
    }
  }, [allLedgerEntries, dateFrom, dateTo, ledgerSearch, sortOrder])

  const { openingBalance, closingBalance } = ledgerData
  const ledgerWithBalance = ledgerData.entries

  // Summary stats reflect the date-range window (search filter excluded so totals stay stable)
  const summary = useMemo(() => {
    let totalDebit = 0
    let totalCredit = 0
    for (const e of allLedgerEntries) {
      if (dateFrom && e.date < dateFrom) continue
      if (dateTo && e.date > dateTo) continue
      totalDebit += e.debit
      totalCredit += e.credit
    }
    return {
      totalDebit,
      totalCredit,
      netBalance: closingBalance,
      txnCount: ledgerData.inRangeCount,
    }
  }, [allLedgerEntries, dateFrom, dateTo, closingBalance, ledgerData.inRangeCount])

  const activeFilterCount =
    (dateFrom ? 1 : 0) + (dateTo ? 1 : 0) + (sortOrder !== 'oldest' ? 1 : 0)

  const handleExport = (format: string) => {
    if (!ledgerWithBalance.length) { toast.info('No ledger data to export'); return }
    const title = `Party Ledger — ${selectedPartyName}`
    const rows = ledgerWithBalance.map((e) => ({
      Date: formatDate(e.date),
      Particular: e.particular,
      Debit: e.debit,
      Credit: e.credit,
      Balance: e.balance,
    }))
    if (format === 'PDF') exportToPdf(rows, title, `ledger-${selectedPartyName}`)
    else if (format === 'Excel') exportToCsv(rows, `ledger-${selectedPartyName}`)
    else if (format === 'Print') printReport(rows, title)
  }

  const selectedPartyName = selectedParty?.name ?? ''

  // Track whether the ledger scroll container has content below the fold
  // so we can show a "more below" chevron above the sticky closing row.
  useEffect(() => {
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
  }, [ledgerWithBalance.length, selectedPartyId])

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="space-y-5"
    >
      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: 'Total Debit',
            value: formatCurrency(summary.totalDebit),
            icon: ArrowUpRight,
            iconBg: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
            borderAccent: 'border-l-rose-500',
            valueClass: 'text-rose-600 dark:text-rose-400',
          },
          {
            label: 'Total Credit',
            value: formatCurrency(summary.totalCredit),
            icon: ArrowDownLeft,
            iconBg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
            borderAccent: 'border-l-emerald-500',
            valueClass: 'text-emerald-600 dark:text-emerald-400',
          },
          {
            label: 'Net Balance',
            value: `${formatCurrency(Math.abs(summary.netBalance))}${summary.netBalance > 0 ? ' Dr' : summary.netBalance < 0 ? ' Cr' : ''}`,
            icon: Wallet,
            iconBg: summary.netBalance > 0
              ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
              : summary.netBalance < 0
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'bg-slate-500/10 text-slate-600 dark:text-slate-400',
            borderAccent: summary.netBalance > 0
              ? 'border-l-rose-500'
              : summary.netBalance < 0
                ? 'border-l-emerald-500'
                : 'border-l-slate-400',
            valueClass: summary.netBalance > 0
              ? 'text-rose-600 dark:text-rose-400'
              : summary.netBalance < 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : '',
          },
          {
            label: 'Transactions',
            value: summary.txnCount.toString(),
            icon: Receipt,
            iconBg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
            borderAccent: 'border-l-blue-500',
            valueClass: '',
          },
        ].map((stat) => (
          <Card key={stat.label} hover className={cn('border-l-[3px]', stat.borderAccent)}>
            <CardContent className="flex items-center gap-4 p-4">
              <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', stat.iconBg)}>
                <stat.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {stat.label}
                </p>
                <p className={cn('text-lg font-bold font-mono leading-tight', stat.valueClass)}>
                  {stat.value}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Search + Filter Row ── */}
      <DataTableFilterBar
        searchQuery={ledgerSearch}
        onSearchChange={setLedgerSearch}
        searchPlaceholder="Search ledger particulars..."
        resultsCount={ledgerWithBalance.length}
        activeFilterCount={activeFilterCount}
        defaultFiltersOpen
        onClearFilters={() => { setDateFrom(''); setDateTo(''); setSortOrder('oldest') }}
        midNode={
          <Popover open={partyPopoverOpen} onOpenChange={setPartyPopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                role="combobox"
                aria-expanded={partyPopoverOpen}
                className="min-w-40 max-w-60 justify-between"
              >
                {selectedParty ? (
                  <span className="flex items-center gap-1.5 min-w-0">
                    <Badge
                      variant={selectedParty.type === 'customer' ? 'info' : 'purple'}
                      size="sm"
                      className="shrink-0"
                    >
                      {selectedParty.type === 'customer' ? 'Cust' : 'Supp'}
                    </Badge>
                    <span className="truncate">{selectedParty.name}</span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">Pick party...</span>
                )}
                <ChevronsUpDown className="ml-2 h-3.5 w-3.5 opacity-50 shrink-0" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-0" align="end">
              <div className="p-2 border-b border-border/40">
                <Input
                  autoFocus
                  icon={<Search className="h-4 w-4" />}
                  placeholder="Search customer or supplier..."
                  value={partySearch}
                  onChange={(e) => setPartySearch(e.target.value)}
                  className="h-8"
                />
              </div>
              <div className="max-h-72 overflow-y-auto">
                {unifiedParties.length === 0 ? (
                  <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                    No parties match "{partySearch}"
                  </p>
                ) : (
                  unifiedParties.map((p) => {
                    const isSelected = selectedPartyId === p.id && partyType === p.type
                    return (
                      <button
                        key={`${p.type}-${p.id}`}
                        type="button"
                        onClick={() => {
                          setPartyType(p.type)
                          setSelectedPartyId(p.id)
                          setPartySearch('')
                          setPartyPopoverOpen(false)
                        }}
                        className={cn(
                          'w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-muted/50 transition-colors',
                          isSelected && 'bg-muted/40'
                        )}
                      >
                        <Badge
                          variant={p.type === 'customer' ? 'info' : 'purple'}
                          size="sm"
                          className="shrink-0"
                        >
                          {p.type === 'customer' ? 'Cust' : 'Supp'}
                        </Badge>
                        <span className="truncate flex-1">{p.name}</span>
                        {isSelected && <Check className="h-4 w-4 text-primary shrink-0" />}
                      </button>
                    )
                  })
                )}
              </div>
              {selectedParty && (
                <div className="border-t border-border/40 p-1">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPartyId('')
                      setPartySearch('')
                      setPartyPopoverOpen(false)
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/50 rounded-sm transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                    Clear selection
                  </button>
                </div>
              )}
            </PopoverContent>
          </Popover>
        }
        actionNode={
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="border-rose-300 text-rose-700 hover:bg-rose-50 hover:text-rose-800 hover:border-rose-400 dark:border-rose-800/60 dark:text-rose-400 dark:hover:bg-rose-950/40 dark:hover:text-rose-300 dark:hover:border-rose-700"
              onClick={() => handleExport('PDF')}
            >
              <FileDown className="mr-1.5 h-4 w-4" />
              <span className="hidden sm:inline">PDF</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 hover:border-emerald-400 dark:border-emerald-800/60 dark:text-emerald-400 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-300 dark:hover:border-emerald-700"
              onClick={() => handleExport('Excel')}
            >
              <FileSpreadsheet className="mr-1.5 h-4 w-4" />
              <span className="hidden sm:inline">CSV</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-sky-300 text-sky-700 hover:bg-sky-50 hover:text-sky-800 hover:border-sky-400 dark:border-sky-800/60 dark:text-sky-400 dark:hover:bg-sky-950/40 dark:hover:text-sky-300 dark:hover:border-sky-700"
              onClick={() => handleExport('Print')}
            >
              <Printer className="mr-1.5 h-4 w-4" />
              <span className="hidden sm:inline">Print</span>
            </Button>
          </div>
        }
      >
        {/* From Date */}
        <div className="space-y-1.5">
          <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            From Date
          </Label>
          <DatePicker
            value={dateFrom}
            onChange={setDateFrom}
            className="h-9 text-xs"
          />
        </div>

        {/* To Date */}
        <div className="space-y-1.5">
          <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            To Date
          </Label>
          <DatePicker
            value={dateTo}
            onChange={setDateTo}
            className="h-9 text-xs"
          />
        </div>

        {/* Sort Order */}
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

      {/* ── Ledger Table ── */}
      {selectedPartyId ? (
        (() => {
          // Sticky cells (sticky on <td>/<th> works reliably across browsers;
          // sticky on <tr> does not). Each cell gets its own opaque bg so rows
          // behind don't bleed through. Sticky direction is tied to DOM position:
          // a row at the top sticks to top-10 (below the h-10 header); a row at
          // the bottom sticks to bottom-0. We swap WHICH balance row goes top vs
          // bottom based on sort order so it always reads naturally (newest-first
          // → Closing on top, Opening at bottom).
          const renderBalanceRow = (kind: 'opening' | 'closing', position: 'top' | 'bottom') => {
            const cellCls = position === 'top'
              ? 'sticky top-10 z-10 bg-zinc-100 dark:bg-zinc-800 font-semibold'
              : 'sticky bottom-0 z-10 bg-zinc-100 dark:bg-zinc-800 font-bold'
            const isOpening = kind === 'opening'
            const date = isOpening ? dateFrom : dateTo
            const label = isOpening ? 'Opening Balance' : 'Closing Balance'
            const balance = isOpening ? openingBalance : closingBalance
            const rowBorder = position === 'top' ? 'border-b-2 border-border/60' : 'border-t-2 border-border/60'
            return (
              <tr key={kind} className={rowBorder}>
                <td className={cn(cellCls, 'px-3 py-2.5 text-sm')}>{date ? formatDate(date) : '-'}</td>
                <td className={cn(cellCls, 'px-3 py-2.5 text-sm')}>{label}</td>
                <td className={cn(cellCls, 'px-3 py-2.5 text-right font-mono text-sm')}>-</td>
                <td className={cn(cellCls, 'px-3 py-2.5 text-right font-mono text-sm')}>-</td>
                <td className={cn(
                  cellCls,
                  'px-3 py-2.5 text-right font-mono text-sm',
                  balance > 0 ? 'text-rose-600 dark:text-rose-400'
                    : balance < 0 ? 'text-emerald-600 dark:text-emerald-400' : ''
                )}>
                  {formatCurrency(Math.abs(balance))}
                  {balance > 0 ? ' Dr' : balance < 0 ? ' Cr' : ''}
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

          return (
          <Card className="rounded-2xl border-border/60 flex flex-col overflow-hidden">
            <CardContent className="p-0 flex flex-col min-h-0">
              {/* Mobile card list */}
              <div className="md:hidden max-h-[calc(100vh-22rem)] overflow-y-auto">
                {ledgerWithBalance.length === 0 && (
                  <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/50">
                      <BookOpen className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-medium">No transactions in this period</p>
                      <p className="text-xs text-muted-foreground max-w-sm px-4">
                        Try widening the date range or pick another party.
                      </p>
                    </div>
                  </div>
                )}
                <div className="divide-y divide-border/40">
                  {ledgerWithBalance.map((entry, idx) => (
                    <div key={idx} className="flex items-start justify-between gap-2 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{entry.particular}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{formatDate(entry.date)}</p>
                      </div>
                      <div className="text-right shrink-0">
                        {entry.debit > 0 && (
                          <p className="font-mono text-xs text-rose-600 dark:text-rose-400">Dr {formatCurrency(entry.debit)}</p>
                        )}
                        {entry.credit > 0 && (
                          <p className="font-mono text-xs text-emerald-600 dark:text-emerald-400">Cr {formatCurrency(entry.credit)}</p>
                        )}
                        <p className={cn('font-mono text-xs font-semibold', entry.balance > 0 ? 'text-rose-600 dark:text-rose-400' : entry.balance < 0 ? 'text-emerald-600 dark:text-emerald-400' : '')}>
                          Bal: {formatCurrency(Math.abs(entry.balance))}{entry.balance > 0 ? ' Dr' : entry.balance < 0 ? ' Cr' : ''}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {/* Desktop table — raw <table> so sticky cells anchor to THIS scroll container
                  (shadcn's <Table> adds its own overflow-auto wrapper, which would shadow ours). */}
              <div className="hidden md:block relative">
              <div ref={scrollRef} className="overflow-auto max-h-[calc(100vh-22rem)]">
              <table className="w-full caption-bottom text-sm">
                <thead>
                  <tr className="border-b border-border/60">
                    {[
                      { label: 'Date', align: 'text-left' },
                      { label: 'Particular', align: 'text-left' },
                      { label: 'Debit', align: 'text-right' },
                      { label: 'Credit', align: 'text-right' },
                      { label: 'Running Balance', align: 'text-right' },
                    ].map((col) => (
                      <th
                        key={col.label}
                        className={cn(
                          'sticky top-0 z-20 h-10 px-3 align-middle bg-background',
                          col.align
                        )}
                      >
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {col.label}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {topBalanceRow}

                  {/* Ledger entries */}
                  {ledgerWithBalance.map((entry, idx) => (
                    <tr
                      key={idx}
                      className={cn(
                        'border-b border-border/40 transition-colors hover:bg-muted/30',
                        idx % 2 === 0 ? 'bg-background' : 'bg-muted/20 dark:bg-muted/10'
                      )}
                    >
                      <td className="px-3 py-2.5 text-sm text-muted-foreground whitespace-nowrap">
                        {formatDate(entry.date)}
                      </td>
                      <td className="px-3 py-2.5 text-sm font-medium">{entry.particular}</td>
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
                            : ''
                        )}
                      >
                        {formatCurrency(Math.abs(entry.balance))}
                        {entry.balance > 0 ? ' Dr' : entry.balance < 0 ? ' Cr' : ''}
                      </td>
                    </tr>
                  ))}

                  {bottomBalanceRow}

                  {ledgerWithBalance.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-0">
                        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/50">
                            <BookOpen className="h-6 w-6 text-muted-foreground" />
                          </div>
                          <div className="space-y-1">
                            <p className="text-sm font-medium">No transactions in this period</p>
                            <p className="text-xs text-muted-foreground max-w-sm">
                              Try widening the date range or pick another party.
                            </p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              </div>
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
        })()
      ) : (
        <Card className="rounded-2xl border-border/60">
          <CardContent className="py-16 text-center text-muted-foreground">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/60 dark:bg-muted/30">
              <BookOpen className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-lg font-medium">Select a party to view their ledger</p>
            <p className="text-sm mt-1">Choose a customer or supplier from the controls above</p>
          </CardContent>
        </Card>
      )}
    </motion.div>
  )
}
