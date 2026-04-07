import { useState, useMemo } from 'react'
import { motion, type Variants } from 'framer-motion'
import { useForm, Controller } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import {
  Plus,
  Search,
  Eye,
  Pencil,
  Receipt,
  Users,
  IndianRupee,
  AlertCircle,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
    transition: { staggerChildren: 0.06 },
  },
}

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 16, scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] as const },
  },
}

// ─────────────────────────────────────────────────────────────
// Zod schema
// ─────────────────────────────────────────────────────────────

const customerSchema = z.object({
  name: z.string().min(1, 'Customer name is required'),
  phone: z
    .string()
    .min(10, 'Phone must be 10 digits')
    .max(10, 'Phone must be 10 digits')
    .regex(/^\d{10}$/, 'Phone must be exactly 10 digits'),
  type: z.enum(['walk-in', 'regular', 'hospital', 'wholesale', 'doctor']),
  email: z.string().email('Invalid email').or(z.literal('')).optional(),
  address: z.string().optional(),
  creditLimit: z.coerce.number().min(0, 'Must be 0 or more').default(0),
  gstin: z.string().optional(),
  dlNumber: z.string().optional(),
  notes: z.string().optional(),
})

type CustomerFormValues = z.input<typeof customerSchema>

// ─────────────────────────────────────────────────────────────
// Type badge color mapping (2026 variants)
// ─────────────────────────────────────────────────────────────

const typeBadgeVariant: Record<string, 'info' | 'purple' | 'success' | 'warning' | 'secondary'> = {
  hospital: 'info',
  wholesale: 'purple',
  regular: 'success',
  doctor: 'warning',
  'walk-in': 'secondary',
}

// Left border accent colors for customer type
const typeBorderColor: Record<string, string> = {
  hospital: 'border-l-blue-500',
  wholesale: 'border-l-purple-500',
  regular: 'border-l-emerald-500',
  doctor: 'border-l-amber-500',
  'walk-in': 'border-l-gray-400',
}

// ─────────────────────────────────────────────────────────────
// Mock credit notes
// ─────────────────────────────────────────────────────────────

const mockCreditNotes = [
  {
    id: 'CN-001',
    date: '2026-03-10T10:00:00Z',
    invoiceRef: 'HS/2025-26/0438',
    reason: 'Damaged goods returned',
    amount: 7896,
    status: 'applied',
  },
  {
    id: 'CN-002',
    date: '2026-02-25T14:00:00Z',
    invoiceRef: 'HS/2025-26/0412',
    reason: 'Short expiry medicines returned',
    amount: 3200,
    status: 'pending',
  },
]

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function outstandingColor(outstanding: number, creditLimit: number) {
  if (outstanding <= 0) return 'text-emerald-600 dark:text-emerald-400'
  if (creditLimit > 0 && outstanding >= creditLimit) return 'text-rose-600 dark:text-rose-400'
  return 'text-amber-600 dark:text-amber-400'
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>(mockCustomers)
  const [searchQuery, setSearchQuery] = useState('')
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [detailDialogOpen, setDetailDialogOpen] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)

  // Stats
  const stats = useMemo(() => {
    const totalCustomers = customers.length
    const withOutstanding = customers.filter((c) => c.currentOutstanding > 0).length
    const outstandingAmount = customers.reduce((sum, c) => sum + c.currentOutstanding, 0)
    return { totalCustomers, withOutstanding, outstandingAmount }
  }, [customers])

  // Filtered customers
  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return customers
    const q = searchQuery.toLowerCase()
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone.includes(q)
    )
  }, [customers, searchQuery])

  // Form
  const form = useForm<CustomerFormValues>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      name: '',
      phone: '',
      type: 'regular',
      email: '',
      address: '',
      creditLimit: 0,
      gstin: '',
      dlNumber: '',
      notes: '',
    },
  })

  const handleAddCustomer = (values: any) => {
    const newCustomer: Customer = {
      id: generateId('CUS'),
      name: values.name,
      phone: values.phone,
      type: values.type,
      email: values.email || undefined,
      address: values.address || undefined,
      creditLimit: values.creditLimit,
      currentOutstanding: 0,
      loyaltyPoints: 0,
      gstin: values.gstin || undefined,
      dlNumber: values.dlNumber || undefined,
      notes: values.notes || undefined,
      createdAt: new Date().toISOString(),
    }
    setCustomers((prev) => [newCustomer, ...prev])
    toast.success(`Customer "${values.name}" added successfully`)
    form.reset()
    setAddDialogOpen(false)
  }

  const handleViewDetails = (customer: Customer) => {
    setSelectedCustomer(customer)
    setDetailDialogOpen(true)
  }

  // Get invoices for a customer
  const getCustomerInvoices = (customerId: string) =>
    mockInvoices.filter((inv) => inv.customerId === customerId)

  // Build ledger entries from invoices
  const buildLedger = (customerId: string) => {
    const invoices = getCustomerInvoices(customerId)
    const entries: {
      date: string
      particular: string
      type: 'Sale' | 'Payment'
      debit: number
      credit: number
      balance: number
    }[] = []

    let balance = 0
    const sorted = [...invoices].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    )

    for (const inv of sorted) {
      // Sale entry
      balance += inv.grandTotal
      entries.push({
        date: inv.date,
        particular: `Invoice ${inv.invoiceNumber}`,
        type: 'Sale',
        debit: inv.grandTotal,
        credit: 0,
        balance,
      })
      // Payment entry if paid
      if (inv.amountPaid > 0) {
        balance -= inv.amountPaid
        entries.push({
          date: inv.date,
          particular: `Payment for ${inv.invoiceNumber}`,
          type: 'Payment',
          debit: 0,
          credit: inv.amountPaid,
          balance,
        })
      }
    }
    return entries
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* ─── Custom Flex Header ─── */}
      <motion.div variants={itemVariants} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Customers</h1>
          <p className="text-sm text-muted-foreground">Manage your customer accounts and relationships</p>
        </div>
        <Button onClick={() => setAddDialogOpen(true)} className="mt-3 sm:mt-0">
          <Plus className="mr-2 h-4 w-4" />
          Add Customer
        </Button>
      </motion.div>

      {/* ─── Summary Cards ─── */}
      <motion.div variants={itemVariants} className="grid gap-4 sm:grid-cols-3">
        {/* Total Customers */}
        <Card hover>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-500/10">
              <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Total Customers
              </p>
              <p className="text-2xl font-bold tabular-nums">{stats.totalCustomers}</p>
            </div>
          </CardContent>
        </Card>

        {/* With Outstanding */}
        <Card hover>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/10">
              <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                With Outstanding
              </p>
              <p className="text-2xl font-bold tabular-nums">{stats.withOutstanding}</p>
            </div>
          </CardContent>
        </Card>

        {/* Total Outstanding */}
        <Card hover>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-500/10">
              <IndianRupee className="h-5 w-5 text-rose-600 dark:text-rose-400" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Total Outstanding
              </p>
              <p className="text-2xl font-bold tabular-nums text-rose-600 dark:text-rose-400">
                {formatCurrency(stats.outstandingAmount)}
              </p>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* ─── Search ─── */}
      <motion.div variants={itemVariants} className="max-w-sm">
        <Input
          icon={<Search />}
          placeholder="Search by name or phone..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </motion.div>

      {/* ─── Customers Table ─── */}
      <motion.div variants={itemVariants}>
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Credit Limit</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead className="text-right">Loyalty</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((customer) => (
                  <TableRow
                    key={customer.id}
                    className={cn(
                      'border-l-2',
                      typeBorderColor[customer.type] || 'border-l-transparent'
                    )}
                  >
                    <TableCell className="font-medium">{customer.name}</TableCell>
                    <TableCell className="text-muted-foreground">{customer.phone}</TableCell>
                    <TableCell>
                      <Badge
                        variant={typeBadgeVariant[customer.type] || 'secondary'}
                        size="sm"
                        dot
                      >
                        {customer.type.replace('-', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatCurrency(customer.creditLimit)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right font-mono text-sm font-semibold',
                        outstandingColor(customer.currentOutstanding, customer.creditLimit)
                      )}
                    >
                      {formatCurrency(customer.currentOutstanding)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {customer.loyaltyPoints.toLocaleString('en-IN')}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleViewDetails(customer)}
                          title="View Details"
                        >
                          <Eye />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => toast.info(`Edit ${customer.name} - coming soon`)}
                          title="Edit"
                        >
                          <Pencil />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleViewDetails(customer)}
                          title="Payment History"
                        >
                          <Receipt />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                      No customers found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </motion.div>

      {/* ─── Add Customer Dialog ─── */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Customer</DialogTitle>
            <DialogDescription>Enter customer details below.</DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(handleAddCustomer)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Name *
                </Label>
                <Input
                  id="name"
                  {...form.register('name')}
                  placeholder="Customer name"
                  error={!!form.formState.errors.name}
                />
                {form.formState.errors.name && (
                  <p className="text-xs text-rose-500">{form.formState.errors.name.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone" className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Phone *
                </Label>
                <Input
                  id="phone"
                  {...form.register('phone')}
                  placeholder="10-digit phone"
                  error={!!form.formState.errors.phone}
                />
                {form.formState.errors.phone && (
                  <p className="text-xs text-rose-500">{form.formState.errors.phone.message}</p>
                )}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Type *
                </Label>
                <Controller
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="regular">Regular</SelectItem>
                        <SelectItem value="hospital">Hospital</SelectItem>
                        <SelectItem value="wholesale">Wholesale</SelectItem>
                        <SelectItem value="doctor">Doctor</SelectItem>
                        <SelectItem value="walk-in">Walk-in</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Email
                </Label>
                <Input
                  id="email"
                  {...form.register('email')}
                  placeholder="email@example.com"
                  error={!!form.formState.errors.email}
                />
                {form.formState.errors.email && (
                  <p className="text-xs text-rose-500">{form.formState.errors.email.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="address" className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Address
              </Label>
              <Textarea id="address" {...form.register('address')} placeholder="Full address" rows={2} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="creditLimit" className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Credit Limit
                </Label>
                <Input
                  id="creditLimit"
                  type="number"
                  icon={<IndianRupee />}
                  {...form.register('creditLimit')}
                  placeholder="0"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="gstin" className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  GSTIN
                </Label>
                <Input id="gstin" {...form.register('gstin')} placeholder="GST Number" />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="dlNumber" className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  DL Number
                </Label>
                <Input id="dlNumber" {...form.register('dlNumber')} placeholder="Drug License Number" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes" className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Notes
              </Label>
              <Textarea id="notes" {...form.register('notes')} placeholder="Additional notes" rows={2} />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Save Customer</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ─── Customer Detail Dialog ─── */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          {selectedCustomer && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      'flex h-10 w-10 items-center justify-center rounded-xl text-sm font-bold text-white',
                      selectedCustomer.type === 'hospital' ? 'bg-blue-500' :
                      selectedCustomer.type === 'wholesale' ? 'bg-purple-500' :
                      selectedCustomer.type === 'regular' ? 'bg-emerald-500' :
                      selectedCustomer.type === 'doctor' ? 'bg-amber-500' :
                      'bg-gray-400'
                    )}
                  >
                    {selectedCustomer.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <DialogTitle className="text-lg">{selectedCustomer.name}</DialogTitle>
                    <DialogDescription className="flex items-center gap-2 mt-0.5">
                      <Badge
                        variant={typeBadgeVariant[selectedCustomer.type] || 'secondary'}
                        size="sm"
                        dot
                      >
                        {selectedCustomer.type.replace('-', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{selectedCustomer.phone}</span>
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <Tabs defaultValue="overview" className="mt-4">
                <TabsList className="grid w-full grid-cols-4 rounded-xl">
                  <TabsTrigger value="overview" className="rounded-lg text-xs">Overview</TabsTrigger>
                  <TabsTrigger value="purchases" className="rounded-lg text-xs">Purchases</TabsTrigger>
                  <TabsTrigger value="ledger" className="rounded-lg text-xs">Ledger</TabsTrigger>
                  <TabsTrigger value="credit-notes" className="rounded-lg text-xs">Credit Notes</TabsTrigger>
                </TabsList>

                {/* Overview Tab */}
                <TabsContent value="overview" className="space-y-4 mt-4">
                  <div className="rounded-xl border border-border/40 p-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Phone</p>
                        <p className="mt-0.5 font-medium">{selectedCustomer.phone}</p>
                      </div>
                      {selectedCustomer.alternatePhone && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Alternate Phone</p>
                          <p className="mt-0.5 font-medium">{selectedCustomer.alternatePhone}</p>
                        </div>
                      )}
                      {selectedCustomer.email && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Email</p>
                          <p className="mt-0.5 font-medium">{selectedCustomer.email}</p>
                        </div>
                      )}
                      {selectedCustomer.address && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Address</p>
                          <p className="mt-0.5 font-medium">{selectedCustomer.address}</p>
                        </div>
                      )}
                      {selectedCustomer.gstin && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">GSTIN</p>
                          <p className="mt-0.5 font-medium font-mono">{selectedCustomer.gstin}</p>
                        </div>
                      )}
                      {selectedCustomer.dlNumber && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">DL Number</p>
                          <p className="mt-0.5 font-medium font-mono">{selectedCustomer.dlNumber}</p>
                        </div>
                      )}
                      {selectedCustomer.doctorRef && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Doctor Reference</p>
                          <p className="mt-0.5 font-medium">{selectedCustomer.doctorRef}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Member Since</p>
                        <p className="mt-0.5 font-medium">{formatDate(selectedCustomer.createdAt)}</p>
                      </div>
                    </div>
                  </div>

                  {/* Financial summary cards */}
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border border-border/40 bg-muted/20 p-4 text-center">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Total Business
                      </p>
                      <p className="mt-1 text-xl font-bold font-mono">
                        {formatCurrency(
                          getCustomerInvoices(selectedCustomer.id).reduce(
                            (sum, inv) => sum + inv.grandTotal,
                            0
                          )
                        )}
                      </p>
                    </div>
                    <div className="rounded-xl border border-border/40 bg-muted/20 p-4 text-center">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Outstanding
                      </p>
                      <p
                        className={cn(
                          'mt-1 text-xl font-bold font-mono',
                          outstandingColor(selectedCustomer.currentOutstanding, selectedCustomer.creditLimit)
                        )}
                      >
                        {formatCurrency(selectedCustomer.currentOutstanding)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-border/40 bg-muted/20 p-4 text-center">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Credit Limit
                      </p>
                      <p className="mt-1 text-xl font-bold font-mono">
                        {formatCurrency(selectedCustomer.creditLimit)}
                      </p>
                    </div>
                  </div>

                  {selectedCustomer.notes && (
                    <div className="rounded-xl border border-border/40 p-4">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Notes</p>
                      <p className="mt-1 text-sm text-foreground/80">{selectedCustomer.notes}</p>
                    </div>
                  )}
                </TabsContent>

                {/* Purchase History Tab */}
                <TabsContent value="purchases" className="mt-4">
                  <Card className="overflow-hidden">
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Invoice #</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Payment</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {getCustomerInvoices(selectedCustomer.id).map((inv) => (
                            <TableRow key={inv.id}>
                              <TableCell className="font-mono text-sm">
                                {inv.invoiceNumber}
                              </TableCell>
                              <TableCell className="text-muted-foreground">{formatDate(inv.date)}</TableCell>
                              <TableCell className="text-right font-mono text-sm">
                                {formatCurrency(inv.grandTotal)}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  size="sm"
                                  dot
                                  variant={
                                    inv.status === 'paid'
                                      ? 'success'
                                      : inv.status === 'credit'
                                        ? 'warning'
                                        : inv.status === 'returned'
                                          ? 'destructive'
                                          : 'secondary'
                                  }
                                >
                                  {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                                </Badge>
                              </TableCell>
                              <TableCell className="capitalize text-muted-foreground">{inv.paymentMode}</TableCell>
                            </TableRow>
                          ))}
                          {getCustomerInvoices(selectedCustomer.id).length === 0 && (
                            <TableRow>
                              <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">
                                No purchase history
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Ledger Tab */}
                <TabsContent value="ledger" className="mt-4">
                  <Card className="overflow-hidden">
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Particular</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead className="text-right">Debit</TableHead>
                            <TableHead className="text-right">Credit</TableHead>
                            <TableHead className="text-right">Balance</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {buildLedger(selectedCustomer.id).map((entry, idx) => (
                            <TableRow key={idx}>
                              <TableCell className="text-muted-foreground">{formatDate(entry.date)}</TableCell>
                              <TableCell>{entry.particular}</TableCell>
                              <TableCell>
                                <Badge
                                  size="sm"
                                  dot
                                  variant={entry.type === 'Sale' ? 'warning' : 'success'}
                                >
                                  {entry.type}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right font-mono text-sm">
                                {entry.debit > 0 ? formatCurrency(entry.debit) : '-'}
                              </TableCell>
                              <TableCell className="text-right font-mono text-sm">
                                {entry.credit > 0 ? formatCurrency(entry.credit) : '-'}
                              </TableCell>
                              <TableCell
                                className={cn(
                                  'text-right font-mono text-sm font-semibold',
                                  entry.balance > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
                                )}
                              >
                                {formatCurrency(entry.balance)}
                              </TableCell>
                            </TableRow>
                          ))}
                          {buildLedger(selectedCustomer.id).length === 0 && (
                            <TableRow>
                              <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                                No ledger entries
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Credit Notes Tab */}
                <TabsContent value="credit-notes" className="mt-4">
                  <Card className="overflow-hidden">
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>CN #</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Invoice Ref</TableHead>
                            <TableHead>Reason</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {mockCreditNotes.map((cn) => (
                            <TableRow key={cn.id}>
                              <TableCell className="font-mono text-sm">{cn.id}</TableCell>
                              <TableCell className="text-muted-foreground">{formatDate(cn.date)}</TableCell>
                              <TableCell className="font-mono text-sm">{cn.invoiceRef}</TableCell>
                              <TableCell>{cn.reason}</TableCell>
                              <TableCell className="text-right font-mono text-sm">
                                {formatCurrency(cn.amount)}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  size="sm"
                                  dot
                                  variant={cn.status === 'applied' ? 'success' : 'warning'}
                                >
                                  {cn.status.charAt(0).toUpperCase() + cn.status.slice(1)}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </>
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
