import { useState, useMemo } from 'react'
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
} from 'lucide-react'
import { DataTableRowActions } from '@/components/shared/DataTableRowActions'
import { DataTableFilterBar } from '@/components/shared/DataTableFilterBar'
import { EnumSelect } from '@/components/shared/EnumSelect'

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
import { mockExpenses } from '@/data/mock'
import { cn, formatCurrency, formatDate, generateId } from '@/lib/utils'
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
  Rent: 'default',
  Salary: 'warning',
  Electricity: 'destructive',
  Transport: 'info',
  Insurance: 'outline',
  Maintenance: 'success',
  'Telephone & Internet': 'purple',
  'Stationery & Printing': 'outline',
  'Software & IT': 'info',
  'License & Compliance': 'warning',
  Miscellaneous: 'secondary',
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

const paymentModes = ['Cash', 'Bank Transfer', 'UPI', 'Cheque']

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>(mockExpenses)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)

  // Filters
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')

  // Monthly summaries
  const monthlySummary = useMemo(() => {
    const now = new Date()
    const thisMonth = now.getMonth()
    const thisYear = now.getFullYear()
    const lastMonth = thisMonth === 0 ? 11 : thisMonth - 1
    const lastMonthYear = thisMonth === 0 ? thisYear - 1 : thisYear

    const thisMonthTotal = expenses
      .filter((e) => {
        const d = new Date(e.date)
        return d.getMonth() === thisMonth && d.getFullYear() === thisYear
      })
      .reduce((sum, e) => sum + e.amount, 0)

    const lastMonthTotal = expenses
      .filter((e) => {
        const d = new Date(e.date)
        return d.getMonth() === lastMonth && d.getFullYear() === lastMonthYear
      })
      .reduce((sum, e) => sum + e.amount, 0)

    const difference = thisMonthTotal - lastMonthTotal
    const average = expenses.length > 0
      ? expenses.reduce((sum, e) => sum + e.amount, 0) / expenses.length
      : 0

    return { thisMonthTotal, lastMonthTotal, difference, average }
  }, [expenses])

  // Category breakdown
  const categoryBreakdown = useMemo(() => {
    const breakdown: Record<string, number> = {}
    for (const exp of expenses) {
      breakdown[exp.category] = (breakdown[exp.category] || 0) + exp.amount
    }
    // Sort by amount descending
    return Object.entries(breakdown)
      .map(([category, total]) => ({ category, total }))
      .sort((a, b) => b.total - a.total)
  }, [expenses])

  const maxCategoryTotal = categoryBreakdown.length > 0 ? categoryBreakdown[0].total : 1

  // Form
  const form = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      date: new Date().toISOString().split('T')[0],
      category: '',
      description: '',
      amount: 0,
      paymentMode: 'Cash',
    },
  })

  const handleOpenAdd = () => {
    setEditingExpense(null)
    form.reset({
      date: new Date().toISOString().split('T')[0],
      category: '',
      description: '',
      amount: 0,
      paymentMode: 'Cash',
    })
    setDialogOpen(true)
  }

  const handleOpenEdit = (expense: Expense) => {
    setEditingExpense(expense)
    form.reset({
      date: new Date(expense.date).toISOString().split('T')[0],
      category: expense.category,
      description: expense.description,
      amount: expense.amount,
      paymentMode: expense.paymentMode,
    })
    setDialogOpen(true)
  }

  const handleDelete = (expense: Expense) => {
    setExpenses((prev) => prev.filter((e) => e.id !== expense.id))
    toast.success(`Expense "${expense.description}" deleted`)
  }

  const handleSubmit = (values: any) => {
    if (editingExpense) {
      // Update
      setExpenses((prev) =>
        prev.map((e) =>
          e.id === editingExpense.id
            ? {
                ...e,
                date: new Date(values.date).toISOString(),
                category: values.category,
                description: values.description,
                amount: values.amount,
                paymentMode: values.paymentMode,
              }
            : e
        )
      )
      toast.success(`Expense updated successfully`)
    } else {
      // Add
      const newExpense: Expense = {
        id: generateId('EXP'),
        date: new Date(values.date).toISOString(),
        category: values.category,
        description: values.description,
        amount: values.amount,
        paymentMode: values.paymentMode,
      }
      setExpenses((prev) => [newExpense, ...prev])
      toast.success(`Expense of ${formatCurrency(values.amount)} added`)
    }
    form.reset()
    setDialogOpen(false)
  }

  // Filtered and sorted expenses
  const filteredExpenses = useMemo(() => {
    let result = [...expenses]

    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (e) =>
          e.description.toLowerCase().includes(q) ||
          e.category.toLowerCase().includes(q)
      )
    }

    if (categoryFilter !== 'all') {
      result = result.filter((e) => e.category === categoryFilter)
    }

    return result.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    )
  }, [expenses, search, categoryFilter])

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
          <h1 className="text-2xl font-bold tracking-tight">Expenses</h1>
          <p className="text-sm text-muted-foreground">
            Track and manage business expenses
          </p>
        </div>
        <Button onClick={handleOpenAdd}>
          <Plus className="mr-1 h-4 w-4" />
          Add Expense
        </Button>
      </div>

      {/* ── Monthly Summary Cards ── */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* This Month */}
        <Card className="rounded-2xl border-border/60">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              This Month
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/10 dark:bg-rose-500/20">
              <Receipt className="h-4 w-4 text-rose-600 dark:text-rose-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-rose-600 dark:text-rose-400">
              {formatCurrency(monthlySummary.thisMonthTotal)}
            </div>
          </CardContent>
        </Card>

        {/* Last Month */}
        <Card className="rounded-2xl border-border/60">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Last Month
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/60 dark:bg-muted/30">
              <Receipt className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">
              {formatCurrency(monthlySummary.lastMonthTotal)}
            </div>
          </CardContent>
        </Card>

        {/* Difference */}
        <Card className="rounded-2xl border-border/60">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Difference
            </CardTitle>
            {monthlySummary.difference >= 0 ? (
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/10 dark:bg-rose-500/20">
                <TrendingUp className="h-4 w-4 text-rose-600 dark:text-rose-400" />
              </div>
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 dark:bg-emerald-500/20">
                <TrendingDown className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
            )}
          </CardHeader>
          <CardContent>
            <div
              className={cn(
                'text-2xl font-bold font-mono',
                monthlySummary.difference >= 0
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-emerald-600 dark:text-emerald-400'
              )}
            >
              {monthlySummary.difference >= 0 ? '+' : ''}
              {formatCurrency(monthlySummary.difference)}
            </div>
          </CardContent>
        </Card>

        {/* Average Expense */}
        <Card className="rounded-2xl border-border/60">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Average Expense
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/60 dark:bg-muted/30">
              <Calculator className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">
              {formatCurrency(monthlySummary.average)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Filters ── */}
      <DataTableFilterBar
        searchQuery={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search expenses..."
        resultsCount={filteredExpenses.length}
        activeFilterCount={categoryFilter !== 'all' ? 1 : 0}
        onClearFilters={() => setCategoryFilter('all')}
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
      </DataTableFilterBar>

      {/* ── Expenses Table ── */}
      <Card className="overflow-hidden rounded-2xl border-border/60">
        <CardContent className="p-0">
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
              {filteredExpenses.map((expense) => (
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
                  <TableCell className="text-sm font-medium">{expense.description}</TableCell>
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
              {filteredExpenses.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No expenses found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── Category Breakdown ── */}
      <Card className="rounded-2xl border-border/60">
        <CardHeader>
          <CardTitle className="text-base">Category Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {categoryBreakdown.map(({ category, total }) => (
            <div key={category} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{category}</span>
                <span className="font-mono font-semibold text-rose-600 dark:text-rose-400">
                  {formatCurrency(total)}
                </span>
              </div>
              <div className="h-2 rounded-full bg-muted/60 dark:bg-muted/30 overflow-hidden">
                <div
                  className="h-full rounded-full bg-rose-500/70 dark:bg-rose-500/50 transition-all duration-500"
                  style={{
                    width: `${(total / maxCategoryTotal) * 100}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

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
              <Input id="exp-date" type="date" {...form.register('date')} className="rounded-xl" />
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
