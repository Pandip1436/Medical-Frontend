import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useBranchRefresh } from '@/hooks/useBranchRefresh'
import api from '@/lib/api'
import { usePersistedState } from '@/hooks/usePersistedState'
import { motion } from 'framer-motion'
import { useForm, Controller } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import dayjs from 'dayjs'
import { navigate } from '@/lib/router'
import {
  Plus,
  ArrowDownLeft,
  ArrowUpRight,
  Wallet,
  BookOpen,
  Search,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Paperclip,
  Upload,
  X,
} from 'lucide-react'

import { DataTablePagination } from '@/components/shared/DataTablePagination'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DatePicker } from '@/components/ui/date-picker'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ExportMenu } from '@/components/shared/ExportMenu'
import { cn, formatCurrency } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────
// Zod schema for Add Expense
// ─────────────────────────────────────────────────────────────

const expenseSchema = z.object({
  date: z.string().min(1, 'Date is required'),
  category: z.string().min(1, 'Category is required'),
  description: z.string().min(1, 'Description is required'),
  amount: z.coerce.number().min(1, 'Amount must be greater than 0'),
  paymentMode: z.string().min(1, 'Payment mode is required'),
})

type ExpenseFormValues = z.input<typeof expenseSchema>

// ─────────────────────────────────────────────────────────────
// Cash transaction types
// ─────────────────────────────────────────────────────────────

interface CashTransaction {
  id: string
  time: string
  particular: string
  type: 'Sale' | 'Purchase' | 'Expense' | 'Receipt'
  refNumber: string
  debit: number
  credit: number
  receiptImage?: string | null
}

const expenseCategories = [
  'Rent',
  'Salary',
  'Electricity',
  'Transport',
  'Insurance',
  'Maintenance',
  'Telephone & Internet',
  'Stationery & Printing',
  'Software & IT',
  'License & Compliance',
  'Miscellaneous',
]

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export default function CashBookPage() {
  const [selectedDate, setSelectedDate] = usePersistedState(
    'filters:accounting.cashbook:date',
    new Date().toISOString().split('T')[0],
  )
  const [searchQuery, setSearchQuery] = usePersistedState('filters:accounting.cashbook:search', '')
  // Stat-card drill-down: clicking the Cash In / Cash Out card narrows the
  // table to that direction. Opening/Closing are running-balance aggregates,
  // so they map to 'all' (no drill-down). The cards still show the full-day
  // totals regardless of this filter.
  const [cardFilter, setCardFilter] = usePersistedState<'all' | 'in' | 'out'>('filters:accounting.cashbook:card', 'all')
  const [addExpenseOpen, setAddExpenseOpen] = useState(false)
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const receiptInputRef = useRef<HTMLInputElement>(null)
  const [apiTransactions, setApiTransactions] = useState<CashTransaction[]>([])
  // Opening balance is now sourced from the BE (sum of all prior CASH
  // receipts/expenses), not hardcoded to 0. Carries yesterday's close into
  // today's morning view.
  const [openingBalance, setOpeningBalance] = useState(0)
  const [isLoading, setIsLoading] = useState(true)

  const fetchCashbook = useCallback(() => {
    let cancelled = false
    setIsLoading(true)
    api
      .get('/reports/financial/cash-book', { params: { from: selectedDate, to: selectedDate } })
      .then((res) => {
        if (cancelled) return
        const rows = res.data?.tableData ?? []
        const mapped: CashTransaction[] = rows.map((r: any, i: number) => ({
          id: `${r.ref}-${i}`,
          time: new Date(r.date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
          particular: r.description,
          type: r.type === 'RECEIPT' ? 'Sale' : 'Expense',
          refNumber: r.ref,
          debit: r.type === 'RECEIPT' ? Number(r.amount) : 0,
          credit: r.type === 'PAYMENT' ? Number(r.amount) : 0,
          receiptImage: r.receiptImage ?? null,
        }))
        setApiTransactions(mapped)
        setOpeningBalance(Number(res.data?.openingBalance ?? 0))
      })
      .catch(() => { if (!cancelled) { setApiTransactions([]); setOpeningBalance(0) } })
      .finally(() => { if (!cancelled) setIsLoading(false) })
    return () => { cancelled = true }
  }, [selectedDate])

  useEffect(() => { return fetchCashbook() }, [fetchCashbook])
  useBranchRefresh(fetchCashbook)

  const transactions = useMemo(() => {
    const txns = [...apiTransactions]
    txns.sort((a, b) => a.time.localeCompare(b.time))
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      return txns.filter(
        (t) =>
          t.particular.toLowerCase().includes(q) || t.refNumber.toLowerCase().includes(q),
      )
    }
    return txns
  }, [apiTransactions, searchQuery])

  // Summary calculations
  const summary = useMemo(() => {
    const cashIn = transactions.reduce((sum, t) => sum + t.debit, 0)
    const cashOut = transactions.reduce((sum, t) => sum + t.credit, 0)
    const closingBalance = openingBalance + cashIn - cashOut
    return { openingBalance, cashIn, cashOut, closingBalance }
  }, [transactions, openingBalance])

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const PAGE_SIZE = 15

  // Compute running balance column. Built from the full (search-filtered) set
  // so the running balance stays correct even when a card drill-down hides
  // some rows below.
  const transactionsWithBalance = useMemo(() => {
    let balance = summary.openingBalance
    return transactions.map((t) => {
      balance += t.debit - t.credit
      return { ...t, balance }
    })
  }, [transactions, summary.openingBalance])

  // Apply the stat-card drill-down to the displayed list only. Cash In keeps
  // debit rows; Cash Out keeps credit rows. Export still uses the full
  // `transactionsWithBalance`.
  const displayedTransactions = useMemo(() => {
    if (cardFilter === 'in') return transactionsWithBalance.filter((t) => t.debit > 0)
    if (cardFilter === 'out') return transactionsWithBalance.filter((t) => t.credit > 0)
    return transactionsWithBalance
  }, [transactionsWithBalance, cardFilter])

  // Reset pagination on search, date, or card-filter change
  useEffect(() => { setCurrentPage(1) }, [searchQuery, selectedDate, cardFilter])

  const totalPages = Math.ceil(displayedTransactions.length / PAGE_SIZE)
  const paginatedTransactions = useMemo(() => {
    return displayedTransactions.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  }, [displayedTransactions, currentPage])

  // ── Export ───────────────────────────────────────────────────
  // Cash book is fully in-memory after the day fetch — we can export directly
  // from `transactionsWithBalance` without re-hitting the BE. Opening + closing
  // balance rows bookend the table so the export reads as a self-contained
  // cash book on paper.
  const cashBookExportRows = () => {
    // jsPDF's default font can't render the ₹ glyph (it prints as a stray
    // character), so amounts go into the export without the currency symbol —
    // just the Indian-grouped number. The column headers ("Cash In", etc.)
    // already convey that these are money figures.
    const money = (v: number) => formatCurrency(v).replace(/₹\s?/g, '')
    const openingRow = {
      Time: '',
      Particular: 'Opening Balance',
      Type: '—',
      'Ref #': '—',
      'Cash In': '—',
      'Cash Out': '—',
      Balance: money(summary.openingBalance),
    }
    const closingRow = {
      Time: '',
      Particular: 'Closing Balance',
      Type: '—',
      'Ref #': '—',
      'Cash In': money(summary.cashIn),
      'Cash Out': money(summary.cashOut),
      Balance: money(summary.closingBalance),
    }
    const txnRows = transactionsWithBalance.map((t) => ({
      Time: t.time,
      Particular: t.particular,
      Type: t.type,
      'Ref #': t.type === 'Expense' ? '—' : t.refNumber,
      'Cash In': t.debit > 0 ? money(t.debit) : '—',
      'Cash Out': t.credit > 0 ? money(t.credit) : '—',
      Balance: money(t.balance),
    }))
    return [openingRow, ...txnRows, closingRow]
  }

  // Expense form
  const form = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      date: selectedDate,
      category: '',
      description: '',
      amount: 0,
      paymentMode: 'CASH',
    },
  })

  const handleAddExpense = async (values: any) => {
    try {
      // Persist via the BE so the expense survives reload, shows up in the
      // expenses list, and lands in P&L. paymentMode is sent UPPERCASE so the
      // cash-book filter picks it up immediately. When a receipt file is
      // attached, switch to multipart/form-data so the backend's
      // FileInterceptor can stream it straight to R2.
      if (receiptFile) {
        const fd = new FormData()
        fd.append('date', values.date)
        fd.append('category', values.category)
        fd.append('description', values.description)
        fd.append('amount', String(Number(values.amount)))
        fd.append('paymentMode', String(values.paymentMode ?? 'CASH').toUpperCase())
        fd.append('receipt', receiptFile)
        await api.post('/expenses', fd)
      } else {
        await api.post('/expenses', {
          date: values.date,
          category: values.category,
          description: values.description,
          amount: Number(values.amount),
          paymentMode: String(values.paymentMode ?? 'CASH').toUpperCase(),
        })
      }
      toast.success(`Expense of ${formatCurrency(values.amount)} saved to cash book`)
      form.reset({ date: selectedDate, category: '', description: '', amount: 0, paymentMode: 'Cash' })
      setReceiptFile(null)
      setAddExpenseOpen(false)
      fetchCashbook()
    } catch (error: any) {
      const msg = error?.response?.data?.message ?? 'Failed to save expense'
      toast.error(Array.isArray(msg) ? msg.join('; ') : msg)
    }
  }

  const typeBadge = (type: string) => {
    const variant =
      type === 'Sale' || type === 'Receipt'
        ? 'success'
        : 'destructive'
    return (
      <Badge variant={variant as 'success' | 'destructive'} size="sm" dot>
        {type}
      </Badge>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="space-y-5"
    >
      {/* ── Summary Cards ── */}
      {/* responsive: 2-up on phones (was 1-per-row) so the KPIs stay compact */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        {([
          {
            label: 'Opening Balance',
            value: formatCurrency(summary.openingBalance),
            icon: BookOpen,
            iconBg: 'bg-slate-500/10 text-slate-600 dark:text-slate-400',
            borderAccent: 'border-l-slate-400',
            valueClass: '',
            filterKey: 'all' as const,
            activeRing: '',
          },
          {
            label: 'Cash In',
            value: formatCurrency(summary.cashIn),
            icon: ArrowDownLeft,
            iconBg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
            borderAccent: 'border-l-emerald-500',
            valueClass: 'text-emerald-600 dark:text-emerald-400',
            filterKey: 'in' as const,
            activeRing: 'ring-2 ring-emerald-500/50',
          },
          {
            label: 'Cash Out',
            value: formatCurrency(summary.cashOut),
            icon: ArrowUpRight,
            iconBg: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
            borderAccent: 'border-l-rose-500',
            valueClass: 'text-rose-600 dark:text-rose-400',
            filterKey: 'out' as const,
            activeRing: 'ring-2 ring-rose-500/50',
          },
          {
            label: 'Closing Balance',
            value: formatCurrency(summary.closingBalance),
            icon: Wallet,
            iconBg: summary.closingBalance >= 0
              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              : 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
            borderAccent: summary.closingBalance >= 0 ? 'border-l-emerald-500' : 'border-l-rose-500',
            valueClass: summary.closingBalance >= 0
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-rose-600 dark:text-rose-400',
            filterKey: 'all' as const,
            activeRing: '',
          },
        ]).map((stat) => {
          const clickable = stat.filterKey !== 'all'
          const active = clickable && cardFilter === stat.filterKey
          return (
          <Card
            key={stat.label}
            hover
            role={clickable ? 'button' : undefined}
            tabIndex={clickable ? 0 : undefined}
            title={clickable ? `Filter list to ${stat.label.toLowerCase()} entries` : undefined}
            onClick={clickable ? () => setCardFilter(active ? 'all' : stat.filterKey) : undefined}
            onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setCardFilter(active ? 'all' : stat.filterKey) } } : undefined}
            className={cn('border-l-[3px] transition-shadow', stat.borderAccent, clickable && 'cursor-pointer', active && stat.activeRing)}
          >
            <CardContent className="flex items-center gap-3 p-3 sm:gap-4 sm:p-4">
              <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:h-10 sm:w-10', stat.iconBg)}>
                <stat.icon className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
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
          )
        })}
      </div>

      {/* ── Unified Toolbar Row: Date · Search · Export · Add Expense · Manage ── */}
      {(() => {
        const isToday = dayjs(selectedDate).isSame(dayjs(), 'day')
        const isFuture = dayjs(selectedDate).isAfter(dayjs(), 'day')
        const formattedDate = dayjs(selectedDate).format('ddd, DD MMM YYYY')
        const goPrev = () => setSelectedDate(dayjs(selectedDate).subtract(1, 'day').format('YYYY-MM-DD'))
        const goNext = () => setSelectedDate(dayjs(selectedDate).add(1, 'day').format('YYYY-MM-DD'))
        const goToday = () => setSelectedDate(dayjs().format('YYYY-MM-DD'))
        return (
          <div className="flex flex-wrap items-center gap-1.5">
            {/* Date controls */}
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={goPrev} aria-label="Previous day">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9"
              onClick={goNext}
              disabled={isToday || isFuture}
              aria-label="Next day"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 gap-1.5 font-medium">
                  <CalendarDays className="h-4 w-4 text-muted-foreground" />
                  {formattedDate}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dayjs(selectedDate).toDate()}
                  onSelect={(d) => d && setSelectedDate(dayjs(d).format('YYYY-MM-DD'))}
                  disabled={(d) => dayjs(d).isAfter(dayjs(), 'day')}
                />
              </PopoverContent>
            </Popover>
            <Button variant="outline" size="sm" className="h-9" onClick={goToday} disabled={isToday}>
              Today
            </Button>

            {/* Search — first row on mobile (full width); on sm+ it flows back
                into the middle of the toolbar and grows to fill. */}
            <div className="order-first w-full sm:order-0 sm:w-auto sm:flex-1 sm:min-w-48">
              <Input
                icon={<Search className="h-4 w-4" />}
                placeholder="Search particulars or ref#..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9"
                suffix={
                  <span className="tabular-nums whitespace-nowrap text-xs text-muted-foreground">
                    {transactions.length} found
                  </span>
                }
              />
            </div>

            {/* Right cluster — Export · Add Expense · Manage */}
            <ExportMenu
              title={`Cash Book — ${dayjs(selectedDate).format('DD MMM YYYY')}`}
              filename={`cash-book-${selectedDate}`}
              noun="transaction"
              disabled={transactionsWithBalance.length === 0}
              rows={cashBookExportRows}
              className="h-9"
            />
            <Button size="sm" className="h-9 w-full sm:w-auto" onClick={() => setAddExpenseOpen(true)}>
              <Plus className="mr-1 h-4 w-4" />
              <span className="hidden sm:inline">Add Expense</span>
              <span className="sm:hidden">Add</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9 hidden md:inline-flex"
              onClick={() => navigate('/accounting/expenses')}
            >
              Manage all expenses →
            </Button>
          </div>
        )
      })()}

      {/* ── Transaction Table ── */}
      <Card className="overflow-x-auto rounded-2xl border-border/60">
        <CardContent className="p-0">
          {/* Mobile card list */}
          <div className="md:hidden">
            {isLoading && [...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-border/40">
                <div className="flex-1 space-y-1.5">
                  <div className="h-4 w-32 rounded bg-muted animate-pulse" />
                  <div className="h-3 w-20 rounded bg-muted animate-pulse" />
                </div>
                <div className="h-4 w-16 rounded bg-muted animate-pulse" />
              </div>
            ))}
            {!isLoading && displayedTransactions.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/50">
                  <BookOpen className="h-6 w-6 text-muted-foreground" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium">Nothing recorded for this date</p>
                  <p className="text-xs text-muted-foreground max-w-sm px-4">
                    Cash invoices and cash expenses logged on this date will appear here.
                    For bank or UPI expenses, use the Expenses page.
                  </p>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <Button size="sm" onClick={() => setAddExpenseOpen(true)}>
                    <Plus className="mr-1 h-4 w-4" />
                    Record Expense
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => navigate('/billing/new')}>
                    Create Cash Sale
                  </Button>
                </div>
              </div>
            )}
            <div className="divide-y divide-border/40">
              {!isLoading && paginatedTransactions.map((txn) => (
                <div key={txn.id} className="flex items-start justify-between gap-2 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">
                      <span className="inline-flex items-center gap-1.5 align-middle">
                        {txn.particular}
                        {txn.receiptImage && (
                          <a
                            href={txn.receiptImage}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground hover:text-foreground"
                            aria-label="View receipt"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Paperclip className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </span>
                    </p>
                    <div className="mt-0.5 flex items-center gap-2">
                      {typeBadge(txn.type)}
                      <span className="font-mono text-[10px] text-muted-foreground">{txn.time}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    {txn.debit > 0 && (
                      <p className="font-mono text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                        +{formatCurrency(txn.debit)}
                      </p>
                    )}
                    {txn.credit > 0 && (
                      <p className="font-mono text-sm font-semibold text-rose-600 dark:text-rose-400">
                        -{formatCurrency(txn.credit)}
                      </p>
                    )}
                    <p className="font-mono text-xs text-muted-foreground">Bal: {formatCurrency(txn.balance)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          {/* Desktop table */}
          <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Time
                  </span>
                </TableHead>
                <TableHead>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Particular
                  </span>
                </TableHead>
                <TableHead>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Type
                  </span>
                </TableHead>
                <TableHead>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Ref #
                  </span>
                </TableHead>
                <TableHead className="text-right">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Cash In
                  </span>
                </TableHead>
                <TableHead className="text-right">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Cash Out
                  </span>
                </TableHead>
                <TableHead className="text-right">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Balance
                  </span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && [...Array(5)].map((_, i) => (
                <TableRow key={i}>
                  {[...Array(7)].map((__, j) => (
                    <TableCell key={j}>
                      <div className="h-4 rounded bg-muted animate-pulse" style={{ width: j === 1 ? '140px' : '60px' }} />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
              {!isLoading && paginatedTransactions.map((txn) => (
                <TableRow key={txn.id}>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {txn.time}
                  </TableCell>
                  <TableCell className="text-sm font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      {txn.particular}
                      {txn.receiptImage && (
                        <a
                          href={txn.receiptImage}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-foreground"
                          title="View receipt"
                          aria-label="View receipt"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Paperclip className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </span>
                  </TableCell>
                  <TableCell>{typeBadge(txn.type)}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {txn.type === 'Expense' ? '—' : txn.refNumber}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm text-emerald-600 dark:text-emerald-400">
                    {txn.debit > 0 ? formatCurrency(txn.debit) : '-'}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm text-rose-600 dark:text-rose-400">
                    {txn.credit > 0 ? formatCurrency(txn.credit) : '-'}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm font-semibold">
                    {formatCurrency(txn.balance)}
                  </TableCell>
                </TableRow>
              ))}
              {!isLoading && displayedTransactions.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={7} className="p-0">
                    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/50">
                        <BookOpen className="h-6 w-6 text-muted-foreground" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-medium">Nothing recorded for this date</p>
                        <p className="text-xs text-muted-foreground max-w-sm">
                          Cash invoices and cash expenses logged on this date will appear here.
                          For bank or UPI expenses, use the Expenses page.
                        </p>
                      </div>
                      <div className="flex items-center gap-2 pt-1">
                        <Button size="sm" onClick={() => setAddExpenseOpen(true)}>
                          <Plus className="mr-1 h-4 w-4" />
                          Record Expense
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => navigate('/billing/new')}>
                          Create Cash Sale
                        </Button>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          </div>
          {totalPages > 1 && (
            <div className="border-t px-4 py-4">
              <DataTablePagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Add Expense Dialog ─── */}
      <Dialog open={addExpenseOpen} onOpenChange={setAddExpenseOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Add Expense</DialogTitle>
            <DialogDescription>Record a new expense in the cash book.</DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(handleAddExpense)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="date">Date</Label>
              <Controller
                control={form.control}
                name="date"
                render={({ field }) => (
                  <DatePicker id="date" value={field.value} onChange={field.onChange} className="rounded-xl" />
                )}
              />
            </div>

            <div className="space-y-2">
              <Label>Category</Label>
              <Controller
                control={form.control}
                name="category"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="rounded-xl">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {expenseCategories.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {cat}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {form.formState.errors.category && (
                <p className="text-xs text-destructive">{form.formState.errors.category.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                {...form.register('description')}
                placeholder="Expense description"
                className="rounded-xl"
              />
              {form.formState.errors.description && (
                <p className="text-xs text-destructive">{form.formState.errors.description.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount">Amount</Label>
              <Input
                id="amount"
                type="number"
                {...form.register('amount')}
                placeholder="0"
                className="rounded-xl"
              />
              {form.formState.errors.amount && (
                <p className="text-xs text-destructive">{form.formState.errors.amount.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Receipt (optional)</Label>
              {receiptFile ? (
                <div className="flex items-center gap-2 rounded-lg border border-input bg-muted/30 px-3 py-2">
                  <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-xs flex-1 truncate">{receiptFile.name}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => {
                      setReceiptFile(null)
                      if (receiptInputRef.current) receiptInputRef.current.value = ''
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start rounded-xl"
                  onClick={() => receiptInputRef.current?.click()}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  Attach receipt (image or PDF, max 5 MB)
                </Button>
              )}
              <input
                ref={receiptInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  if (f.size > 5 * 1024 * 1024) {
                    toast.error('File too large (max 5 MB)')
                    e.target.value = ''
                    return
                  }
                  setReceiptFile(f)
                }}
              />
            </div>

            <div className="space-y-2">
              <Label>Payment Mode</Label>
              <div className="flex items-center gap-2 rounded-xl border border-input bg-muted/30 px-3 py-2">
                <Badge variant="info" size="sm" dot>Cash</Badge>
                <span className="text-xs text-muted-foreground">Cash Book records cash expenses only.</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                For bank transfer or UPI expenses, use the{' '}
                <button
                  type="button"
                  className="underline underline-offset-2 hover:text-foreground"
                  onClick={() => { setAddExpenseOpen(false); navigate('/accounting/expenses') }}
                >
                  Expenses page
                </button>
                .
              </p>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddExpenseOpen(false)} className="rounded-xl">
                Cancel
              </Button>
              <Button type="submit" className="rounded-xl">Save Expense</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
