import { useState, useMemo, useEffect } from 'react'
import { useMasterDataStore } from '@/stores/masterDataStore'
import { useBranchRefresh } from '@/hooks/useBranchRefresh'
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
  Trash2,
  AlertCircle,
  Upload,
  FileImage,
  X,
} from 'lucide-react'
import { DataTableFilterBar } from '@/components/shared/DataTableFilterBar'
import { DataTableRowActions } from '@/components/shared/DataTableRowActions'

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
import { cn, formatCurrency, formatDate, generateId } from '@/lib/utils'
import type { Customer } from '@/types'
import api, { API_SERVER_URL } from '@/lib/api'

interface PrescriptionRecord {
  id: string
  doctorName: string
  notes?: string | null
  imageUrl?: string | null
  validUntil?: string | null
  isActive: boolean
  createdAt: string
}

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
  type: z.enum(['WALK_IN', 'REGULAR', 'HOSPITAL', 'WHOLESALE', 'DOCTOR']),
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
  HOSPITAL: 'info',
  WHOLESALE: 'purple',
  REGULAR: 'success',
  DOCTOR: 'warning',
  WALK_IN: 'secondary',
}

// Left border accent colors for customer type
const typeBorderColor: Record<string, string> = {
  HOSPITAL: 'border-l-blue-500',
  WHOLESALE: 'border-l-purple-500',
  REGULAR: 'border-l-emerald-500',
  DOCTOR: 'border-l-amber-500',
  WALK_IN: 'border-l-gray-400',
}

// ─────────────────────────────────────────────────────────────
// Mock credit notes
// ─────────────────────────────────────────────────────────────

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
  const customers = useMasterDataStore((s) => s.customers)
  const isLoading = useMasterDataStore((s) => s.isLoading)
  const fetchCustomers = useMasterDataStore((s) => s.fetchCustomers)
  const addCustomerAction = useMasterDataStore((s) => s.addCustomer)
  const deleteCustomerAction = useMasterDataStore((s) => s.deleteCustomer)

  const [searchQuery, setSearchQuery] = useState('')
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [detailDialogOpen, setDetailDialogOpen] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)

  // Customer invoices + credit notes for detail dialog
  const [customerInvoices, setCustomerInvoices] = useState<any[]>([])
  const [customerCreditNotes, setCustomerCreditNotes] = useState<any[]>([])

  const fetchCustomerInvoices = async (customerId: string) => {
    try {
      const res = await api.get(`/billing?customerId=${customerId}`)
      setCustomerInvoices(Array.isArray(res.data) ? res.data : [])
    } catch {
      setCustomerInvoices([])
    }
  }

  const fetchCustomerCreditNotes = async (customerId: string) => {
    try {
      const res = await api.get(`/credit-notes?customerId=${customerId}`)
      setCustomerCreditNotes(Array.isArray(res.data) ? res.data : [])
    } catch {
      setCustomerCreditNotes([])
    }
  }

  // Prescriptions
  const [prescriptions, setPrescriptions] = useState<PrescriptionRecord[]>([])
  const [prescLoading, setPrescLoading] = useState(false)
  const [prescUploadOpen, setPrescUploadOpen] = useState(false)
  const [prescFile, setPrescFile] = useState<File | null>(null)
  const [prescDoctorName, setPrescDoctorName] = useState('')
  const [prescNotes, setPrescNotes] = useState('')
  const [prescValidUntil, setPrescValidUntil] = useState('')
  const [prescUploading, setPrescUploading] = useState(false)

  const fetchPrescriptions = async (customerId: string) => {
    setPrescLoading(true)
    try {
      const res = await api.get(`/prescriptions?customerId=${customerId}`)
      setPrescriptions(res.data)
    } catch {
      setPrescriptions([])
    } finally {
      setPrescLoading(false)
    }
  }

  const handlePrescUpload = async () => {
    if (!prescFile || !prescDoctorName || !selectedCustomer) return
    setPrescUploading(true)
    try {
      const form = new FormData()
      form.append('file', prescFile)
      form.append('customerId', selectedCustomer.id)
      form.append('doctorName', prescDoctorName)
      if (prescNotes) form.append('notes', prescNotes)
      if (prescValidUntil) form.append('validUntil', prescValidUntil)
      await api.post('/prescriptions/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      toast.success('Prescription uploaded successfully')
      setPrescUploadOpen(false)
      setPrescFile(null)
      setPrescDoctorName('')
      setPrescNotes('')
      setPrescValidUntil('')
      fetchPrescriptions(selectedCustomer.id)
    } catch {
      toast.error('Failed to upload prescription')
    } finally {
      setPrescUploading(false)
    }
  }

  const handlePrescDelete = async (id: string) => {
    try {
      await api.delete(`/prescriptions/${id}`)
      toast.success('Prescription deleted')
      if (selectedCustomer) fetchPrescriptions(selectedCustomer.id)
    } catch {
      toast.error('Failed to delete prescription')
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    fetchCustomers()
  }, [])
  useBranchRefresh(fetchCustomers)

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
      type: 'REGULAR',
      email: '',
      address: '',
      creditLimit: 0,
      gstin: '',
      dlNumber: '',
      notes: '',
    },
  })

  const handleAddCustomer = async (values: any) => {
    try {
      const payload = {
        ...values,
        type: values.type,
      }
      
      await addCustomerAction(payload)
      toast.success(`Customer "${values.name}" added successfully`)
      form.reset()
      setAddDialogOpen(false)
    } catch (error) {
      toast.error("Failed to add customer. Please try again.")
    }
  }

  const handleDeleteCustomer = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete "${name}"?`)) return
    try {
      await deleteCustomerAction(id)
      toast.success(`Customer "${name}" deleted`)
    } catch (error) {
      toast.error("Failed to delete customer")
    }
  }

  const handleOpenEdit = (customer: Customer) => {
    setEditingCustomer(customer)
    form.reset({
      name: customer.name,
      phone: customer.phone,
      type: customer.type as any,
      email: customer.email ?? '',
      address: customer.address ?? '',
      creditLimit: customer.creditLimit ?? 0,
      gstin: customer.gstin ?? '',
      dlNumber: customer.dlNumber ?? '',
      notes: customer.notes ?? '',
    })
    setAddDialogOpen(true)
  }

  const handleSaveCustomer = async (values: any) => {
    try {
      if (editingCustomer) {
        await api.patch(`/customers/${editingCustomer.id}`, values)
        toast.success(`Customer "${values.name}" updated`)
      } else {
        await addCustomerAction(values)
        toast.success(`Customer "${values.name}" added successfully`)
      }
      form.reset()
      setEditingCustomer(null)
      setAddDialogOpen(false)
      fetchCustomers()
    } catch {
      toast.error(editingCustomer ? 'Failed to update customer' : 'Failed to add customer. Please try again.')
    }
  }

  const handleViewDetails = (customer: Customer) => {
    setSelectedCustomer(customer)
    setDetailDialogOpen(true)
    setCustomerInvoices([])
    setCustomerCreditNotes([])
    fetchPrescriptions(customer.id)
    fetchCustomerInvoices(customer.id)
    fetchCustomerCreditNotes(customer.id)
  }

  // Build ledger entries from loaded invoices
  const buildLedger = () => {
    const entries: {
      date: string
      particular: string
      type: 'Sale' | 'Payment'
      debit: number
      credit: number
      balance: number
    }[] = []

    let balance = 0
    const sorted = [...customerInvoices].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    )

    for (const inv of sorted) {
      balance += inv.grandTotal
      entries.push({
        date: inv.date,
        particular: `Invoice ${inv.invoiceNumber}`,
        type: 'Sale',
        debit: inv.grandTotal,
        credit: 0,
        balance,
      })
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
      <DataTableFilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search by name or phone..."
        resultsCount={filtered.length}
      />

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
                      {(customer.loyaltyPoints || 0).toLocaleString('en-IN')}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
                        <DataTableRowActions
                          onView={() => handleViewDetails(customer)}
                          customActions={[
                            {
                              label: 'Edit',
                              icon: <Pencil className="h-4 w-4" />,
                              onClick: () => handleOpenEdit(customer),
                            },
                            {
                              label: 'Delete',
                              icon: <Trash2 className="h-4 w-4" />,
                              onClick: () => handleDeleteCustomer(customer.id, customer.name),
                              variant: 'destructive',
                            },
                          ]}
                        />
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
      <Dialog open={addDialogOpen} onOpenChange={(open) => { if (!open) { setEditingCustomer(null); form.reset() } setAddDialogOpen(open) }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingCustomer ? 'Edit Customer' : 'Add New Customer'}</DialogTitle>
            <DialogDescription>Enter customer details below.</DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(handleSaveCustomer)} className="space-y-4">
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
                        <SelectItem value="REGULAR">Regular</SelectItem>
                        <SelectItem value="HOSPITAL">Hospital</SelectItem>
                        <SelectItem value="WHOLESALE">Wholesale</SelectItem>
                        <SelectItem value="DOCTOR">Doctor</SelectItem>
                        <SelectItem value="WALK_IN">Walk-in</SelectItem>
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
              <Button type="button" variant="outline" onClick={() => { setEditingCustomer(null); form.reset(); setAddDialogOpen(false) }}>
                Cancel
              </Button>
              <Button type="submit">{editingCustomer ? 'Update Customer' : 'Save Customer'}</Button>
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
                      selectedCustomer.type === 'HOSPITAL' ? 'bg-blue-500' :
                      selectedCustomer.type === 'WHOLESALE' ? 'bg-purple-500' :
                      selectedCustomer.type === 'REGULAR' ? 'bg-emerald-500' :
                      selectedCustomer.type === 'DOCTOR' ? 'bg-amber-500' :
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
                <TabsList className="grid w-full grid-cols-5 rounded-xl">
                  <TabsTrigger value="overview" className="rounded-lg text-xs">Overview</TabsTrigger>
                  <TabsTrigger value="purchases" className="rounded-lg text-xs">Purchases</TabsTrigger>
                  <TabsTrigger value="ledger" className="rounded-lg text-xs">Ledger</TabsTrigger>
                  <TabsTrigger value="credit-notes" className="rounded-lg text-xs">Credit Notes</TabsTrigger>
                  <TabsTrigger value="prescriptions" className="rounded-lg text-xs">Rx</TabsTrigger>
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
                          customerInvoices.reduce(
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
                          {customerInvoices.map((inv) => (
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
                                    inv.status === 'PAID'
                                      ? 'success'
                                      : inv.status === 'CREDIT'
                                        ? 'warning'
                                        : inv.status === 'RETURNED'
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
                          {customerInvoices.length === 0 && (
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
                          {buildLedger().map((entry, idx) => (
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
                          {buildLedger().length === 0 && (
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
                          {customerCreditNotes.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                                No credit notes found
                              </TableCell>
                            </TableRow>
                          ) : customerCreditNotes.map((cn) => (
                            <TableRow key={cn.id}>
                              <TableCell className="font-mono text-sm">{cn.creditNoteNo}</TableCell>
                              <TableCell className="text-muted-foreground">{formatDate(cn.date)}</TableCell>
                              <TableCell className="font-mono text-sm">{cn.invoiceNumber}</TableCell>
                              <TableCell>{cn.reason ?? '—'}</TableCell>
                              <TableCell className="text-right font-mono text-sm">
                                {formatCurrency(Number(cn.totalAmount))}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  size="sm"
                                  dot
                                  variant={cn.settlementMode === 'CREDIT' ? 'success' : 'warning'}
                                >
                                  {cn.settlementMode ?? 'REFUND'}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </TabsContent>
                {/* Prescriptions Tab */}
                <TabsContent value="prescriptions" className="mt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-muted-foreground">
                      {prescriptions.length} prescription{prescriptions.length !== 1 ? 's' : ''} on file
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-xs h-8"
                      onClick={() => setPrescUploadOpen(true)}
                    >
                      <Upload className="h-3.5 w-3.5" />
                      Upload Rx
                    </Button>
                  </div>

                  {prescLoading ? (
                    <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">
                      Loading...
                    </div>
                  ) : prescriptions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-muted-foreground">
                      <FileImage className="h-8 w-8 opacity-30" />
                      <p className="text-sm">No prescriptions uploaded yet</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {prescriptions.map((rx) => (
                        <div
                          key={rx.id}
                          className="flex items-center gap-3 rounded-xl border border-border/40 bg-muted/20 p-3"
                        >
                          <FileImage className="h-8 w-8 shrink-0 text-muted-foreground/50" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">Dr. {rx.doctorName}</p>
                            {rx.notes && (
                              <p className="text-[11px] text-muted-foreground truncate">{rx.notes}</p>
                            )}
                            <p className="text-[10px] text-muted-foreground/60">
                              {formatDate(rx.createdAt)}
                              {rx.validUntil && ` · Valid until ${formatDate(rx.validUntil)}`}
                            </p>
                          </div>
                          <div className="flex items-center gap-1">
                            {rx.imageUrl && (
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                onClick={() => window.open(
                                  `${API_SERVER_URL}${rx.imageUrl}`,
                                  '_blank'
                                )}
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              onClick={() => handlePrescDelete(rx.id)}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Upload dialog */}
                  <Dialog open={prescUploadOpen} onOpenChange={setPrescUploadOpen}>
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle>Upload Prescription</DialogTitle>
                        <DialogDescription>
                          Upload a prescription image or PDF for {selectedCustomer?.name}
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="space-y-1.5">
                          <Label>Doctor Name <span className="text-destructive">*</span></Label>
                          <Input
                            placeholder="Dr. Ramesh Kumar"
                            value={prescDoctorName}
                            onChange={(e) => setPrescDoctorName(e.target.value)}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Prescription File <span className="text-destructive">*</span></Label>
                          <Input
                            type="file"
                            accept="image/jpeg,image/png,image/webp,application/pdf"
                            onChange={(e) => setPrescFile(e.target.files?.[0] ?? null)}
                          />
                          <p className="text-[10px] text-muted-foreground">JPG, PNG, WEBP or PDF · max 5 MB</p>
                        </div>
                        <div className="space-y-1.5">
                          <Label>Valid Until</Label>
                          <Input
                            type="date"
                            value={prescValidUntil}
                            onChange={(e) => setPrescValidUntil(e.target.value)}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Notes</Label>
                          <Textarea
                            placeholder="Any notes about this prescription..."
                            rows={2}
                            value={prescNotes}
                            onChange={(e) => setPrescNotes(e.target.value)}
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setPrescUploadOpen(false)}>
                          Cancel
                        </Button>
                        <Button
                          onClick={handlePrescUpload}
                          disabled={prescUploading || !prescFile || !prescDoctorName}
                        >
                          {prescUploading ? 'Uploading...' : 'Upload'}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </TabsContent>
              </Tabs>
            </>
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
