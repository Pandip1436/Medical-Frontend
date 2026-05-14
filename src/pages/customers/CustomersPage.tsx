import { useState, useEffect, useRef, useCallback } from 'react'
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
  Download,
  Stethoscope,
} from 'lucide-react'
import { DataTablePagination } from '@/components/shared/DataTablePagination'
import { exportToExcel, importFromExcel } from '@/lib/excelUtils'
import { DataTableFilterBar } from '@/components/shared/DataTableFilterBar'
import { DataTableRowActions } from '@/components/shared/DataTableRowActions'
import { EnumSelect } from '@/components/shared/EnumSelect'
import { EmptyState } from '@/components/shared/EmptyState'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
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
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import { cn, formatCurrency } from '@/lib/utils'
import type { Customer } from '@/types'
import api from '@/lib/api'
import { navigate } from '@/lib/router'

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
  registrationNumber: z.string().optional(),
  referredBy: z.string().min(1, 'Please select a salesperson'),
  notes: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.type === 'WHOLESALE') {
    if (!data.gstin || data.gstin.trim() === '') {
      ctx.addIssue({ code: 'custom', path: ['gstin'], message: 'GSTIN is required for Wholesale' })
    }
    if (!data.dlNumber || data.dlNumber.trim() === '') {
      ctx.addIssue({ code: 'custom', path: ['dlNumber'], message: 'DL Number is required for Wholesale' })
    }
  }
  if (data.type === 'DOCTOR') {
    if (!data.registrationNumber || data.registrationNumber.trim() === '') {
      ctx.addIssue({ code: 'custom', path: ['registrationNumber'], message: 'Registration Number is required for Doctor' })
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

const PAGE_SIZE = 15

// ─────────────────────────────────────────────────────────────
// Filter option constants
// ─────────────────────────────────────────────────────────────

const CUSTOMER_TYPE_OPTIONS = [
  { value: 'all', label: 'All Types' },
  { value: 'RETAIL', label: 'Retail' },
  { value: 'WHOLESALE', label: 'Wholesale' },
  { value: 'DOCTOR', label: 'Doctor' },
] as const

const OUTSTANDING_OPTIONS = [
  { value: 'all', label: 'Any Outstanding' },
  { value: 'has', label: 'Has outstanding' },
  { value: 'none', label: 'No outstanding' },
] as const

const GSTIN_OPTIONS = [
  { value: 'all', label: 'Any GSTIN' },
  { value: 'has', label: 'Has GSTIN' },
  { value: 'none', label: 'No GSTIN' },
] as const

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
  // The store is still the cache used by other pages' customer dropdowns.
  // We don't read its list here anymore — this page drives its own paginated
  // fetch — but we keep `fetchCustomers` to refresh the cache after CRUD.
  const fetchCustomers = useMasterDataStore((s) => s.fetchCustomers)
  const addCustomerAction = useMasterDataStore((s) => s.addCustomer)
  const deleteCustomerAction = useMasterDataStore((s) => s.deleteCustomer)
  const importCustomers = useMasterDataStore((s) => s.importCustomers)
  const isPharmacist = useAuthStore((s) => s.user?.role === 'PHARMACIST')

  // Server-driven list state
  const [pageRows, setPageRows] = useState<Customer[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)

  // Global summary (for the top stat cards — stable across filter changes)
  const [summary, setSummary] = useState<{ total: number; withOutstanding: number; totalOutstanding: number }>({
    total: 0,
    withOutstanding: 0,
    totalOutstanding: 0,
  })

  // Filters + pagination
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [customerTypeFilter, setCustomerTypeFilter] = useState<string>('all')
  const [outstandingFilter, setOutstandingFilter] = useState<string>('all')
  const [gstinFilter, setGstinFilter] = useState<string>('all')

  // Dialogs
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  // Customer queued for deletion — null when the dialog is closed.
  const [deleteCandidate, setDeleteCandidate] = useState<Customer | null>(null)
  const [deleteSubmitting, setDeleteSubmitting] = useState(false)

  const [isImporting, setIsImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Multi-file upload state for address proof / prescription docs
  const [docFiles, setDocFiles] = useState<File[]>([])
  const [docPreviews, setDocPreviews] = useState<{ name: string; preview: string | null }[]>([])
  const multiFileInputRef = useRef<HTMLInputElement>(null)

  const handleMultiDocFiles = (files: FileList | null) => {
    if (!files) return
    const newFiles: File[] = []
    const newPreviews: { name: string; preview: string | null }[] = []
    Array.from(files).forEach((file) => {
      newFiles.push(file)
      if (file.type.startsWith('image/')) {
        const url = URL.createObjectURL(file)
        newPreviews.push({ name: file.name, preview: url })
      } else {
        newPreviews.push({ name: file.name, preview: null })
      }
    })
    setDocFiles(prev => [...prev, ...newFiles])
    setDocPreviews(prev => [...prev, ...newPreviews])
  }

  const removeDocFile = (idx: number) => {
    setDocFiles(prev => prev.filter((_, i) => i !== idx))
    setDocPreviews(prev => prev.filter((_, i) => i !== idx))
  }

  // Phone duplicate check
  const [phoneCheckError, setPhoneCheckError] = useState('')
  const [phoneChecking, setPhoneChecking] = useState(false)

  const checkPhoneDuplicate = async (phone: string) => {
    if (!/^\d{10}$/.test(phone)) { setPhoneCheckError(''); return }
    // Skip check if editing same customer
    const currentPhone = editingCustomer?.phone?.replace(/\D/g, '')
    if (currentPhone === phone) { setPhoneCheckError(''); return }
    setPhoneChecking(true)
    setPhoneCheckError('')
    try {
      const res = await api.get(`/customers?q=${phone}`)
      const list = Array.isArray(res.data) ? res.data : []
      const dup = list.find((c: Customer) => c.phone?.replace(/\D/g, '') === phone && c.id !== editingCustomer?.id)
      if (dup) {
        setPhoneCheckError(`Phone already used by "${dup.name}". Please verify.`)
      }
    } catch { /* ignore */ } finally {
      setPhoneChecking(false)
    }
  }

  // ── Server-driven list ──
  const buildQueryParams = useCallback((): URLSearchParams => {
    const params = new URLSearchParams()
    params.set('skip', String((currentPage - 1) * PAGE_SIZE))
    params.set('take', String(PAGE_SIZE))
    if (searchQuery.trim()) params.set('q', searchQuery.trim())
    if (customerTypeFilter !== 'all') params.set('customerType', customerTypeFilter)
    if (outstandingFilter !== 'all') params.set('hasOutstanding', outstandingFilter === 'has' ? 'true' : 'false')
    if (gstinFilter !== 'all') params.set('hasGstin', gstinFilter === 'has' ? 'true' : 'false')
    return params
  }, [currentPage, searchQuery, customerTypeFilter, outstandingFilter, gstinFilter])

  const fetchAbortRef = useRef<AbortController | null>(null)
  useEffect(() => {
    const delay = searchQuery.trim() ? 300 : 0
    const handle = setTimeout(async () => {
      fetchAbortRef.current?.abort()
      const controller = new AbortController()
      fetchAbortRef.current = controller
      setIsLoading(true)
      try {
        const res = await api.get(`/customers?${buildQueryParams().toString()}`, { signal: controller.signal })
        const payload = res.data
        const items = (payload?.data ?? payload ?? []) as Customer[]
        setPageRows(items)
        setTotal(typeof payload?.total === 'number' ? payload.total : items.length)
      } catch (err: unknown) {
        const e = err as { name?: string; code?: string }
        if (e?.name !== 'CanceledError' && e?.code !== 'ERR_CANCELED') {
          setPageRows([])
          setTotal(0)
        }
      } finally {
        setIsLoading(false)
      }
    }, delay)
    return () => clearTimeout(handle)
  }, [buildQueryParams, searchQuery])

  // ── Global summary (does NOT depend on filters) ──
  const fetchSummary = useCallback(async () => {
    try {
      const res = await api.get('/customers/summary')
      const data = res.data?.data ?? res.data
      if (data) setSummary(data)
    } catch { /* silent — leaves last good values */ }
  }, [])

  useEffect(() => { fetchSummary() }, [fetchSummary])
  useBranchRefresh(fetchSummary)

  // Reset page to 1 whenever any filter or search changes
  useEffect(() => { setCurrentPage(1) }, [searchQuery, customerTypeFilter, outstandingFilter, gstinFilter])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const activeFilterCount =
    (customerTypeFilter !== 'all' ? 1 : 0) +
    (outstandingFilter !== 'all' ? 1 : 0) +
    (gstinFilter !== 'all' ? 1 : 0)

  const clearFilters = () => {
    setCustomerTypeFilter('all')
    setOutstandingFilter('all')
    setGstinFilter('all')
  }

  // Refresh list + summary + the global master-data cache (used by other pages' dropdowns).
  const refetchAll = useCallback(async () => {
    fetchSummary()
    fetchCustomers()
    // Re-trigger the list fetch by aborting any in-flight and bumping a state.
    // Easiest: just re-run a manual fetch with current params.
    try {
      const res = await api.get(`/customers?${buildQueryParams().toString()}`)
      const payload = res.data
      const items = (payload?.data ?? payload ?? []) as Customer[]
      setPageRows(items)
      setTotal(typeof payload?.total === 'number' ? payload.total : items.length)
    } catch { /* surface via toast where caller invoked */ }
  }, [buildQueryParams, fetchSummary, fetchCustomers])

  const handleExport = async () => {
    // Fetch the full filtered list (no skip/take) so the export includes every match,
    // not just the current page.
    const params = buildQueryParams()
    params.delete('skip')
    params.delete('take')
    try {
      const res = await api.get(`/customers?${params.toString()}`)
      const all = (Array.isArray(res.data) ? res.data : res.data?.data ?? []) as Customer[]
      const exportData = all.map((c) => ({
        Name: c.name,
        Phone: c.phone,
        Type: c.type,
        Email: c.email || '',
        Address: c.address || '',
        GSTIN: c.gstin || '',
        'DL Number': c.dlNumber || '',
        'Credit Limit': c.creditLimit,
        Outstanding: c.currentOutstanding,
        'Loyalty Points': c.loyaltyPoints,
      }))
      exportToExcel(exportData, 'customers')
    } catch {
      toast.error('Failed to export customers')
    }
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIsImporting(true)
    try {
      const data = await importFromExcel<Record<string, string | number | undefined>>(file)
      if (!data.length) throw new Error('File is empty')
      const formattedData = data.map((row) => ({
        name: String(row.Name ?? row.name ?? ''),
        phone: String(row.Phone ?? row.phone ?? ''),
        type: String(row.Type ?? row.type ?? 'RETAIL').toUpperCase(),
        email: String(row.Email ?? row.email ?? ''),
        address: String(row.Address ?? row.address ?? ''),
        gstin: String(row.GSTIN ?? row.gstin ?? ''),
        dlNumber: String(row['DL Number'] ?? row.dlNumber ?? ''),
      }))
      const res = await importCustomers(formattedData)
      if (res.skippedCount > 0) {
        toast.warning(`Imported ${res.createdCount} customers. Skipped ${res.skippedCount} rows.`)
        if (res.errors?.length) {
          console.warn('Import errors:', res.errors)
        }
      } else {
        toast.success(`Successfully imported ${res.createdCount} customers`)
      }
      refetchAll()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to import customers'
      toast.error(message)
    } finally {
      setIsImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // Salespersons for "Referred by" dropdown
  const [salespersons, setSalespersons] = useState<{ id: string; name: string }[]>([])
  useEffect(() => {
    api.get('/salespersons', { params: { branchId: undefined } })
      .then((res) => {
        const list = (res.data || []) as { id: string; name: string; isActive: boolean }[]
        setSalespersons(list.filter((s) => s.isActive).map((s) => ({ id: s.id, name: s.name })))
      })
      .catch(() => {})
  }, [])

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
      const url = URL.createObjectURL(file)
      setDocFiles(prev => [...prev, file])
      setDocPreviews(prev => [...prev, { name: file.name, preview: url }])
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
      registrationNumber: '',
      referredBy: '',
      notes: '',
    },
  })

  const handleDeleteCustomer = async () => {
    if (!deleteCandidate) return
    setDeleteSubmitting(true)
    try {
      await deleteCustomerAction(deleteCandidate.id)
      toast.success(`Customer "${deleteCandidate.name}" deleted`)
      setDeleteCandidate(null)
      refetchAll()
    } catch (error: unknown) {
      // BE guard returns a clear message if the customer has open invoices /
      // outstanding balance — surface that verbatim so the user knows why.
      const msg = (error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to delete customer'
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
      type: customer.type,
      email: customer.email ?? '',
      address: customer.address ?? '',
      gstin: customer.gstin ?? '',
      dlNumber: customer.dlNumber ?? '',
      registrationNumber: (customer as { registrationNumber?: string }).registrationNumber ?? '',
      referredBy: customer.referredBy ?? '',
      notes: customer.notes ?? '',
    })
    setDocFiles([])
    setDocPreviews([])
    setPhoneCheckError('')
    setAddDialogOpen(true)
  }

  const handleSaveCustomer = async (values: CustomerFormValues) => {
    if (phoneCheckError) { toast.error('Fix the phone number error before saving.'); return }
    try {
      let customerId: string
      if (editingCustomer) {
        await api.patch(`/customers/${editingCustomer.id}`, values)
        customerId = editingCustomer.id
        toast.success(`Customer "${values.name}" updated`)
      } else {
        const result = await addCustomerAction(values) as { approvalRequested?: boolean; id?: string } | undefined
        if (result?.approvalRequested) {
          toast.success(`Approval request sent to admin. Customer "${values.name}" will be created once approved.`, { duration: 6000 })
          form.reset()
          setDocFiles([])
          setDocPreviews([])
          setPhoneCheckError('')
          setEditingCustomer(null)
          setAddDialogOpen(false)
          return
        }
        customerId = result?.id ?? ''
        toast.success(`Customer "${values.name}" added successfully`)
      }
      // Upload all documents (address proofs + prescriptions)
      if (docFiles.length > 0 && customerId) {
        for (const file of docFiles) {
          try {
            const formData = new FormData()
            formData.append('file', file)
            formData.append('customerId', customerId)
            formData.append('doctorName', 'Document')
            await api.post('/prescriptions/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
          } catch {
            toast.warning(`Uploaded customer but failed to upload "${file.name}"`)
          }
        }
      }
      form.reset()
      setDocFiles([])
      setDocPreviews([])
      setPhoneCheckError('')
      setEditingCustomer(null)
      setAddDialogOpen(false)
      refetchAll()
    } catch {
      toast.error(editingCustomer ? 'Failed to update customer' : 'Failed to add customer')
    }
  }

  const handleViewDetails = (customer: Customer) => {
    navigate(`/customers/detail?customerId=${customer.id}`)
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* Hidden file input used by the Import button in the filter bar */}
      <input
        type="file"
        accept=".xlsx, .xls"
        className="hidden"
        ref={fileInputRef}
        onChange={handleImport}
      />

      {/* ─── Summary Cards ─── */}
      <motion.div variants={itemVariants} className="grid gap-3 grid-cols-1 sm:grid-cols-3">
        {[
          {
            label: 'Total Customers',
            value: summary.total.toString(),
            subtitle: 'directory',
            icon: Users,
            iconBg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
            borderAccent: 'border-l-blue-500',
          },
          {
            label: 'With Outstanding',
            value: summary.withOutstanding.toString(),
            subtitle: 'pending dues',
            icon: AlertCircle,
            iconBg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
            borderAccent: 'border-l-amber-500',
          },
          {
            label: 'Total Outstanding',
            value: formatCurrency(summary.totalOutstanding),
            subtitle: 'across all customers',
            icon: IndianRupee,
            iconBg: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
            borderAccent: 'border-l-rose-500',
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
                <p className="text-lg font-bold font-mono leading-tight truncate" title={stat.value}>{stat.value}</p>
                <p className="text-[11px] text-muted-foreground">{stat.subtitle}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </motion.div>

      {/* ─── Search + Filters ─── */}
      <DataTableFilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search by name, phone, or GSTIN..."
        resultsCount={total}
        activeFilterCount={activeFilterCount}
        onClearFilters={clearFilters}
        actionNode={
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="mr-1.5 h-4 w-4" />
              <span className="hidden sm:inline">Export</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={isImporting}>
              <Upload className="mr-1.5 h-4 w-4" />
              <span className="hidden sm:inline">{isImporting ? 'Importing…' : 'Import'}</span>
            </Button>
            <Button size="sm" onClick={() => setAddDialogOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              <span className="hidden sm:inline">Add Customer</span>
            </Button>
          </div>
        }
      >
        <div className="col-span-full grid grid-cols-1 gap-4 sm:grid-cols-3">
          <EnumSelect
            label="Type"
            value={customerTypeFilter}
            onValueChange={setCustomerTypeFilter}
            onClear={() => setCustomerTypeFilter('all')}
            options={CUSTOMER_TYPE_OPTIONS}
          />
          <EnumSelect
            label="Outstanding"
            value={outstandingFilter}
            onValueChange={setOutstandingFilter}
            onClear={() => setOutstandingFilter('all')}
            options={OUTSTANDING_OPTIONS}
          />
          <EnumSelect
            label="GSTIN"
            value={gstinFilter}
            onValueChange={setGstinFilter}
            onClear={() => setGstinFilter('all')}
            options={GSTIN_OPTIONS}
          />
        </div>
      </DataTableFilterBar>

      {/* ─── Customers Table ─── */}
      <motion.div variants={itemVariants}>
        <Card className="overflow-x-auto">
          <CardContent className="p-0">
            {/* Empty state — single shared block for both mobile + desktop */}
            {!isLoading && pageRows.length === 0 && (
              <EmptyState
                icon={Users}
                title={searchQuery || activeFilterCount > 0 ? 'No customers found' : 'No customers yet'}
                description={
                  searchQuery || activeFilterCount > 0
                    ? 'Try adjusting your search or filters.'
                    : 'Add your first customer to start billing.'
                }
                actionLabel={
                  searchQuery || activeFilterCount > 0
                    ? 'Clear filters'
                    : 'Add Customer'
                }
                onAction={
                  searchQuery || activeFilterCount > 0
                    ? () => { clearFilters(); setSearchQuery('') }
                    : () => setAddDialogOpen(true)
                }
              />
            )}

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
              <div className="divide-y divide-border/40">
                {!isLoading && pageRows.map((customer) => (
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
                        {Number(customer.pendingCreditCount ?? 0) > 0 && (
                          <Badge variant="warning" size="sm" className="text-[9px] px-1.5">
                            {customer.pendingCreditCount} pending
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
                {pageRows.map((customer) => (
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
                        {Number(customer.pendingCreditCount ?? 0) > 0 && (
                          <Badge variant="warning" size="sm" className="text-[9px] px-1.5">
                            {customer.pendingCreditCount} pending
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
              </TableBody>
            </Table>
            </div>
          </CardContent>
          <DataTablePagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            totalItems={total}
            itemsPerPage={PAGE_SIZE}
            className="border-t border-border/40 px-4"
          />
        </Card>
      </motion.div>

      {/* ─── Add / Edit Customer Dialog ─── */}
      <Dialog open={addDialogOpen} onOpenChange={(open) => {
        if (!open) { setEditingCustomer(null); form.reset(); setDocFiles([]); setDocPreviews([]); setPhoneCheckError('') }
        setAddDialogOpen(open)
      }}>
        {/* Single DialogContent — full-screen on mobile/tablet, centered modal on desktop */}
        <DialogContent className="p-0 gap-0 w-full h-dvh max-w-none rounded-none md:rounded-xl md:max-w-2xl md:w-full md:h-auto! md:max-h-[90vh]! md:overflow-hidden! md:flex! md:flex-col! md:grid-rows-none!">
          <DialogHeader className="px-5 pt-5 pb-4 border-b border-border/40 shrink-0">
            <DialogTitle>{editingCustomer ? 'Edit Customer' : 'Add New Customer'}</DialogTitle>
            <DialogDescription>Name, Phone, Type, Address and Referred By are required. Email is optional.</DialogDescription>
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
                  <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Phone *{phoneChecking && <span className="ml-1 text-muted-foreground font-normal">checking…</span>}
                  </Label>
                  <Input
                    {...form.register('phone')}
                    placeholder="10-digit number"
                    inputMode="numeric"
                    error={!!form.formState.errors.phone || !!phoneCheckError}
                    onBlur={(e) => checkPhoneDuplicate(e.target.value)}
                  />
                  {form.formState.errors.phone && <p className="text-xs text-rose-500">{form.formState.errors.phone.message}</p>}
                  {!form.formState.errors.phone && phoneCheckError && <p className="text-xs text-rose-500">{phoneCheckError}</p>}
                </div>
              </div>

              {/* Row 2: Type + Email (optional) */}
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
                  <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Email <span className="text-muted-foreground/50 font-normal normal-case">(optional)</span></Label>
                  <Input {...form.register('email')} placeholder="email@example.com" type="email" error={!!form.formState.errors.email} />
                  {form.formState.errors.email && <p className="text-xs text-rose-500">{form.formState.errors.email.message}</p>}
                </div>
              </div>

              {/* Row 3a: GSTIN + DL Number — WHOLESALE only */}
              {form.watch('type') === 'WHOLESALE' && (
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

              {/* Row 3b: Registration Number — DOCTOR only */}
              {form.watch('type') === 'DOCTOR' && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Stethoscope className="h-3.5 w-3.5 text-amber-500" />
                    <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Medical Registration Number *</Label>
                  </div>
                  <Input {...form.register('registrationNumber')} placeholder="MCI / State Medical Council Reg. No." error={!!form.formState.errors.registrationNumber} />
                  {form.formState.errors.registrationNumber && <p className="text-xs text-rose-500">{form.formState.errors.registrationNumber.message}</p>}
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

              {/* Row 6: Address Proof / Documents — Multi-upload */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Address Proof &amp; Documents</Label>
                  {docFiles.length > 0 && (
                    <span className="text-[10px] text-muted-foreground">{docFiles.length} file{docFiles.length !== 1 ? 's' : ''} selected</span>
                  )}
                </div>

                {/* Uploaded file list */}
                {docPreviews.length > 0 && (
                  <div className="space-y-1.5">
                    {docPreviews.map((doc, idx) => (
                      <div key={idx} className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
                        {doc.preview ? (
                          <img src={doc.preview} alt={doc.name} className="h-8 w-10 rounded object-cover shrink-0" />
                        ) : (
                          <div className="flex h-8 w-10 shrink-0 items-center justify-center rounded bg-muted">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                        <span className="min-w-0 flex-1 truncate text-xs text-foreground">{doc.name}</span>
                        <button type="button" onClick={() => removeDocFile(idx)}
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full hover:bg-rose-100 hover:text-rose-600 transition">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Upload zone */}
                <div className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border/50 bg-muted/10 py-5">
                  <div className="flex h-10 w-14 items-center justify-center rounded-lg border-2 border-border/40 bg-muted/30">
                    <FileImage className="h-5 w-5 text-muted-foreground/50" />
                  </div>
                  <p className="text-[11px] text-muted-foreground text-center">Upload ID proof, address proof, or prescriptions</p>
                  <div className="flex items-center gap-2">
                    <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted/40 transition shadow-sm">
                      <Upload className="h-3.5 w-3.5 text-amber-500" />
                      Add Files
                      <input
                        type="file"
                        className="sr-only"
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        multiple
                        ref={multiFileInputRef}
                        onChange={(e) => handleMultiDocFiles(e.target.files)}
                      />
                    </label>
                    <button type="button"
                      onClick={() => setScanOpen(true)}
                      className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted/40 transition shadow-sm">
                      <Camera className="h-3.5 w-3.5 text-muted-foreground" />
                      Scan
                    </button>
                  </div>
                </div>
              </div>

              {/* Row 7: Notes (full width) */}
              <div className="space-y-1.5">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Notes</Label>
                <Textarea {...form.register('notes')} placeholder="Additional notes (optional)" rows={2} />
              </div>

            </div>
            <div className="absolute bottom-0 left-0 right-0 flex items-center justify-end gap-3 px-5 py-3 bg-background/80 backdrop-blur-sm border-t border-border/40">
              <Button type="button" variant="outline" onClick={() => { setEditingCustomer(null); form.reset(); setDocFiles([]); setDocPreviews([]); setPhoneCheckError(''); setAddDialogOpen(false) }}>Cancel</Button>
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
                      <span className="font-mono">{Number(deleteCandidate.pendingCreditCount ?? 0)}</span>
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
