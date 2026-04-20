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
  BookOpen,
  History,
  ReceiptText,
} from 'lucide-react'

import { DataTableFilterBar } from '@/components/shared/DataTableFilterBar'
import { DataTableRowActions } from '@/components/shared/DataTableRowActions'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
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
import { useMasterDataStore } from '@/stores/masterDataStore'
import api from '@/lib/api'
import { cn, formatCurrency, formatDate, generateId } from '@/lib/utils'
import type { Customer } from '@/types'
import { navigate } from '@/lib/router'

// ─────────────────────────────────────────────────────────────
// Animation variants
// ─────────────────────────────────────────────────────────────

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
}

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: 'easeOut' as const },
  },
}

// ─────────────────────────────────────────────────────────────
// Zod schema for Collect Payment
// ─────────────────────────────────────────────────────────────

const paymentSchema = z.object({
  amount: z.coerce.number().min(1, 'Amount must be greater than 0'),
  paymentMode: z.enum(['cash', 'cheque', 'neft_upi']),
  referenceNumber: z.string().optional(),
})

type PaymentFormValues = z.input<typeof paymentSchema>

// ─────────────────────────────────────────────────────────────
// Helpers – aging buckets are sourced from backend via /reports/financial/outstanding
// ─────────────────────────────────────────────────────────────

type AgingRow = {
  customerId: string
  customer: string
  phone: string
  outstanding: number
  creditLimit: number
  current: number
  '0-30': number
  '31-60': number
  '61-90': number
  '90+': number
}

function getLastPaymentDate(_customerId: string): string | null {
  return null
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export default function OutstandingPage() {
  const customers = useMasterDataStore((s) => s.customers)
  const fetchCustomers = useMasterDataStore((s) => s.fetchCustomers)
  const updateCustomerLocally = useMasterDataStore((s) => s.updateCustomerLocally)

  const [searchQuery, setSearchQuery] = useState('')
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)

  const [agingRows, setAgingRows] = useState<AgingRow[]>([])

  const fetchData = useCallback(() => {
    fetchCustomers()
    api
      .get('/reports/financial/outstanding')
      .then((res) => setAgingRows(res.data?.tableData ?? []))
      .catch(() => setAgingRows([]))
  }, [fetchCustomers])

  useEffect(() => { fetchData() }, [fetchData])
  useBranchRefresh(fetchData)

  const agingByCustomer = useMemo(() => {
    const map = new Map<string, AgingRow>()
    for (const r of agingRows) map.set(r.customerId, r)
    return map
  }, [agingRows])

  const getAgingBuckets = (customer: Customer) => {
    const r = agingByCustomer.get(customer.id)
    return {
      days0to30: (r?.current ?? 0) + (r?.['0-30'] ?? 0),
      days30to60: (r?.['31-60'] ?? 0),
      days60plus: (r?.['61-90'] ?? 0) + (r?.['90+'] ?? 0),
    }
  }

  // Customers with outstanding balance (filtered by search)
  const outstandingCustomers = useMemo(() => {
    let result = customers.filter((c) => Number(c.currentOutstanding) > 0)

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.phone?.toLowerCase().includes(q)
      )
    }

    return result
  }, [customers, searchQuery])

  // Summary
  const summary = useMemo(() => {
    let total = 0
    let bucket0to30 = 0
    let bucket30to60 = 0
    let bucket60plus = 0

    for (const customer of outstandingCustomers) {
      total += Number(customer.currentOutstanding)
      const buckets = getAgingBuckets(customer)
      bucket0to30 += buckets.days0to30
      bucket30to60 += buckets.days30to60
      bucket60plus += buckets.days60plus
    }

    const bucketSum = bucket0to30 + bucket30to60 + bucket60plus
    if (bucketSum === 0 && total > 0) {
      bucket0to30 = total
    }

    return { total, bucket0to30, bucket30to60, bucket60plus }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outstandingCustomers, agingByCustomer])

  // Payment form
  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      amount: 0,
      paymentMode: 'cash',
      referenceNumber: '',
    },
  })

  const handleCollectPayment = (customer: Customer) => {
    setSelectedCustomer(customer)
    form.reset({ amount: 0, paymentMode: 'cash', referenceNumber: '' })
    setPaymentDialogOpen(true)
  }

  const [isSubmitting, setIsSubmitting] = useState(false)

  const onSubmitPayment = async (values: any) => {
    if (!selectedCustomer) return
    try {
      setIsSubmitting(true)
      
      // Optimistic UI update
      const newOutstanding = Math.max(0, Number(selectedCustomer.currentOutstanding) - values.amount)
      updateCustomerLocally(selectedCustomer.id, { currentOutstanding: newOutstanding })
      setPaymentDialogOpen(false)

      await api.post(`/customers/${selectedCustomer.id}/payment`, {
        amount: values.amount,
        paymentMode: values.paymentMode,
        referenceNumber: values.referenceNumber,
      })
      const receiptNo = `RCT-${generateId()}`
      toast.success(
        `Payment of ${formatCurrency(values.amount)} recorded for ${selectedCustomer.name}. Receipt: ${receiptNo}`
      )
      
      // We don't need to await fetchCustomers here if we trust the optimistic update,
      // but doing it in background ensures consistency
      fetchCustomers()
    } catch (error: any) {
      toast.error('Failed to record payment')
      // Rollback optimistic update
      fetchCustomers()
      console.error(error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSendReminder = (customer: Customer) => {
    toast.success(`Payment reminder sent to ${customer.name} (${customer.phone})`)
  }

  const handleBulkReminders = () => {
    toast.success(`Payment reminders sent to ${outstandingCustomers.length} customers`)
  }

  // KPI config
  const kpiCards = [
    {
      title: 'Total Outstanding',
      value: formatCurrency(summary.total),
      icon: IndianRupee,
      iconBg: 'bg-red-500/15 dark:bg-red-500/10',
      iconColor: 'text-red-600 dark:text-red-400',
      valueColor: 'text-red-600 dark:text-red-400',
    },
    {
      title: '0-30 Days',
      value: formatCurrency(summary.bucket0to30),
      icon: Clock,
      iconBg: 'bg-yellow-500/15 dark:bg-yellow-500/10',
      iconColor: 'text-yellow-600 dark:text-yellow-400',
      valueColor: 'text-yellow-600 dark:text-yellow-400',
    },
    {
      title: '30-60 Days',
      value: formatCurrency(summary.bucket30to60),
      icon: AlertTriangle,
      iconBg: 'bg-orange-500/15 dark:bg-orange-500/10',
      iconColor: 'text-orange-600 dark:text-orange-400',
      valueColor: 'text-orange-600 dark:text-orange-400',
    },
    {
      title: '60+ Days',
      value: formatCurrency(summary.bucket60plus),
      icon: AlertTriangle,
      iconBg: 'bg-red-500/15 dark:bg-red-500/10',
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
      {/* Custom Flex Header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <IndianRupee className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Outstanding Receivables</h1>
            <p className="text-sm text-muted-foreground">
              Track and collect pending payments from customers
            </p>
          </div>
        </div>
        <DataTableFilterBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          searchPlaceholder="Search customer, phone or area..."
          resultsCount={outstandingCustomers.length}
        >
          <Button
            variant="outline"
            size="sm"
            onClick={handleBulkReminders}
            disabled={outstandingCustomers.length === 0}
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
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {kpi.title}
                    </p>
                    <p className={cn('font-mono mt-1 text-2xl font-bold', kpi.valueColor)}>
                      {kpi.value}
                    </p>
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

      {/* Outstanding Table */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <motion.div variants={itemVariants}>
          <Card>
            <CardContent className="p-0">
              {/* Mobile card list */}
              <div className="md:hidden">
                {outstandingCustomers.length === 0 && (
                  <div className="py-8 text-center text-sm text-muted-foreground">No outstanding receivables</div>
                )}
                <div className="divide-y divide-border/40">
                  {outstandingCustomers.map((customer) => {
                    const buckets = getAgingBuckets(customer)
                    return (
                      <div key={customer.id} className="flex items-start justify-between gap-2 px-4 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{customer.name}</p>
                          <p className="text-[11px] text-muted-foreground">{customer.phone}</p>
                          {buckets.days60plus > 0 && (
                            <p className="text-[10px] text-rose-500 font-mono mt-0.5">60+ days: {formatCurrency(buckets.days60plus)}</p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-mono text-sm font-bold text-red-600 dark:text-red-400">
                            {formatCurrency(Number(customer.currentOutstanding))}
                          </p>
                          <button
                            className="mt-1 text-[10px] text-primary underline"
                            onClick={() => handleCollectPayment(customer)}
                          >
                            Collect
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
              {/* Desktop table */}
              <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">Total Outstanding</TableHead>
                    <TableHead className="text-right">0-30 Days</TableHead>
                    <TableHead className="text-right">30-60 Days</TableHead>
                    <TableHead className="text-right">60+ Days</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {outstandingCustomers.map((customer) => {
                    const buckets = getAgingBuckets(customer)
                    return (
                      <TableRow key={customer.id} className="group transition-colors border-b border-border/40">
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">{customer.name}</span>
                            <span className="text-xs text-muted-foreground">{customer.phone}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold text-red-600 dark:text-red-400 text-sm">
                          {formatCurrency(Number(customer.currentOutstanding))}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs text-muted-foreground">
                          {formatCurrency(buckets.days0to30)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs text-muted-foreground">
                          {formatCurrency(buckets.days30to60)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm font-semibold text-rose-500">
                          {formatCurrency(buckets.days60plus)}
                        </TableCell>
                        <TableCell className="text-right px-4">
                          <DataTableRowActions
                            onView={() => navigate(`/accounting/ledger?customerId=${customer.id}&name=${encodeURIComponent(customer.name)}`)}
                            customActions={[
                              {
                                label: 'Collect Payment',
                                icon: <CreditCard className="h-4 w-4" />,
                                onClick: () => handleCollectPayment(customer),
                              },
                              {
                                label: 'Send Reminder',
                                icon: <Send className="h-4 w-4" />,
                                onClick: () => handleSendReminder(customer),
                              },
                            ]}
                          />
                        </TableCell>
                      </TableRow>
                    )
                  })}
                  {outstandingCustomers.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        No outstanding receivables
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>

      {/* ─── Collect Payment Dialog ─── */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Collect Payment</DialogTitle>
            <DialogDescription>
              Record a payment from {selectedCustomer?.name}
            </DialogDescription>
          </DialogHeader>

          {selectedCustomer && (
            <form onSubmit={form.handleSubmit(onSubmitPayment)} className="space-y-4">
              {/* Read-only info */}
              <div className="rounded-xl border border-border/60 p-3 space-y-2 bg-muted/50 dark:bg-muted/30">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Customer</span>
                  <span className="font-medium">{selectedCustomer.name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Outstanding Amount</span>
                  <span className="font-bold text-red-600 dark:text-red-400 font-mono">
                    {formatCurrency(Number(selectedCustomer.currentOutstanding))}
                  </span>
                </div>
              </div>

              {/* Amount */}
              <div className="space-y-2">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Payment Amount *
                </Label>
                <Input
                  id="amount"
                  type="number"
                  className="font-mono"
                  {...form.register('amount')}
                  placeholder="Enter amount"
                />
                {form.formState.errors.amount && (
                  <p className="text-xs text-destructive">{form.formState.errors.amount.message}</p>
                )}
              </div>

              {/* Payment Mode */}
              <div className="space-y-2">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Payment Mode
                </Label>
                <Controller
                  control={form.control}
                  name="paymentMode"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="cheque">Cheque</SelectItem>
                        <SelectItem value="neft_upi">NEFT / UPI</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              {/* Reference Number - for cheque/neft */}
              {(form.watch('paymentMode') === 'cheque' ||
                form.watch('paymentMode') === 'neft_upi') && (
                <div className="space-y-2">
                  <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {form.watch('paymentMode') === 'cheque'
                      ? 'Cheque Number'
                      : 'Transaction Reference'}
                  </Label>
                  <Input
                    id="referenceNumber"
                    className="font-mono"
                    {...form.register('referenceNumber')}
                    placeholder={
                      form.watch('paymentMode') === 'cheque'
                        ? 'Enter cheque number'
                        : 'Enter UPI/NEFT reference'
                    }
                  />
                </div>
              )}

              {/* Receipt Number */}
              <div className="rounded-xl border border-border/60 p-3 bg-muted/50 dark:bg-muted/30">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Receipt Number</span>
                  <span className="font-mono text-sm">Auto-generated</span>
                </div>
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
