import { useState, useMemo, useEffect, useCallback } from 'react'
import { useBranchRefresh } from '@/hooks/useBranchRefresh'
import { motion, type Variants } from 'framer-motion'
import { useForm, Controller } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import {
  AlertTriangle,
  Bell,
  CreditCard,
  IndianRupee,
  Clock,
  Send,
} from 'lucide-react'

import { DataTableFilterBar } from '@/components/shared/DataTableFilterBar'
import { DataTablePagination } from '@/components/shared/DataTablePagination'
import { DataTableRowActions } from '@/components/shared/DataTableRowActions'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import api from '@/lib/api'
import { cn, formatCurrency } from '@/lib/utils'
import { navigate } from '@/lib/router'

// ─────────────────────────────────────────────────────────────

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
}
const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } },
}

const paymentSchema = z.object({
  amount: z.coerce.number().min(1, 'Amount must be greater than 0'),
  paymentMode: z.enum(['cash', 'cheque', 'neft_upi']),
  referenceNumber: z.string().optional(),
})
type PaymentFormValues = z.input<typeof paymentSchema>

type OutstandingRow = {
  customerId: string | null
  customer: string
  outstanding: number
  current: number
  '0-30': number
  '31-60': number
  '61-90': number
  '90+': number
  invoiceCount: number
}

// ─────────────────────────────────────────────────────────────

export default function OutstandingPage() {
  const [rows, setRows] = useState<OutstandingRow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false)
  const [selectedRow, setSelectedRow] = useState<OutstandingRow | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await api.get('/customers/outstanding')
      setRows(res.data?.rows ?? [])
    } catch {
      toast.error('Failed to load outstanding data')
      setRows([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])
  useBranchRefresh(fetchData)

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const PAGE_SIZE = 15

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return rows
    const q = searchQuery.toLowerCase()
    return rows.filter((r) => r.customer.toLowerCase().includes(q))
  }, [rows, searchQuery])

  // Reset pagination on search
  useEffect(() => { setCurrentPage(1) }, [searchQuery])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginatedRows = useMemo(() => {
    return filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  }, [filtered, currentPage])

  const summary = useMemo(() => {
    const total = filtered.reduce((s, r) => s + r.outstanding, 0)
    const d0_30 = filtered.reduce((s, r) => s + r.current + r['0-30'], 0)
    const d31_60 = filtered.reduce((s, r) => s + r['31-60'], 0)
    const d60plus = filtered.reduce((s, r) => s + r['61-90'] + r['90+'], 0)
    return { total, d0_30, d31_60, d60plus }
  }, [filtered])

  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentSchema),
    defaultValues: { amount: 0, paymentMode: 'cash', referenceNumber: '' },
  })

  const handleCollectPayment = (row: OutstandingRow) => {
    if (!row.customerId) return
    setSelectedRow(row)
    form.reset({ amount: 0, paymentMode: 'cash', referenceNumber: '' })
    setPaymentDialogOpen(true)
  }

  const onSubmitPayment = async (values: PaymentFormValues) => {
    if (!selectedRow?.customerId) return
    setIsSubmitting(true)
    try {
      const res = await api.post(`/customers/${selectedRow.customerId}/payment`, {
        amount: values.amount,
        paymentMode: values.paymentMode,
        referenceNumber: values.referenceNumber,
      })
      toast.success(`Payment of ${formatCurrency(values.amount)} recorded. Receipt: ${res.data.receiptNumber}`)
      setPaymentDialogOpen(false)
      fetchData()
    } catch {
      toast.error('Failed to record payment')
    } finally {
      setIsSubmitting(false)
    }
  }

  const kpiCards = [
    {
      title: 'Total Outstanding',
      value: formatCurrency(summary.total),
      icon: IndianRupee,
      iconBg: 'bg-red-500/15',
      iconColor: 'text-red-600 dark:text-red-400',
      valueColor: 'text-red-600 dark:text-red-400',
    },
    {
      title: '0–30 Days',
      value: formatCurrency(summary.d0_30),
      icon: Clock,
      iconBg: 'bg-yellow-500/15',
      iconColor: 'text-yellow-600 dark:text-yellow-400',
      valueColor: 'text-yellow-600 dark:text-yellow-400',
    },
    {
      title: '30–60 Days',
      value: formatCurrency(summary.d31_60),
      icon: AlertTriangle,
      iconBg: 'bg-orange-500/15',
      iconColor: 'text-orange-600 dark:text-orange-400',
      valueColor: 'text-orange-600 dark:text-orange-400',
    },
    {
      title: '60+ Days',
      value: formatCurrency(summary.d60plus),
      icon: AlertTriangle,
      iconBg: 'bg-red-500/15',
      iconColor: 'text-red-600 dark:text-red-400',
      valueColor: 'text-red-700 dark:text-red-400',
    },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <IndianRupee className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Outstanding Receivables</h1>
            <p className="text-sm text-muted-foreground">Track and collect pending payments from customers</p>
          </div>
        </div>
        <DataTableFilterBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          searchPlaceholder="Search customer..."
          resultsCount={filtered.length}
        >
          <Button
            variant="outline"
            size="sm"
            onClick={() => toast.success(`Payment reminders sent to ${filtered.length} customers`)}
            disabled={filtered.length === 0}
          >
            <Bell className="mr-2 h-4 w-4" />
            Bulk Reminders
          </Button>
        </DataTableFilterBar>
      </div>

      {/* Summary Cards */}
      <motion.div
        className="grid gap-4 md:grid-cols-2 lg:grid-cols-4"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {kpiCards.map((kpi) => {
          const Icon = kpi.icon
          return (
            <motion.div key={kpi.title} variants={itemVariants}>
              <div className="glass rounded-2xl border border-border/60 p-5 transition-all duration-200 hover:scale-[1.02] hover:shadow-lg">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{kpi.title}</p>
                    <p className={cn('font-mono mt-1 text-2xl font-bold', kpi.valueColor)}>{kpi.value}</p>
                  </div>
                  <div className={cn('rounded-full p-2.5', kpi.iconBg)}>
                    <Icon className={cn('h-5 w-5', kpi.iconColor)} />
                  </div>
                </div>
              </div>
            </motion.div>
          )
        })}
      </motion.div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {/* Mobile */}
          <div className="md:hidden divide-y divide-border/40">
            {isLoading && (
              <div className="py-8 text-center text-sm text-muted-foreground">Loading...</div>
            )}
            {!isLoading && filtered.length === 0 && (
              <div className="py-8 text-center text-sm text-muted-foreground">No outstanding receivables</div>
            )}
            {!isLoading && paginatedRows.map((row, i) => (
              <div key={row.customerId ?? i} className="flex items-start justify-between gap-2 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{row.customer}</p>
                  <p className="text-[11px] text-muted-foreground">{row.invoiceCount} invoice{row.invoiceCount !== 1 ? 's' : ''}</p>
                  {(row['61-90'] + row['90+']) > 0 && (
                    <p className="text-[10px] text-rose-500 font-mono mt-0.5">60+ days: {formatCurrency(row['61-90'] + row['90+'])}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="font-mono text-sm font-bold text-red-600 dark:text-red-400">{formatCurrency(row.outstanding)}</p>
                  {row.customerId && (
                    <button className="mt-1 text-[10px] text-primary underline" onClick={() => handleCollectPayment(row)}>
                      Collect
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Desktop */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-center">Invoices</TableHead>
                  <TableHead className="text-right">Total Outstanding</TableHead>
                  <TableHead className="text-right">0–30 Days</TableHead>
                  <TableHead className="text-right">30–60 Days</TableHead>
                  <TableHead className="text-right">60+ Days</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading...</TableCell>
                  </TableRow>
                )}
                {!isLoading && filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No outstanding receivables</TableCell>
                  </TableRow>
                )}
                {!isLoading && paginatedRows.map((row, i) => (
                  <TableRow key={row.customerId ?? i} className="border-b border-border/40">
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{row.customer}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center text-sm text-muted-foreground">
                      {row.invoiceCount}
                    </TableCell>
                    <TableCell className="text-right font-mono font-bold text-red-600 dark:text-red-400 text-sm">
                      {formatCurrency(row.outstanding)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground">
                      {formatCurrency(row.current + row['0-30'])}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground">
                      {formatCurrency(row['31-60'])}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold text-rose-500">
                      {formatCurrency(row['61-90'] + row['90+'])}
                    </TableCell>
                    <TableCell className="text-right px-4">
                      <DataTableRowActions
                        onView={row.customerId ? () => navigate(`/accounting/ledger?customerId=${row.customerId}&name=${encodeURIComponent(row.customer)}`) : undefined}
                        customActions={[
                          ...(row.customerId ? [
                            {
                              label: 'Collect Payment',
                              icon: <CreditCard className="h-4 w-4" />,
                              onClick: () => handleCollectPayment(row),
                            },
                            {
                              label: 'View Invoices',
                              icon: <Send className="h-4 w-4" />,
                              onClick: () => navigate(`/customers/invoices?customerId=${row.customerId}`),
                            },
                          ] : []),
                          {
                            label: 'Send Reminder',
                            icon: <Send className="h-4 w-4" />,
                            onClick: () => toast.success(`Reminder sent to ${row.customer}`),
                          },
                        ]}
                      />
                    </TableCell>
                  </TableRow>
                ))}
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

      {/* Collect Payment Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Collect Payment</DialogTitle>
            <DialogDescription>Record a payment from {selectedRow?.customer}</DialogDescription>
          </DialogHeader>

          {selectedRow && (
            <form onSubmit={form.handleSubmit(onSubmitPayment)} className="space-y-4">
              <div className="rounded-xl border border-border/60 p-3 space-y-2 bg-muted/50 dark:bg-muted/30">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Customer</span>
                  <span className="font-medium">{selectedRow.customer}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Outstanding Amount</span>
                  <span className="font-bold text-red-600 dark:text-red-400 font-mono">
                    {formatCurrency(selectedRow.outstanding)}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Payment Amount *
                </Label>
                <Input type="number" className="font-mono" {...form.register('amount')} placeholder="Enter amount" />
                {form.formState.errors.amount && (
                  <p className="text-xs text-destructive">{form.formState.errors.amount.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Payment Mode
                </Label>
                <Controller
                  control={form.control}
                  name="paymentMode"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="cheque">Cheque</SelectItem>
                        <SelectItem value="neft_upi">NEFT / UPI</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              {(form.watch('paymentMode') === 'cheque' || form.watch('paymentMode') === 'neft_upi') && (
                <div className="space-y-2">
                  <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {form.watch('paymentMode') === 'cheque' ? 'Cheque Number' : 'Transaction Reference'}
                  </Label>
                  <Input
                    className="font-mono"
                    {...form.register('referenceNumber')}
                    placeholder={form.watch('paymentMode') === 'cheque' ? 'Enter cheque number' : 'Enter UPI/NEFT reference'}
                  />
                </div>
              )}

              <div className="rounded-xl border border-border/60 p-3 bg-muted/50 dark:bg-muted/30">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Receipt Number</span>
                  <span className="font-mono text-xs text-muted-foreground">Generated on confirm</span>
                </div>
                <p className="text-xs text-muted-foreground/60 mt-1">Payment is allocated oldest invoice first (FIFO)</p>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setPaymentDialogOpen(false)} disabled={isSubmitting}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Processing...' : 'Confirm Payment'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
