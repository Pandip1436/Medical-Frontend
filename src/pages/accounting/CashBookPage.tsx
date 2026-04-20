import { useState, useMemo, useEffect, useCallback } from 'react'
import { useBranchRefresh } from '@/hooks/useBranchRefresh'
import api from '@/lib/api'
import { motion } from 'framer-motion'
import { useForm, Controller } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import {
  Plus,
  CalendarDays,
  ArrowDownLeft,
  ArrowUpRight,
  Wallet,
  BookOpen,
  Search,
} from 'lucide-react'

import { DataTableFilterBar } from '@/components/shared/DataTableFilterBar'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { cn, formatCurrency, generateId } from '@/lib/utils'

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
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split('T')[0]
  )
  const [searchQuery, setSearchQuery] = useState('')
  const [addExpenseOpen, setAddExpenseOpen] = useState(false)
  const [extraExpenses, setExtraExpenses] = useState<CashTransaction[]>([])
  const [apiTransactions, setApiTransactions] = useState<CashTransaction[]>([])
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
        }))
        setApiTransactions(mapped)
      })
      .catch(() => { if (!cancelled) setApiTransactions([]) })
      .finally(() => { if (!cancelled) setIsLoading(false) })
    return () => { cancelled = true }
  }, [selectedDate])

  useEffect(() => { return fetchCashbook() }, [fetchCashbook])
  useBranchRefresh(fetchCashbook)

  const transactions = useMemo(() => {
    const txns = [...apiTransactions, ...extraExpenses]
    txns.sort((a, b) => a.time.localeCompare(b.time))
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      return txns.filter(
        (t) =>
          t.particular.toLowerCase().includes(q) || t.refNumber.toLowerCase().includes(q),
      )
    }
    return txns
  }, [apiTransactions, extraExpenses, searchQuery])

  // Summary calculations
  const summary = useMemo(() => {
    const openingBalance = 125000 // Mock opening balance
    const cashIn = transactions.reduce((sum, t) => sum + t.debit, 0)
    const cashOut = transactions.reduce((sum, t) => sum + t.credit, 0)
    const closingBalance = openingBalance + cashIn - cashOut
    return { openingBalance, cashIn, cashOut, closingBalance }
  }, [transactions])

  // Compute running balance column
  const transactionsWithBalance = useMemo(() => {
    let balance = summary.openingBalance
    return transactions.map((t) => {
      balance += t.debit - t.credit
      return { ...t, balance }
    })
  }, [transactions, summary.openingBalance])

  // Expense form
  const form = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      date: selectedDate,
      category: '',
      description: '',
      amount: 0,
      paymentMode: 'Cash',
    },
  })

  const handleAddExpense = (values: any) => {
    const newTxn: CashTransaction = {
      id: generateId('TXN'),
      time: new Date().toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
      }),
      particular: `${values.category} - ${values.description}`,
      type: 'Expense',
      refNumber: generateId('EXP'),
      debit: 0,
      credit: values.amount,
    }
    setExtraExpenses((prev) => [...prev, newTxn])
    toast.success(`Expense of ${formatCurrency(values.amount)} added to cash book`)
    form.reset({ date: selectedDate, category: '', description: '', amount: 0, paymentMode: 'Cash' })
    setAddExpenseOpen(false)
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
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="space-y-6"
    >
      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cash Book</h1>
          <p className="text-sm text-muted-foreground">
            Daily cash flow register
          </p>
        </div>
        <Button onClick={() => setAddExpenseOpen(true)}>
          <Plus className="mr-1 h-4 w-4" />
          Add Expense
        </Button>
      </div>

      {/* ── Search + Filter Row ── */}
      <DataTableFilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search particulars or ref#..."
        resultsCount={transactions.length}
      >
        <div className="space-y-1.5">
          <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Current Date
          </Label>
          <div className="relative">
            <CalendarDays className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="h-9 pl-9 text-xs"
            />
          </div>
        </div>
      </DataTableFilterBar>

      {/* ── Summary Cards ── */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Opening Balance */}
        <Card className="rounded-2xl border-border/60">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Opening Balance
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/60 dark:bg-muted/30">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">
              {formatCurrency(summary.openingBalance)}
            </div>
          </CardContent>
        </Card>

        {/* Cash In */}
        <Card className="rounded-2xl border-border/60">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Cash In
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 dark:bg-emerald-500/20">
              <ArrowDownLeft className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
              {formatCurrency(summary.cashIn)}
            </div>
          </CardContent>
        </Card>

        {/* Cash Out */}
        <Card className="rounded-2xl border-border/60">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Cash Out
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/10 dark:bg-rose-500/20">
              <ArrowUpRight className="h-4 w-4 text-rose-600 dark:text-rose-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-rose-600 dark:text-rose-400">
              {formatCurrency(summary.cashOut)}
            </div>
          </CardContent>
        </Card>

        {/* Closing Balance */}
        <Card className="rounded-2xl border-border/60">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Closing Balance
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/60 dark:bg-muted/30">
              <Wallet className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <div
              className={cn(
                'text-2xl font-bold font-mono',
                summary.closingBalance >= 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-rose-600 dark:text-rose-400'
              )}
            >
              {formatCurrency(summary.closingBalance)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Receipt-tape Summary ── */}
      <Card className="rounded-2xl border-border/60 max-w-sm">
        <CardContent className="p-4 space-y-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Day Summary
          </span>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Opening</span>
            <span className="font-mono">{formatCurrency(summary.openingBalance)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-emerald-600 dark:text-emerald-400">+ Cash In</span>
            <span className="font-mono text-emerald-600 dark:text-emerald-400">
              {formatCurrency(summary.cashIn)}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-rose-600 dark:text-rose-400">- Cash Out</span>
            <span className="font-mono text-rose-600 dark:text-rose-400">
              {formatCurrency(summary.cashOut)}
            </span>
          </div>
          <div className="border-t border-dashed border-border/60 pt-2 flex justify-between text-sm font-bold">
            <span>Closing</span>
            <span
              className={cn(
                'font-mono',
                summary.closingBalance >= 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-rose-600 dark:text-rose-400'
              )}
            >
              {formatCurrency(summary.closingBalance)}
            </span>
          </div>
        </CardContent>
      </Card>

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
            {!isLoading && transactionsWithBalance.length === 0 && (
              <div className="py-8 text-center text-muted-foreground text-sm">
                No transactions for this date
              </div>
            )}
            <div className="divide-y divide-border/40">
              {!isLoading && transactionsWithBalance.map((txn) => (
                <div key={txn.id} className="flex items-start justify-between gap-2 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{txn.particular}</p>
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
                    Debit (In)
                  </span>
                </TableHead>
                <TableHead className="text-right">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Credit (Out)
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
              {!isLoading && transactionsWithBalance.map((txn) => (
                <TableRow key={txn.id}>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {txn.time}
                  </TableCell>
                  <TableCell className="text-sm font-medium">{txn.particular}</TableCell>
                  <TableCell>{typeBadge(txn.type)}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {txn.refNumber}
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
              {!isLoading && transactionsWithBalance.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No transactions for this date
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          </div>
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
              <Input id="date" type="date" {...form.register('date')} className="rounded-xl" />
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
                      <SelectItem value="Cash">Cash</SelectItem>
                      <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                      <SelectItem value="UPI">UPI</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
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
