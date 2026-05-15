import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useBranchRefresh } from '@/hooks/useBranchRefresh'
import { motion } from 'framer-motion'
import { useForm, Controller } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import {
  Plus,
  Pencil,
  Trash2,
  TrendingUp,
  TrendingDown,
  Receipt,
  MoreHorizontal,
  Search,
  Calculator,
  Paperclip,
  Upload,
  X,
  TableProperties,
  BarChart3,
} from 'lucide-react'
import { useDebounce } from '@/hooks/useDebounce'
import { DataTableFilterBar } from '@/components/shared/DataTableFilterBar'
import { DataTablePagination } from '@/components/shared/DataTablePagination'
import { DataTableRowActions } from '@/components/shared/DataTableRowActions'
import { EnumSelect } from '@/components/shared/EnumSelect'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DatePicker } from '@/components/ui/date-picker'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
import { cn, formatCurrency, formatCurrencyCompact, formatDate } from '@/lib/utils'
import api from '@/lib/api'
import type { Expense } from '@/types'

// ─────────────────────────────────────────────────────────────
// Zod schema
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
// Category badge variants
// ─────────────────────────────────────────────────────────────

const categoryBadgeVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info' | 'purple'> = {
  RENT: 'default',
  SALARY: 'warning',
  ELECTRICITY: 'destructive',
  TRANSPORT: 'info',
  INSURANCE: 'outline',
  MAINTENANCE: 'success',
  'TELEPHONE_INTERNET': 'purple',
  'STATIONERY_PRINTING': 'outline',
  'SOFTWARE_IT': 'info',
  'LICENSE_COMPLIANCE': 'warning',
  MISCELLANEOUS: 'secondary',
}

const expenseCategories = [
  'RENT',
  'SALARY',
  'ELECTRICITY',
  'TRANSPORT',
  'INSURANCE',
  'MAINTENANCE',
  'TELEPHONE_INTERNET',
  'STATIONERY_PRINTING',
  'SOFTWARE_IT',
  'LICENSE_COMPLIANCE',
  'MISCELLANEOUS',
]

const paymentModes = ['CASH', 'BANK_TRANSFER', 'UPI', 'CHEQUE']

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

type MonthlySummary = {
  thisMonthTotal: number
  lastMonthTotal: number
  difference: number
  average: number
}
const EMPTY_SUMMARY: MonthlySummary = { thisMonthTotal: 0, lastMonthTotal: 0, difference: 0, average: 0 }

export default function ExpensesPage() {
  // View toggle: table is the default list; chart shows the category breakdown
  // chart in place of the table (replacing the old "always below" placement).
  const [viewMode, setViewMode] = useState<'table' | 'chart'>('table')

  // Filters
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [paymentModeFilter, setPaymentModeFilter] = useState('all')

  // Pagination — driven by the server, not by slicing locally.
  const [currentPage, setCurrentPage] = useState(1)
  const PAGE_SIZE = 10

  // Server-driven state
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [total, setTotal] = useState(0)
  const [monthlySummary, setMonthlySummary] = useState<MonthlySummary>(EMPTY_SUMMARY)
  const [categoryBreakdown, setCategoryBreakdown] = useState<{ category: string; total: number }[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [fetchError, setFetchError] = useState(false)

  const fetchExpenses = useCallback(() => {
    let cancelled = false
    setIsLoading(true)
    setFetchError(false)
    api.get('/expenses', {
      params: {
        page: currentPage,
        pageSize: PAGE_SIZE,
        search: debouncedSearch.trim() || undefined,
        category: categoryFilter !== 'all' ? categoryFilter : undefined,
        paymentMode: paymentModeFilter !== 'all' ? paymentModeFilter : undefined,
      },
    })
      .then((res) => {
        if (cancelled) return
        // BE returns paginated envelope: { data, total, monthlySummary, categoryBreakdown }
        const payload = res.data ?? {}
        setExpenses(Array.isArray(payload.data) ? payload.data : [])
        setTotal(Number(payload.total ?? 0))
        setMonthlySummary(payload.monthlySummary ?? EMPTY_SUMMARY)
        setCategoryBreakdown(Array.isArray(payload.categoryBreakdown) ? payload.categoryBreakdown : [])
      })
      .catch(() => {
        if (!cancelled) {
          setFetchError(true)
          toast.error('Failed to load expenses')
        }
      })
      .finally(() => { if (!cancelled) setIsLoading(false) })
    return () => { cancelled = true }
  }, [currentPage, debouncedSearch, categoryFilter, paymentModeFilter])

  // Re-fetch whenever any filter / page / search changes. The debounce on
  // `search` keeps keystrokes from hammering the BE.
  useEffect(() => { return fetchExpenses() }, [fetchExpenses])

  // Reset to page 1 whenever a non-page filter flips, so the user isn't stuck
  // on page 5 of a result set that's now only 1 page.
  useEffect(() => { setCurrentPage(1) }, [debouncedSearch, categoryFilter, paymentModeFilter, viewMode])

  useBranchRefresh(fetchExpenses)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  // `existingReceiptUrl` is the URL currently saved in DB for the expense being
  // edited. `removeReceipt` is set when user explicitly clears it. Both interact:
  // attaching a new file implicitly replaces.
  const [existingReceiptUrl, setExistingReceiptUrl] = useState<string | null>(null)
  const [removeReceipt, setRemoveReceipt] = useState(false)
  const receiptInputRef = useRef<HTMLInputElement>(null)

  const maxCategoryTotal = categoryBreakdown.length > 0 ? categoryBreakdown[0].total : 1
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // Form
  const form = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      date: new Date().toISOString().split('T')[0],
      category: '',
      description: '',
      amount: 0,
      paymentMode: 'CASH',
    },
  })

  const resetReceiptState = () => {
    setReceiptFile(null)
    setExistingReceiptUrl(null)
    setRemoveReceipt(false)
    if (receiptInputRef.current) receiptInputRef.current.value = ''
  }

  const handleOpenAdd = () => {
    setEditingExpense(null)
    resetReceiptState()
    form.reset({
      date: new Date().toISOString().split('T')[0],
      category: '',
      description: '',
      amount: 0,
      paymentMode: 'CASH',
    })
    setDialogOpen(true)
  }

  const handleOpenEdit = (expense: Expense) => {
    setEditingExpense(expense)
    resetReceiptState()
    setExistingReceiptUrl(expense.receiptImage ?? null)
    form.reset({
      date: new Date(expense.date).toISOString().split('T')[0],
      category: expense.category,
      description: expense.description,
      amount: expense.amount,
      paymentMode: expense.paymentMode,
    })
    setDialogOpen(true)
  }

  const handleDelete = async (expense: Expense) => {
    try {
      await api.delete(`/expenses/${expense.id}`)
      toast.success(`Expense "${expense.description}" deleted`)
      fetchExpenses()
    } catch {
      toast.error('Failed to delete expense')
    }
  }

  const handleSubmit = async (values: any) => {
    try {
      const usingFormData = !!receiptFile || removeReceipt
      if (usingFormData) {
        const fd = new FormData()
        fd.append('date', new Date(values.date).toISOString())
        fd.append('category', values.category)
        fd.append('description', values.description)
        fd.append('amount', String(values.amount))
        fd.append('paymentMode', String(values.paymentMode ?? 'CASH').toUpperCase())
        if (receiptFile) fd.append('receipt', receiptFile)
        // Empty string signals the backend to clear the existing receipt URL
        // (and delete the R2 object). New file overrides this.
        if (removeReceipt && !receiptFile) fd.append('receiptImage', '')
        if (editingExpense) await api.patch(`/expenses/${editingExpense.id}`, fd)
        else await api.post('/expenses', fd)
      } else {
        const payload = {
          date: new Date(values.date).toISOString(),
          category: values.category,
          description: values.description,
          amount: values.amount,
          paymentMode: String(values.paymentMode ?? 'CASH').toUpperCase(),
        }
        if (editingExpense) await api.patch(`/expenses/${editingExpense.id}`, payload)
        else await api.post('/expenses', payload)
      }
      toast.success(
        editingExpense
          ? 'Expense updated successfully'
          : `Expense of ${formatCurrency(values.amount)} added`,
      )
      form.reset()
      resetReceiptState()
      setDialogOpen(false)
      // Refresh the current page from the server so totals + breakdown stay
      // consistent (local-state patching is impossible with server pagination).
      fetchExpenses()
    } catch {
      toast.error('Failed to save expense')
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="space-y-5"
    >
      {/* ── Loading / Error states ── */}
      {isLoading && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <Card key={i} className="border-l-[3px] border-l-muted">
                <CardContent className="flex items-center gap-4 p-4">
                  <div className="h-10 w-10 shrink-0 rounded-xl bg-muted animate-pulse" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="h-3 w-20 rounded bg-muted animate-pulse" />
                    <div className="h-5 w-28 rounded bg-muted animate-pulse" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <Card className="overflow-x-auto rounded-2xl border-border/60">
            <CardContent className="p-0">
              <div className="divide-y divide-border/40">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="flex items-center gap-4 px-4 py-3">
                    <div className="h-4 w-20 rounded bg-muted animate-pulse" />
                    <div className="h-5 w-24 rounded bg-muted animate-pulse" />
                    <div className="h-4 flex-1 rounded bg-muted animate-pulse" />
                    <div className="h-4 w-16 rounded bg-muted animate-pulse" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
      {fetchError && !isLoading && (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
          <Receipt className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">Failed to load expenses.</p>
          <Button variant="outline" size="sm" onClick={fetchExpenses}>Retry</Button>
        </div>
      )}

      {/* ── Main content (hidden while loading / errored) ── */}
      {!isLoading && !fetchError && <>

      {/* ── Monthly Summary Cards ── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: 'This Month',
            value: formatCurrencyCompact(monthlySummary.thisMonthTotal),
            tooltip: formatCurrency(monthlySummary.thisMonthTotal),
            icon: Receipt,
            iconBg: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
            borderAccent: 'border-l-rose-500',
            valueClass: 'text-rose-600 dark:text-rose-400',
          },
          {
            label: 'Last Month',
            value: formatCurrencyCompact(monthlySummary.lastMonthTotal),
            tooltip: formatCurrency(monthlySummary.lastMonthTotal),
            icon: Receipt,
            iconBg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
            borderAccent: 'border-l-blue-500',
            valueClass: '',
          },
          {
            label: 'Difference',
            value: `${monthlySummary.difference >= 0 ? '+' : ''}${formatCurrencyCompact(monthlySummary.difference)}`,
            tooltip: formatCurrency(monthlySummary.difference),
            icon: monthlySummary.difference >= 0 ? TrendingUp : TrendingDown,
            iconBg: monthlySummary.difference >= 0
              ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
              : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
            borderAccent: monthlySummary.difference >= 0 ? 'border-l-rose-500' : 'border-l-emerald-500',
            valueClass: monthlySummary.difference >= 0
              ? 'text-rose-600 dark:text-rose-400'
              : 'text-emerald-600 dark:text-emerald-400',
          },
          {
            label: 'Average Expense',
            value: formatCurrencyCompact(monthlySummary.average),
            tooltip: formatCurrency(monthlySummary.average),
            icon: Calculator,
            iconBg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
            borderAccent: 'border-l-amber-500',
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
                <p
                  className={cn('text-lg font-bold font-mono leading-tight truncate', stat.valueClass)}
                  title={stat.tooltip}
                >
                  {stat.value}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Filters + actions row ── */}
      <DataTableFilterBar
        searchQuery={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search expenses..."
        resultsCount={total}
        activeFilterCount={
          (categoryFilter !== 'all' ? 1 : 0) + (paymentModeFilter !== 'all' ? 1 : 0)
        }
        onClearFilters={() => {
          setCategoryFilter('all')
          setPaymentModeFilter('all')
        }}
        actionNode={
          <div className="flex items-center gap-1.5">
            <div className="flex items-center rounded-xl border border-border/60 p-1">
              <Button
                variant={viewMode === 'table' ? 'default' : 'ghost'}
                size="sm"
                className="h-7 px-2"
                onClick={() => setViewMode('table')}
              >
                <TableProperties className="mr-1 h-4 w-4" />
                Table
              </Button>
              <Button
                variant={viewMode === 'chart' ? 'default' : 'ghost'}
                size="sm"
                className="h-7 px-2"
                onClick={() => setViewMode('chart')}
              >
                <BarChart3 className="mr-1 h-4 w-4" />
                Chart
              </Button>
            </div>
            <Button size="sm" onClick={handleOpenAdd}>
              <Plus className="mr-1 h-4 w-4" />
              Add Expense
            </Button>
          </div>
        }
      >
        <EnumSelect
          label="Category"
          value={categoryFilter}
          onValueChange={setCategoryFilter}
          onClear={() => setCategoryFilter('all')}
          options={[
            { label: 'All Categories', value: 'all' },
            ...expenseCategories.map((cat) => ({ label: cat, value: cat })),
          ]}
        />
        <EnumSelect
          label="Payment Mode"
          value={paymentModeFilter}
          onValueChange={setPaymentModeFilter}
          onClear={() => setPaymentModeFilter('all')}
          options={[
            { label: 'All Modes', value: 'all' },
            ...paymentModes.map((m) => ({ label: m, value: m })),
          ]}
        />
      </DataTableFilterBar>

      {/* ── Expenses Table (viewMode === 'table') ── */}
      {viewMode === 'table' && (
      <Card className="overflow-x-auto rounded-2xl border-border/60">
        <CardContent className="p-0">
          {/* Mobile card list */}
          <div className="md:hidden">
            {expenses.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/50">
                  <Receipt className="h-6 w-6 text-muted-foreground" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium">No expenses yet</p>
                  <p className="text-xs text-muted-foreground max-w-sm px-4">
                    Recorded expenses appear here. Add one to start tracking.
                  </p>
                </div>
                <Button size="sm" onClick={handleOpenAdd}>
                  <Plus className="mr-1 h-4 w-4" />
                  Add Expense
                </Button>
              </div>
            )}
            <div className="divide-y divide-border/40">
              {expenses.map((expense) => (
                <div key={expense.id} className="flex items-start justify-between gap-2 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">
                      <span className="inline-flex items-center gap-1.5 align-middle">
                        {expense.description}
                        {expense.receiptImage && (
                          <a
                            href={expense.receiptImage}
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
                      <Badge variant={categoryBadgeVariant[expense.category] || 'secondary'} size="sm" dot>
                        {expense.category}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">{expense.paymentMode}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{formatDate(expense.date)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-mono text-sm font-semibold text-rose-600 dark:text-rose-400">
                      {formatCurrency(expense.amount)}
                    </p>
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
                    Date
                  </span>
                </TableHead>
                <TableHead>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Category
                  </span>
                </TableHead>
                <TableHead>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Description
                  </span>
                </TableHead>
                <TableHead className="text-right">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Amount
                  </span>
                </TableHead>
                <TableHead>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Payment Mode
                  </span>
                </TableHead>
                <TableHead className="text-right">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Actions
                  </span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {expenses.map((expense) => (
                <TableRow key={expense.id}>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {formatDate(expense.date)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={categoryBadgeVariant[expense.category] || 'secondary'}
                      size="sm"
                      dot
                    >
                      {expense.category}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      {expense.description}
                      {expense.receiptImage && (
                        <a
                          href={expense.receiptImage}
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
                  <TableCell className="text-right font-mono text-sm font-semibold text-rose-600 dark:text-rose-400">
                    {formatCurrency(expense.amount)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{expense.paymentMode}</TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <DataTableRowActions
                      customActions={[
                        {
                          label: 'Edit',
                          icon: <Pencil className="h-4 w-4" />,
                          onClick: () => handleOpenEdit(expense),
                        },
                        {
                          label: 'Delete',
                          icon: <Trash2 className="h-4 w-4" />,
                          onClick: () => handleDelete(expense),
                          variant: 'destructive',
                        },
                      ]}
                    />
                  </TableCell>
                </TableRow>
              ))}
              {expenses.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="p-0">
                    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/50">
                        <Receipt className="h-6 w-6 text-muted-foreground" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-medium">No expenses yet</p>
                        <p className="text-xs text-muted-foreground max-w-sm">
                          Recorded expenses appear here. Add one to start tracking.
                        </p>
                      </div>
                      <Button size="sm" onClick={handleOpenAdd}>
                        <Plus className="mr-1 h-4 w-4" />
                        Add Expense
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          </div>
          <DataTablePagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            totalItems={total}
            itemsPerPage={PAGE_SIZE}
            className="border-t border-border/40 px-4"
          />
        </CardContent>
      </Card>
      )}

      {/* ── Chart view (viewMode === 'chart') ── */}
      {viewMode === 'chart' && (
        <Card className="rounded-2xl border-border/60">
          <CardHeader>
            <CardTitle className="text-base">Category Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {categoryBreakdown.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/50">
                  <BarChart3 className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">No expense data to chart for the current filter.</p>
              </div>
            ) : (
              categoryBreakdown.map(({ category, total: catTotal }) => (
                <div key={category} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{category}</span>
                    <span className="font-mono font-semibold text-rose-600 dark:text-rose-400">
                      {formatCurrency(catTotal)}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-muted/60 dark:bg-muted/30 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-rose-500/70 dark:bg-rose-500/50 transition-all duration-500"
                      style={{ width: `${(catTotal / maxCategoryTotal) * 100}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}

      </>}

      {/* ─── Add/Edit Expense Dialog ─── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>{editingExpense ? 'Edit Expense' : 'Add Expense'}</DialogTitle>
            <DialogDescription>
              {editingExpense ? 'Update the expense details.' : 'Record a new expense.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="exp-date">Date</Label>
              <Controller
                control={form.control}
                name="date"
                render={({ field }) => (
                  <DatePicker id="exp-date" value={field.value} onChange={field.onChange} className="rounded-xl" />
                )}
              />
              {form.formState.errors.date && (
                <p className="text-xs text-destructive">{form.formState.errors.date.message}</p>
              )}
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
              <Label htmlFor="exp-desc">Description</Label>
              <Input
                id="exp-desc"
                {...form.register('description')}
                placeholder="Expense description"
                className="rounded-xl"
              />
              {form.formState.errors.description && (
                <p className="text-xs text-destructive">{form.formState.errors.description.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="exp-amount">Amount</Label>
              <Input
                id="exp-amount"
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
              <Label>Payment Mode</Label>
              <Controller
                control={form.control}
                name="paymentMode"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {paymentModes.map((mode) => (
                        <SelectItem key={mode} value={mode}>
                          {mode}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
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
              ) : existingReceiptUrl && !removeReceipt ? (
                <div className="flex items-center gap-2 rounded-lg border border-input bg-muted/30 px-3 py-2">
                  <a
                    href={existingReceiptUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 flex-1 min-w-0 hover:underline"
                  >
                    <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-xs truncate">View current receipt</span>
                  </a>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7"
                    onClick={() => receiptInputRef.current?.click()}
                  >
                    Replace
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-rose-600 hover:text-rose-700"
                    onClick={() => setRemoveReceipt(true)}
                  >
                    Remove
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
                  setRemoveReceipt(false)
                }}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="rounded-xl">
                Cancel
              </Button>
              <Button type="submit" className="rounded-xl">
                {editingExpense ? 'Update' : 'Save'} Expense
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
