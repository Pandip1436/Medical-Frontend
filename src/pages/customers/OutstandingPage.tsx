import { useState, useMemo } from 'react'
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
} from 'lucide-react'

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
import { mockCustomers, mockInvoices } from '@/data/mock'
import { cn, formatCurrency, formatDate, generateId } from '@/lib/utils'
import type { Customer } from '@/types'

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
// Helpers – aging buckets
// ─────────────────────────────────────────────────────────────

function getAgingBuckets(customer: Customer) {
  const now = new Date()
  const invoices = mockInvoices.filter(
    (inv) =>
      inv.customerId === customer.id &&
      (inv.status === 'credit' || inv.status === 'partial')
  )

  let days0to30 = 0
  let days30to60 = 0
  let days60plus = 0

  for (const inv of invoices) {
    const invDate = new Date(inv.date)
    const daysDiff = Math.floor((now.getTime() - invDate.getTime()) / (1000 * 60 * 60 * 24))
    const outstanding = inv.grandTotal - inv.amountPaid

    if (daysDiff <= 30) {
      days0to30 += outstanding
    } else if (daysDiff <= 60) {
      days30to60 += outstanding
    } else {
      days60plus += outstanding
    }
  }

  return { days0to30, days30to60, days60plus }
}

function getLastPaymentDate(customerId: string): string | null {
  const paidInvoices = mockInvoices
    .filter((inv) => inv.customerId === customerId && inv.amountPaid > 0)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  return paidInvoices.length > 0 ? paidInvoices[0].date : null
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export default function OutstandingPage() {
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)

  // Customers with outstanding
  const outstandingCustomers = useMemo(
    () => mockCustomers.filter((c) => c.currentOutstanding > 0),
    []
  )

  // Summary
  const summary = useMemo(() => {
    let total = 0
    let bucket0to30 = 0
    let bucket30to60 = 0
    let bucket60plus = 0

    for (const customer of outstandingCustomers) {
      total += customer.currentOutstanding
      const buckets = getAgingBuckets(customer)
      bucket0to30 += buckets.days0to30
      bucket30to60 += buckets.days30to60
      bucket60plus += buckets.days60plus
    }

    // Adjust any rounding mismatch so the sum uses the actual outstanding values
    const bucketSum = bucket0to30 + bucket30to60 + bucket60plus
    if (bucketSum === 0 && total > 0) {
      // All invoices are mock-based and recent, fall back to total in first bucket
      bucket0to30 = total
    }

    return { total, bucket0to30, bucket30to60, bucket60plus }
  }, [outstandingCustomers])

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

  const onSubmitPayment = (values: any) => {
    if (!selectedCustomer) return
    const receiptNo = `RCT-${generateId()}`
    toast.success(
      `Payment of ${formatCurrency(values.amount)} recorded for ${selectedCustomer.name}. Receipt: ${receiptNo}`
    )
    setPaymentDialogOpen(false)
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
        <div className="flex items-center gap-2">
          <Button size="sm" className="gap-1.5" onClick={handleBulkReminders}>
            <Bell className="h-3.5 w-3.5" />
            Send Reminders
          </Button>
        </div>
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
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">Total Outstanding</TableHead>
                    <TableHead className="text-right">0-30 Days</TableHead>
                    <TableHead className="text-right">30-60 Days</TableHead>
                    <TableHead className="text-right">60+ Days</TableHead>
                    <TableHead>Last Payment</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {outstandingCustomers.map((customer) => {
                    const buckets = getAgingBuckets(customer)
                    const lastPayment = getLastPaymentDate(customer.id)
                    return (
                      <TableRow key={customer.id} className="border-b border-border/40">
                        <TableCell className="font-medium">{customer.name}</TableCell>
                        <TableCell className="text-right font-mono font-semibold text-red-600 dark:text-red-400">
                          {formatCurrency(customer.currentOutstanding)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-yellow-600 dark:text-yellow-400">
                          {buckets.days0to30 > 0 ? formatCurrency(buckets.days0to30) : '-'}
                        </TableCell>
                        <TableCell className="text-right font-mono text-orange-600 dark:text-orange-400">
                          {buckets.days30to60 > 0 ? formatCurrency(buckets.days30to60) : '-'}
                        </TableCell>
                        <TableCell className="text-right font-mono text-red-700 dark:text-red-400 font-semibold">
                          {buckets.days60plus > 0 ? formatCurrency(buckets.days60plus) : '-'}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {lastPayment ? formatDate(lastPayment) : 'No payment'}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              className="rounded-xl"
                              onClick={() => handleCollectPayment(customer)}
                            >
                              <CreditCard className="mr-1 h-3.5 w-3.5" />
                              Collect
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => handleSendReminder(customer)}
                              title="Send Reminder"
                            >
                              <Send className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => toast.info(`Ledger for ${customer.name} - view in Customers page`)}
                              title="View Ledger"
                            >
                              <BookOpen className="h-4 w-4" />
                            </Button>
                          </div>
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
                    {formatCurrency(selectedCustomer.currentOutstanding)}
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
                <Button type="button" variant="outline" onClick={() => setPaymentDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">Confirm Payment</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
