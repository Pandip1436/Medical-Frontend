import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useMasterDataStore } from '@/stores/masterDataStore'
import { useBranchRefresh } from '@/hooks/useBranchRefresh'
import { useAuthStore } from '@/stores/authStore'
import { motion, type Variants } from 'framer-motion'
import { useForm, Controller } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import {
  Plus,
  Eye,
  Pencil,
  Users,
  IndianRupee,
  Trash2,
  AlertCircle,
  Upload,
  FileImage,
  X,
  FileText,
  Camera,
} from 'lucide-react'
import { DataTableFilterBar } from '@/components/shared/DataTableFilterBar'
import { DataTableRowActions } from '@/components/shared/DataTableRowActions'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DatePicker } from '@/components/ui/date-picker'
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn, formatCurrency, formatDate, generateId } from '@/lib/utils'
import type { Customer } from '@/types'
import api, { API_SERVER_URL } from '@/lib/api'
import { navigate } from '@/lib/router'

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
  name: z.string().min(1, 'Name is required'),
  phone: z
    .string()
    .min(10, 'Phone must be 10 digits')
    .max(10, 'Phone must be 10 digits')
    .regex(/^\d{10}$/, 'Must be exactly 10 digits'),
  type: z.enum(['RETAIL', 'WHOLESALE', 'DOCTOR']),
  email: z.string().email('Invalid email').or(z.literal('')).optional(),
  address: z.string().min(1, 'Address is required'),
  gstin: z.string().optional(),
  dlNumber: z.string().optional(),
  referredBy: z.string().min(1, 'Please select a salesperson'),
  notes: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.type === 'WHOLESALE' || data.type === 'DOCTOR') {
    if (!data.gstin || data.gstin.trim() === '') {
      ctx.addIssue({ code: 'custom', path: ['gstin'], message: 'GSTIN is required for Wholesale / Doctor' })
    }
    if (!data.dlNumber || data.dlNumber.trim() === '') {
      ctx.addIssue({ code: 'custom', path: ['dlNumber'], message: 'DL Number is required for Wholesale / Doctor' })
    }
  }
})

type CustomerFormValues = z.input<typeof customerSchema>

// ─────────────────────────────────────────────────────────────
// Type badge color mapping (2026 variants)
// ─────────────────────────────────────────────────────────────

const typeBadgeVariant: Record<string, 'info' | 'purple' | 'success' | 'warning' | 'secondary'> = {
  RETAIL: 'success',
  WHOLESALE: 'purple',
  DOCTOR: 'warning',
}

const typeBorderColor: Record<string, string> = {
  RETAIL: 'border-l-emerald-500',
  WHOLESALE: 'border-l-purple-500',
  DOCTOR: 'border-l-amber-500',
}

const typeAvatarColor: Record<string, string> = {
  RETAIL: 'bg-emerald-500',
  WHOLESALE: 'bg-purple-500',
  DOCTOR: 'bg-amber-500',
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function outstandingColor(outstanding: number) {
  if (outstanding <= 0) return 'text-emerald-600 dark:text-emerald-400'
  return 'text-rose-600 dark:text-rose-400'
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
  const isPharmacist = useAuthStore((s) => s.user?.role === 'PHARMACIST')

  const [searchQuery, setSearchQuery] = useState('')
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [detailDialogOpen, setDetailDialogOpen] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  // Customer queued for deletion — null when the dialog is closed.
  const [deleteCandidate, setDeleteCandidate] = useState<Customer | null>(null)
  const [deleteSubmitting, setDeleteSubmitting] = useState(false)

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

  // Salespersons for "Referred by" dropdown
  const [salespersons, setSalespersons] = useState<{ id: string; name: string }[]>([])
  useEffect(() => {
    api.get('/salespersons', { params: { branchId: undefined } })
      .then((res) => setSalespersons(
        (res.data || []).filter((s: any) => s.isActive).map((s: any) => ({ id: s.id, name: s.name }))
      ))
      .catch(() => {})
  }, [])

  // Document upload state for add/edit dialog
  const [docFile, setDocFile] = useState<File | null>(null)
  const [docPreview, setDocPreview] = useState<string | null>(null)

  const handleDocFile = (file: File | null) => {
    setDocFile(file)
    if (file && file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file)
      setDocPreview(url)
    } else {
      setDocPreview(null)
    }
  }

  // Camera scan state
  const [scanOpen, setScanOpen] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play()
      }
    } catch {
      toast.error('Camera access denied or not available')
      setScanOpen(false)
    }
  }, [])

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }, [])

  const capturePhoto = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')?.drawImage(video, 0, 0)
    canvas.toBlob((blob) => {
      if (!blob) return
      const file = new File([blob], `scan-${Date.now()}.jpg`, { type: 'image/jpeg' })
      handleDocFile(file)
      stopCamera()
      setScanOpen(false)
    }, 'image/jpeg', 0.92)
  }, [stopCamera])

  useEffect(() => {
    if (scanOpen) startCamera()
    else stopCamera()
    return () => stopCamera()
  }, [scanOpen, startCamera, stopCamera])

  // Form
  const form = useForm<CustomerFormValues>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      name: '',
      phone: '',
      type: 'RETAIL',
      email: '',
      address: '',
      gstin: '',
      dlNumber: '',
      referredBy: '',
      notes: '',
    },
  })

  const handleAddCustomer = async (values: any) => {
    try {
      const payload = { ...values, type: values.type }
      const result = await addCustomerAction(payload)
      if ((result as any)?.approvalRequested) {
        toast.success(`Approval request sent to admin. Customer "${values.name}" will be created once approved.`, { duration: 6000 })
      } else {
        toast.success(`Customer "${values.name}" added successfully`)
      }
      form.reset()
      setAddDialogOpen(false)
    } catch (error) {
      toast.error("Failed to add customer. Please try again.")
    }
  }

  const handleDeleteCustomer = async () => {
    if (!deleteCandidate) return
    setDeleteSubmitting(true)
    try {
      await deleteCustomerAction(deleteCandidate.id)
      toast.success(`Customer "${deleteCandidate.name}" deleted`)
      setDeleteCandidate(null)
    } catch (error: any) {
      // BE guard returns a clear message if the customer has open invoices /
      // outstanding balance — surface that verbatim so the user knows why.
      const msg = error?.response?.data?.message ?? 'Failed to delete customer'
      toast.error(msg)
    } finally {
      setDeleteSubmitting(false)
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
      gstin: customer.gstin ?? '',
      dlNumber: customer.dlNumber ?? '',
      referredBy: customer.referredBy ?? '',
      notes: customer.notes ?? '',
    })
    setDocFile(null)
    setDocPreview(null)
    setAddDialogOpen(true)
  }

  const handleSaveCustomer = async (values: any) => {
    try {
      let customerId: string
      if (editingCustomer) {
        await api.patch(`/customers/${editingCustomer.id}`, values)
        customerId = editingCustomer.id
        toast.success(`Customer "${values.name}" updated`)
      } else {
        const result = await addCustomerAction(values)
        if ((result as any)?.approvalRequested) {
          toast.success(`Approval request sent to admin. Customer "${values.name}" will be created once approved.`, { duration: 6000 })
          form.reset()
          setDocFile(null)
          setDocPreview(null)
          setEditingCustomer(null)
          setAddDialogOpen(false)
          return
        }
        customerId = (result as any)?.id
        toast.success(`Customer "${values.name}" added successfully`)
      }
      // Upload document if selected
      if (docFile && customerId) {
        try {
          const form2 = new FormData()
          form2.append('file', docFile)
          form2.append('customerId', customerId)
          form2.append('doctorName', 'Document')
          await api.post('/prescriptions/upload', form2, { headers: { 'Content-Type': 'multipart/form-data' } })
        } catch {
          toast.warning('Customer saved but document upload failed')
        }
      }
      form.reset()
      setDocFile(null)
      setDocPreview(null)
      setEditingCustomer(null)
      setAddDialogOpen(false)
      fetchCustomers()
    } catch {
      toast.error(editingCustomer ? 'Failed to update customer' : 'Failed to add customer')
    }
  }

  const handleViewDetails = (customer: Customer) => {
    navigate(`/customers/detail?customerId=${customer.id}`)
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
      <motion.div variants={itemVariants} className="grid gap-3 grid-cols-1 sm:grid-cols-3">
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
        <Card className="overflow-x-auto">
          <CardContent className="p-0">
            {/* Mobile + Tablet card list (hidden on lg+) */}
            <div className="lg:hidden">
              {isLoading && (
                <div className="divide-y divide-border/40">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-3.5">
                      <div className="flex-1 space-y-1.5">
                        <div className="h-4 w-32 rounded bg-muted animate-pulse" />
                        <div className="h-3 w-20 rounded bg-muted animate-pulse" />
                      </div>
                      <div className="h-4 w-16 rounded bg-muted animate-pulse" />
                    </div>
                  ))}
                </div>
              )}
              {!isLoading && filtered.length === 0 && (
                <div className="py-12 text-center text-sm text-muted-foreground">No customers found</div>
              )}
              <div className="divide-y divide-border/40">
                {!isLoading && filtered.map((customer) => (
                  <div
                    key={customer.id}
                    className="flex items-center gap-3 px-4 py-3.5 hover:bg-muted/30 active:bg-muted/50 cursor-pointer"
                    onClick={() => handleViewDetails(customer)}
                  >
                    {/* Avatar */}
                    <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white', typeAvatarColor[customer.type] || 'bg-gray-400')}>
                      {customer.name.charAt(0).toUpperCase()}
                    </div>
                    {/* Info */}
                    <div className="min-w-0 flex-1 cursor-pointer" onClick={() => handleViewDetails(customer)} >
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{customer.name}</p>
                        <Badge variant={typeBadgeVariant[customer.type] || 'secondary'} size="sm" dot>
                          {customer.type.charAt(0) + customer.type.slice(1).toLowerCase()}
                        </Badge>
                        {Number((customer as any).pendingCreditCount ?? 0) > 0 && (
                          <Badge variant="warning" size="sm" className="text-[9px] px-1.5">
                            {(customer as any).pendingCreditCount} pending
                          </Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground">{customer.phone}</p>
                    </div>
                    {/* Outstanding + actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right hidden sm:block">
                        <p className={cn('font-mono text-xs font-semibold', outstandingColor(customer.currentOutstanding))}>
                          {formatCurrency(customer.currentOutstanding)}
                        </p>
                        <p className="text-[10px] text-muted-foreground">outstanding</p>
                      </div>
                      <div onClick={(e) => e.stopPropagation()}>
                        <DataTableRowActions
                          onView={() => handleViewDetails(customer)}
                          customActions={[
                            { label: 'Edit', icon: <Pencil className="h-4 w-4" />, onClick: () => handleOpenEdit(customer) },
                            { label: 'Delete', icon: <Trash2 className="h-4 w-4" />, onClick: () => setDeleteCandidate(customer), variant: 'destructive' },
                          ]}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* Desktop table (lg+) */}
            <div className="hidden lg:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Type</TableHead>
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
                      'border-l-2 cursor-pointer hover:bg-muted/30',
                      typeBorderColor[customer.type] || 'border-l-transparent'
                    )}
                    onClick={() => handleViewDetails(customer)}
                  >
                    <TableCell className="font-medium">
                      <span className="flex items-center gap-2">
                        {customer.name}
                        {Number((customer as any).pendingCreditCount ?? 0) > 0 && (
                          <Badge variant="warning" size="sm" className="text-[9px] px-1.5">
                            {(customer as any).pendingCreditCount} pending
                          </Badge>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{customer.phone}</TableCell>
                    <TableCell>
                      <Badge
                        variant={typeBadgeVariant[customer.type] || 'secondary'}
                        size="sm"
                        dot
                      >
                        {customer.type.charAt(0) + customer.type.slice(1).toLowerCase()}
                      </Badge>
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right font-mono text-sm font-semibold',
                        outstandingColor(customer.currentOutstanding)
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
                              onClick: () => setDeleteCandidate(customer),
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
                    <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                      No customers found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* ─── Add / Edit Customer Dialog ─── */}
      <Dialog open={addDialogOpen} onOpenChange={(open) => {
        if (!open) { setEditingCustomer(null); form.reset(); setDocFile(null); setDocPreview(null) }
        setAddDialogOpen(open)
      }}>
        {/* ── DESKTOP (lg+): centered modal, 2-column grid ── */}
        {/* Single DialogContent — full-screen on mobile/tablet, centered modal on desktop */}
        <DialogContent className="p-0 gap-0 w-full h-dvh max-w-none rounded-none md:rounded-xl md:max-w-2xl md:w-full md:h-auto! md:max-h-[85vh]! md:overflow-hidden! md:flex! md:flex-col! md:grid-rows-none!">
          <DialogHeader className="px-5 pt-5 pb-4 border-b border-border/40 shrink-0">
            <DialogTitle>{editingCustomer ? 'Edit Customer' : 'Add New Customer'}</DialogTitle>
            <DialogDescription>All fields are required except document and notes.</DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(handleSaveCustomer)} className="flex flex-col flex-1 min-h-0 relative">
            <div className="flex-1 overflow-y-auto px-5 py-4 pb-20 space-y-3">

              {/* Row 1: Name + Phone */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Name *</Label>
                  <Input {...form.register('name')} placeholder="Customer name" error={!!form.formState.errors.name} />
                  {form.formState.errors.name && <p className="text-xs text-rose-500">{form.formState.errors.name.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Phone *</Label>
                  <Input {...form.register('phone')} placeholder="10-digit number" inputMode="numeric" error={!!form.formState.errors.phone} />
                  {form.formState.errors.phone && <p className="text-xs text-rose-500">{form.formState.errors.phone.message}</p>}
                </div>
              </div>

              {/* Row 2: Type + Email */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Type *</Label>
                  <Controller control={form.control} name="type" render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="RETAIL">Retail</SelectItem>
                        <SelectItem value="WHOLESALE">Wholesale</SelectItem>
                        <SelectItem value="DOCTOR">Doctor</SelectItem>
                      </SelectContent>
                    </Select>
                  )} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Email *</Label>
                  <Input {...form.register('email')} placeholder="email@example.com" type="email" error={!!form.formState.errors.email} />
                  {form.formState.errors.email && <p className="text-xs text-rose-500">{form.formState.errors.email.message}</p>}
                </div>
              </div>

              {/* Row 3: GSTIN + DL (only for WHOLESALE / DOCTOR) */}
              {(form.watch('type') === 'WHOLESALE' || form.watch('type') === 'DOCTOR') && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">GSTIN *</Label>
                    <Input {...form.register('gstin')} placeholder="22AAAAA0000A1Z5" error={!!form.formState.errors.gstin} />
                    {form.formState.errors.gstin && <p className="text-xs text-rose-500">{form.formState.errors.gstin.message}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">DL Number *</Label>
                    <Input {...form.register('dlNumber')} placeholder="Drug License No." error={!!form.formState.errors.dlNumber} />
                    {form.formState.errors.dlNumber && <p className="text-xs text-rose-500">{form.formState.errors.dlNumber.message}</p>}
                  </div>
                </div>
              )}

              {/* Row 4: Referred By (half width) */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Referred By *</Label>
                  <Controller control={form.control} name="referredBy" render={({ field }) => (
                    <Select value={field.value || ''} onValueChange={field.onChange}>
                      <SelectTrigger className={form.formState.errors.referredBy ? 'border-rose-500' : ''}>
                        <SelectValue placeholder="Select salesperson" />
                      </SelectTrigger>
                      <SelectContent>
                        {salespersons.map((sp) => (
                          <SelectItem key={sp.id} value={sp.name}>{sp.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )} />
                  {form.formState.errors.referredBy && <p className="text-xs text-rose-500">{form.formState.errors.referredBy.message}</p>}
                </div>
              </div>

              {/* Row 5: Address (full width) */}
              <div className="space-y-1.5">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Address *</Label>
                <Textarea {...form.register('address')} placeholder="Full address" rows={2} />
                {form.formState.errors.address && <p className="text-xs text-rose-500">{form.formState.errors.address.message}</p>}
              </div>

              {/* Row 6: Document / ID Proof (full width) */}
              <div className="space-y-1.5">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Document / ID Proof</Label>
                {docPreview ? (
                  <div className="relative w-full rounded-xl border border-border/50 overflow-hidden">
                    <img src={docPreview} alt="Document preview" className="w-full max-h-36 object-cover" />
                    <button type="button" onClick={() => { setDocFile(null); setDocPreview(null) }}
                      className="absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : docFile ? (
                  <div className="flex items-center gap-2 rounded-xl border border-border/50 bg-muted/30 px-3 py-2.5">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-sm">{docFile.name}</span>
                    <button type="button" onClick={() => setDocFile(null)}><X className="h-3.5 w-3.5 text-muted-foreground" /></button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border/50 bg-muted/10 py-6">
                    {/* Card icon */}
                    <div className="flex h-12 w-16 items-center justify-center rounded-lg border-2 border-border/40 bg-muted/30">
                      <FileImage className="h-6 w-6 text-muted-foreground/50" />
                    </div>
                    {/* Buttons row */}
                    <div className="flex items-center gap-2">
                      <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted/40 transition shadow-sm">
                        <Upload className="h-3.5 w-3.5 text-amber-500" />
                        Upload
                        <input type="file" className="sr-only" accept="image/jpeg,image/png,image/webp,application/pdf"
                          onChange={(e) => handleDocFile(e.target.files?.[0] ?? null)} />
                      </label>
                      <button type="button"
                        onClick={() => setScanOpen(true)}
                        className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted/40 transition shadow-sm">
                        <Camera className="h-3.5 w-3.5 text-muted-foreground" />
                        Scan
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Row 7: Notes (full width) */}
              <div className="space-y-1.5">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Notes</Label>
                <Textarea {...form.register('notes')} placeholder="Additional notes (optional)" rows={3} />
              </div>

            </div>
            <div className="absolute bottom-0 left-0 right-0 flex items-center justify-end gap-3 px-5 py-3 bg-background/80 backdrop-blur-sm border-t border-border/40">
              <Button type="button" variant="outline" onClick={() => { setEditingCustomer(null); form.reset(); setDocFile(null); setDocPreview(null); setAddDialogOpen(false) }}>Cancel</Button>
              <Button
                type="submit"
                disabled={form.formState.isSubmitting}
                className={!editingCustomer && isPharmacist ? 'bg-amber-500 hover:bg-amber-600 text-white' : ''}
              >
                {form.formState.isSubmitting
                  ? (!editingCustomer && isPharmacist ? 'Sending…' : 'Saving...')
                  : editingCustomer
                    ? 'Update Customer'
                    : isPharmacist ? 'Request Approval' : 'Save Customer'
                }
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ─── Camera Scan Dialog ─── */}
      <Dialog open={scanOpen} onOpenChange={(open) => { if (!open) { stopCamera(); setScanOpen(false) } }}>
        <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/40">
            <DialogTitle className="text-base">Scan Document</DialogTitle>
            <DialogDescription className="text-xs">Position the document in frame and press Capture.</DialogDescription>
          </DialogHeader>
          <div className="relative bg-black">
            <video ref={videoRef} autoPlay playsInline muted className="w-full max-h-72 object-cover" />
            <canvas ref={canvasRef} className="hidden" />
            {/* Overlay frame guide */}
            <div className="absolute inset-4 rounded-xl border-2 border-white/40 pointer-events-none" />
          </div>
          <div className="flex items-center justify-end gap-3 px-5 py-3 border-t border-border/40">
            <Button type="button" variant="outline" onClick={() => { stopCamera(); setScanOpen(false) }}>Cancel</Button>
            <Button type="button" onClick={capturePhoto}>
              <Camera className="h-4 w-4 mr-2" />
              Capture
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Customer Detail Dialog ─── */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="w-full max-w-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          {selectedCustomer && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      'flex h-10 w-10 items-center justify-center rounded-xl text-sm font-bold text-white',
                      typeAvatarColor[selectedCustomer.type] || 'bg-gray-400'
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
                        {selectedCustomer.type.charAt(0) + selectedCustomer.type.slice(1).toLowerCase()}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{selectedCustomer.phone}</span>
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <Tabs defaultValue="overview" className="mt-4">
                <div className="overflow-x-auto pb-px">
                  <TabsList className="inline-flex w-max min-w-full rounded-xl">
                    <TabsTrigger value="overview" className="rounded-lg text-xs flex-1 min-w-20">Overview</TabsTrigger>
                    <TabsTrigger value="purchases" className="rounded-lg text-xs flex-1 min-w-20">Purchases</TabsTrigger>
                    <TabsTrigger value="ledger" className="rounded-lg text-xs flex-1 min-w-18">Ledger</TabsTrigger>
                    <TabsTrigger value="credit-notes" className="rounded-lg text-xs flex-1 min-w-24">Credit Notes</TabsTrigger>
                    <TabsTrigger value="prescriptions" className="rounded-lg text-xs flex-1 min-w-15">Rx</TabsTrigger>
                  </TabsList>
                </div>

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
                      {selectedCustomer.referredBy && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Referred By</p>
                          <p className="mt-0.5 font-medium">{selectedCustomer.referredBy}</p>
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
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-border/40 bg-muted/20 p-4 text-center">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Total Business
                      </p>
                      <p className="mt-1 text-xl font-bold font-mono">
                        {formatCurrency(customerInvoices.reduce((sum, inv) => sum + inv.grandTotal, 0))}
                      </p>
                    </div>
                    <div className="rounded-xl border border-border/40 bg-muted/20 p-4 text-center">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Outstanding
                      </p>
                      <p className={cn('mt-1 text-xl font-bold font-mono', outstandingColor(selectedCustomer.currentOutstanding))}>
                        {formatCurrency(selectedCustomer.currentOutstanding)}
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
                  <Card className="overflow-x-auto">
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
                  <Card className="overflow-x-auto">
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
                  <Card className="overflow-x-auto">
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
                          <DatePicker
                            value={prescValidUntil}
                            onChange={setPrescValidUntil}
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

      {/* Delete-customer confirmation. Shows the customer's open balance + pending
          credit count so the user knows what's at stake before confirming. */}
      <AlertDialog
        open={!!deleteCandidate}
        onOpenChange={(open) => { if (!open) setDeleteCandidate(null) }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this customer?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  You're about to permanently delete <span className="font-semibold">{deleteCandidate?.name}</span>.
                </p>
                {deleteCandidate && (
                  <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Phone</span>
                      <span className="font-mono">{deleteCandidate.phone || '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Outstanding</span>
                      <span className={cn('font-mono', outstandingColor(deleteCandidate.currentOutstanding))}>
                        {formatCurrency(deleteCandidate.currentOutstanding)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Pending credit invoices</span>
                      <span className="font-mono">{Number((deleteCandidate as any).pendingCreditCount ?? 0)}</span>
                    </div>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  The server blocks deletion if the customer has open invoices or any outstanding balance — settle those first, or set the customer inactive instead.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteSubmitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDeleteCustomer() }}
              disabled={deleteSubmitting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteSubmitting ? 'Deleting…' : 'Yes, delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  )
}
