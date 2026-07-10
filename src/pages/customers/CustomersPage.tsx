import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useMasterDataStore } from '@/stores/masterDataStore'
import { useBranchRefresh } from '@/hooks/useBranchRefresh'
import { useAuthStore } from '@/stores/authStore'
import { motion, AnimatePresence, type Variants } from 'framer-motion'
import { useForm, Controller } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import {
  Plus,
  Pencil,
  Users,
  IndianRupee,
  Ban,
  AlertCircle,
  Upload,
  FileImage,
  X,
  FileText,
  Camera,
  Download,
  Stethoscope,
  Wallet,
  CheckCircle2,
  Filter,
  BarChart3,
} from 'lucide-react'
import { DataTablePagination } from '@/components/shared/DataTablePagination'
import {
  exportCustomersToWorkbook,
  type CustomerExportPayload,
} from '@/lib/customerImportTemplate'
import { useBranchStore } from '@/stores/branchStore'
import { ImportCustomersDrawer } from '@/components/customers/ImportCustomersDrawer'
import { DataTableFilterBar } from '@/components/shared/DataTableFilterBar'
import { ColumnsToggle } from '@/components/shared/ColumnsToggle'
import { useColumnVisibility } from '@/hooks/useColumnVisibility'
import type { ColumnDef } from '@/types/table'
import { DataTableRowActions } from '@/components/shared/DataTableRowActions'
import { EnumSelect } from '@/components/shared/EnumSelect'
import { DatePicker } from '@/components/ui/date-picker'
import { EmptyState } from '@/components/shared/EmptyState'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn, formatCurrency } from '@/lib/utils'
import { resolveListView } from '@/lib/listView'
import type { Customer } from '@/types'
import api from '@/lib/api'
import { usePageFilter } from '@/hooks/usePageFilter'
import { useFilterPrefsStore } from '@/stores/useFilterPrefsStore'
import { navigate, useRoute } from '@/lib/router'
import { ViewModeToggle } from '@/components/shared/ViewModeToggle'
import { CustomerSplitView } from './components/CustomerSplitView'

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

// How the customer was acquired. Optional; fixed list keeps reporting consistent.
const CUSTOMER_SOURCES = [
  'Walk-in',
  'Referral',
  'IndiaMART',
  'Just Dial',
  'WhatsApp',
  'Social Media',
  'Website',
  'Advertisement',
  'Other',
] as const

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
  referredBy: z.string().optional(),
  source: z.string().optional(),
  notes: z.string().optional(),
  // Toggle whether this customer receives transactional WhatsApp messages
  // (invoice PDF + payment QR via Meta Cloud API). Defaults to true; user
  // can switch off if a customer explicitly opts out.
  whatsappOptIn: z.boolean().optional(),
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

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Status' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
] as const

const SOURCE_FILTER_OPTIONS = [
  { value: 'all', label: 'All Sources' },
  ...CUSTOMER_SOURCES.map((s) => ({ value: s, label: s })),
  { value: 'none', label: 'No source' },
] as const

// "Added" date filter — relative presets plus a custom from/to range.
// Customers are filtered server-side by createdAt within the resolved range.
const PERIOD_OPTIONS = [
  { value: 'all', label: 'All Time' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: '3_months', label: 'Last 3 Months' },
  { value: '6_months', label: 'Last 6 Months' },
  { value: 'custom', label: 'Custom Range' },
] as const

const fmtDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// Resolve a period preset (and the custom inputs) to a createdAt range. Empty
// strings mean "open-ended" so the server can apply just one bound.
function resolvePeriodRange(
  preset: string,
  customFrom: string,
  customTo: string,
): { from: string; to: string } {
  const now = new Date()
  switch (preset) {
    case 'this_month':
      return { from: fmtDate(new Date(now.getFullYear(), now.getMonth(), 1)), to: fmtDate(now) }
    case 'last_month':
      return {
        from: fmtDate(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        // Day 0 of the current month = last day of the previous month.
        to: fmtDate(new Date(now.getFullYear(), now.getMonth(), 0)),
      }
    case '3_months':
      return { from: fmtDate(new Date(now.getFullYear(), now.getMonth() - 3, now.getDate())), to: fmtDate(now) }
    case '6_months':
      return { from: fmtDate(new Date(now.getFullYear(), now.getMonth() - 6, now.getDate())), to: fmtDate(now) }
    case 'custom':
      return { from: customFrom, to: customTo }
    default:
      return { from: '', to: '' }
  }
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function outstandingColor(outstanding: number) {
  if (outstanding <= 0) return 'text-emerald-600 dark:text-emerald-400'
  return 'text-rose-600 dark:text-rose-400'
}

// ─────────────────────────────────────────────────────────────
// Payment tabs (same pattern as GRN list)
// ─────────────────────────────────────────────────────────────

type PayTabKey = 'all' | 'PAID' | 'PARTIAL' | 'UNPAID'

const PAY_TABS: { key: PayTabKey; label: string; activeClass: string; countClass: string }[] = [
  { key: 'all',     label: 'All',     activeClass: 'border-foreground text-foreground',                                   countClass: 'bg-foreground/10 text-foreground' },
  { key: 'PAID',    label: 'Paid',    activeClass: 'border-emerald-500 text-emerald-600 dark:text-emerald-400',            countClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  { key: 'PARTIAL', label: 'Partial', activeClass: 'border-amber-500 text-amber-600 dark:text-amber-400',                 countClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  { key: 'UNPAID',  label: 'Unpaid',  activeClass: 'border-rose-500 text-rose-600 dark:text-rose-400',                    countClass: 'bg-rose-500/10 text-rose-600 dark:text-rose-400' },
]

function CustomerPaymentTabs({ tab, onChange, counts }: {
  tab: PayTabKey
  onChange: (t: PayTabKey) => void
  counts: Record<string, number>
}) {
  return (
    <div className="inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-border/60 bg-muted/40 p-1 shadow-sm shadow-black/[0.02]">
      {PAY_TABS.map((t) => {
        const active = tab === t.key
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-150',
              active
                ? cn('bg-background shadow-sm', t.activeClass)
                : 'text-muted-foreground hover:bg-background/60 hover:text-foreground',
            )}
          >
            {t.label}
            <span
              className={cn(
                'rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums transition-colors',
                active ? t.countClass : 'bg-foreground/[0.06] text-muted-foreground',
              )}
            >
              {counts[t.key] ?? 0}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

const CUSTOMER_COLUMNS: ColumnDef[] = [
  { id: 'name', label: 'Name', required: true, defaultVisible: true },
  { id: 'phone', label: 'Phone', defaultVisible: true },
  { id: 'type', label: 'Type', defaultVisible: true },
  { id: 'source', label: 'Source', defaultVisible: true },
  { id: 'totalAmount', label: 'Total Amount', defaultVisible: true },
  { id: 'paidAmount', label: 'Paid Amount', defaultVisible: true },
  { id: 'outstanding', label: 'Outstanding', defaultVisible: true },
  { id: 'pending', label: 'Pending', defaultVisible: true },
  { id: 'status', label: 'Status', defaultVisible: true },
]

const CARD_FIELDS: ColumnDef[] = [
  { id: 'phone', label: 'Phone', defaultVisible: true },
  { id: 'type', label: 'Type', defaultVisible: true },
  { id: 'source', label: 'Source', defaultVisible: true },
  { id: 'status', label: 'Status', defaultVisible: true },
  { id: 'outstanding', label: 'Outstanding', defaultVisible: true },
  { id: 'pending', label: 'Pending Bills', defaultVisible: true },
]

export default function CustomersPage() {
  const cols = useColumnVisibility('customers.list', CUSTOMER_COLUMNS)
  const cardCols = useColumnVisibility('customers.card', CARD_FIELDS)
  const { search: routeSearch } = useRoute()
  const urlParams = useMemo(() => new URLSearchParams(routeSearch), [routeSearch])

  const effectiveView = resolveListView(urlParams.get('view'))
  const selectedCustomerId = urlParams.get('customerId')

  const selectCustomer = useCallback((id: string | null) => {
    if (window.location.pathname !== '/customers') return
    const params = new URLSearchParams()
    if (id) params.set('customerId', id)
    navigate(`/customers${params.toString() ? `?${params.toString()}` : ''}`)
  }, [])

  const exitSplitView = useCallback(() => {
    navigate('/customers?view=table')
  }, [])

  // The store is still the cache used by other pages' customer dropdowns.
  // We don't read its list here anymore — this page drives its own paginated
  // fetch — but we keep `fetchCustomers` to refresh the cache after CRUD.
  const fetchCustomers = useMasterDataStore((s) => s.fetchCustomers)
  const addCustomerAction = useMasterDataStore((s) => s.addCustomer)
  const isPharmacist = useAuthStore((s) => s.user?.role === 'PHARMACIST')

  // Server-driven list state
  const [pageRows, setPageRows] = useState<Customer[]>([])
  const [allCustomers, setAllCustomers] = useState<Customer[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  // Bumped whenever an external mutation (import, delete, etc.) needs the
  // list re-fetched. Drives the same effect that loads the initial page, so
  // we don't duplicate fetch logic.
  const [refreshToken, setRefreshToken] = useState(0)

  // Global summary (for the top stat cards — stable across filter changes)
  const [summary, setSummary] = useState<{ total: number; withOutstanding: number; totalOutstanding: number; totalAmount: number; paidAmount: number; paidCount: number; partialCount: number; unpaidCount: number }>({
    total: 0,
    withOutstanding: 0,
    totalOutstanding: 0,
    totalAmount: 0,
    paidAmount: 0,
    paidCount: 0,
    partialCount: 0,
    unpaidCount: 0,
  })

  // Filters + pagination
  const [searchQuery, setSearchQuery] = usePageFilter<string>('customers.list', 'search', '')
  const [currentPage, setCurrentPage] = useState(1)
  const [customerTypeFilter, setCustomerTypeFilter] = usePageFilter<string>('customers.list', 'type', 'all')
  const [outstandingFilter, setOutstandingFilter] = usePageFilter<string>('customers.list', 'outstanding', 'all')
  const [gstinFilter, setGstinFilter] = usePageFilter<string>('customers.list', 'gstin', 'all')
  const [sourceFilter, setSourceFilter] = usePageFilter<string>('customers.list', 'source', 'all')
  const [monthFilter, setMonthFilter] = usePageFilter<string>('customers.list', 'month', 'all')
  const [statusFilter, setStatusFilter] = usePageFilter<string>('customers.list', 'status', 'all')
  const [customFrom, setCustomFrom] = usePageFilter<string>('customers.list', 'from', '')
  const [customTo, setCustomTo] = usePageFilter<string>('customers.list', 'to', '')
  const [splitShowStats, setSplitShowStats] = usePageFilter<boolean>('customers.list', 'splitShowStats', true)
  const [payTab, setPayTab] = usePageFilter<PayTabKey>('customers.list', 'payTab', 'all')
  const [splitShowFilters, setSplitShowFilters] = useState(false)
  // Table-view filters panel — controlled so picking "Custom Range" for the
  // Added-date filter can auto-open the panel that holds the From/To pickers.
  const [tableFiltersOpen, setTableFiltersOpen] = useState(false)

  // Selecting "Custom Range" opens the filters panel where the custom From/To
  // date pickers live (table view), and the split-view filter panel too.
  const onMonthFilterChange = useCallback((val: string) => {
    if (val === 'custom') { setTableFiltersOpen(true); setSplitShowFilters(true) }
    else if (monthFilter === 'custom') { setTableFiltersOpen(false); setSplitShowFilters(false) }
    setMonthFilter(val)
  }, [monthFilter, setMonthFilter])

  const loadFilterPrefs = useFilterPrefsStore((s) => s.loadFromServer)
  useEffect(() => { loadFilterPrefs() }, [loadFilterPrefs])

  // Dialogs
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  // When Add is launched from the split view, remember the customer to return
  // to once the drawer closes.
  const [returnToSplitId, setReturnToSplitId] = useState<string | null>(null)

  // Auto-open the Add Customer dialog when arrived at with `?add=1` (sidebar
  // quick-add, or the split-view Add button which routes through table view
  // since the dialog only renders there). Reactive to the URL so it fires even
  // when already mounted; strips the params via the router so a refresh won't
  // re-trigger and routeSearch stays in sync.
  useEffect(() => {
    if (urlParams.get('add') !== '1') return
    setAddDialogOpen(true)
    const fromSplit = urlParams.get('fromSplit')
    if (fromSplit) setReturnToSplitId(fromSplit)
    const params = new URLSearchParams(routeSearch)
    params.delete('add')
    params.delete('fromSplit')
    // The dialog only renders in the table view, so ensure we're there (the
    // sidebar quick-add lands on the split-default view otherwise).
    params.set('view', 'table')
    const qs = params.toString()
    navigate(`/customers${qs ? `?${qs}` : ''}`, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeSearch])

  // Return to the originating customer's split page when the drawer closes, if
  // it was opened from there.
  const returnToSplitIfNeeded = useCallback(() => {
    if (returnToSplitId) {
      const id = returnToSplitId
      setReturnToSplitId(null)
      navigate(`/customers?customerId=${id}`)
    }
  }, [returnToSplitId])

  // Multi-sheet history import — handled in its own drawer.
  const [importDrawerOpen, setImportDrawerOpen] = useState(false)

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

  // Separate uploader for prescription documents (kept distinct from the
  // address-proof docs above so each is tagged correctly on the customer).
  const [rxFiles, setRxFiles] = useState<File[]>([])
  const [rxPreviews, setRxPreviews] = useState<{ name: string; preview: string | null }[]>([])

  const handleRxFiles = (files: FileList | null) => {
    if (!files) return
    const newFiles: File[] = []
    const newPreviews: { name: string; preview: string | null }[] = []
    Array.from(files).forEach((file) => {
      newFiles.push(file)
      newPreviews.push({ name: file.name, preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null })
    })
    setRxFiles(prev => [...prev, ...newFiles])
    setRxPreviews(prev => [...prev, ...newPreviews])
  }

  const removeRxFile = (idx: number) => {
    setRxFiles(prev => prev.filter((_, i) => i !== idx))
    setRxPreviews(prev => prev.filter((_, i) => i !== idx))
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
    if (sourceFilter !== 'all') params.set('customerSource', sourceFilter)
    if (monthFilter !== 'all') {
      const { from, to } = resolvePeriodRange(monthFilter, customFrom, customTo)
      if (from) params.set('createdFrom', from)
      if (to) params.set('createdTo', to)
    }
    if (statusFilter !== 'all') params.set('active', statusFilter === 'active' ? 'true' : 'false')
    // Payment-status folder — server-side so the list + pagination + counts all
    // agree (was client-side over the loaded pages, so "Paid" showed 0/empty).
    if (payTab !== 'all') params.set('paymentStatus', payTab)
    return params
  }, [currentPage, searchQuery, customerTypeFilter, outstandingFilter, gstinFilter, sourceFilter, monthFilter, customFrom, customTo, statusFilter, payTab])

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
        const isFirstPage = (currentPage - 1) * PAGE_SIZE === 0
        setPageRows(items)
        setAllCustomers((prev) => (isFirstPage ? items : [...prev, ...items]))
        setTotal(typeof payload?.total === 'number' ? payload.total : items.length)
      } catch (err: unknown) {
        const e = err as { name?: string; code?: string }
        if (e?.name !== 'CanceledError' && e?.code !== 'ERR_CANCELED') {
          setPageRows([])
          setAllCustomers([])
          setTotal(0)
        }
      } finally {
        setIsLoading(false)
      }
    }, delay)
    return () => clearTimeout(handle)
  }, [buildQueryParams, searchQuery, refreshToken])

  // ── Summary stat cards — reflect the active filters (same query the list
  // uses, minus pagination) so the totals track whatever the operator has
  // narrowed to. ──
  const fetchSummary = useCallback(async () => {
    try {
      const params = buildQueryParams()
      params.delete('skip')
      params.delete('take')
      // Drop the payment-status folder so the summary counts every status,
      // giving accurate Paid / Partial / Unpaid tab badges.
      params.delete('paymentStatus')
      const res = await api.get(`/customers/summary?${params.toString()}`)
      const data = res.data?.data ?? res.data
      if (data) setSummary(data)
    } catch { /* silent — leaves last good values */ }
  }, [buildQueryParams])

  // Debounce so typing in the search box doesn't fire a summary request per
  // keystroke — mirrors the list fetch's debounce.
  useEffect(() => {
    const handle = setTimeout(() => { fetchSummary() }, 250)
    return () => clearTimeout(handle)
  }, [fetchSummary, refreshToken])
  useBranchRefresh(fetchSummary)


  // Reset page to 1 whenever any filter or search changes
  useEffect(() => { setCurrentPage(1) }, [searchQuery, customerTypeFilter, outstandingFilter, gstinFilter, sourceFilter, monthFilter, customFrom, customTo, statusFilter])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const activeFilterCount =
    (customerTypeFilter !== 'all' ? 1 : 0) +
    (outstandingFilter !== 'all' ? 1 : 0) +
    (gstinFilter !== 'all' ? 1 : 0) +
    (sourceFilter !== 'all' ? 1 : 0) +
    (monthFilter !== 'all' ? 1 : 0) +
    (statusFilter !== 'all' ? 1 : 0)

  const clearFilters = () => {
    setCustomerTypeFilter('all')
    setOutstandingFilter('all')
    setGstinFilter('all')
    setSourceFilter('all')
    setMonthFilter('all')
    setCustomFrom('')
    setCustomTo('')
    setStatusFilter('all')
  }

  // Refresh list + summary + the global master-data cache (used by other pages' dropdowns).
  // Bumping `refreshToken` re-triggers the main list-fetch effect — keeps a
  // single source of truth for the fetch logic (loading state, abort, etc.).
  const refetchAll = useCallback(() => {
    fetchSummary()
    fetchCustomers()
    setRefreshToken((t) => t + 1)
  }, [fetchSummary, fetchCustomers])

  // Round-trip-compatible export. Mirrors the multi-sheet import template
  // structure so the operator can edit and re-upload via the Import drawer.
  // Fetches the full nested data tree (customers + all history) from the
  // dedicated /customers/export endpoint, then builds the workbook on the
  // client using the same column lists the parser uses.
  const handleExport = async () => {
    const params = buildQueryParams()
    params.delete('skip')
    params.delete('take')
    try {
      const res = await api.get(`/customers/export?${params.toString()}`)
      const data = res.data as CustomerExportPayload
      const activeBranch = useBranchStore.getState().activeBranch
      const user = useAuthStore.getState().user
      exportCustomersToWorkbook(data, {
        branchName: activeBranch?.name ?? null,
        exportedBy: user?.name ?? user?.email ?? null,
        exportedAt: new Date().toISOString(),
        schemaVersion: '1.0',
      })
      toast.success(
        `Exported ${data.customers.length} customer${data.customers.length === 1 ? '' : 's'} with full history.`,
      )
    } catch {
      toast.error('Failed to export customers')
    }
  }

  // Import is handled inside ImportCustomersDrawer — it runs preview + commit
  // against /customers/import/* endpoints and pulls in full customer history
  // (invoices, payments, activities, prescriptions) in one transaction.

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
      source: '',
      notes: '',
      whatsappOptIn: true,
    },
  })

  // Soft-disable / re-enable a customer (replaces hard delete). Reversible, so
  // it runs directly without a destructive confirmation dialog.
  const handleToggleActive = async (customer: Customer) => {
    const next = customer.isActive === false // currently inactive → activate
    try {
      await api.patch(`/customers/${customer.id}/active`, { isActive: next })
      toast.success(`Customer "${customer.name}" ${next ? 'activated' : 'deactivated'}`)
      refetchAll()
    } catch (error: unknown) {
      const msg = (error as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? `Failed to ${next ? 'activate' : 'deactivate'} customer`
      toast.error(msg)
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
      source: customer.source ?? '',
      notes: customer.notes ?? '',
      // Legacy customers with null/undefined whatsappOptIn → treat as opted in
      // (matches the schema default of true).
      whatsappOptIn: (customer as { whatsappOptIn?: boolean }).whatsappOptIn ?? true,
    })
    setDocFiles([])
    setDocPreviews([])
    setRxFiles([])
    setRxPreviews([])
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
          setRxFiles([])
          setRxPreviews([])
          setPhoneCheckError('')
          setEditingCustomer(null)
          setAddDialogOpen(false)
          returnToSplitIfNeeded()
          return
        }
        customerId = result?.id ?? ''
        toast.success(`Customer "${values.name}" added successfully`)
      }
      // Upload address-proof documents, then prescription documents — each
      // tagged so they're distinguishable on the customer's record.
      if (customerId) {
        const uploads: Array<{ file: File; tag: string }> = [
          ...docFiles.map((file) => ({ file, tag: 'Document' })),
          ...rxFiles.map((file) => ({ file, tag: 'Prescription' })),
        ]
        for (const { file, tag } of uploads) {
          try {
            const formData = new FormData()
            formData.append('file', file)
            formData.append('customerId', customerId)
            formData.append('doctorName', tag)
            await api.post('/prescriptions/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
          } catch {
            toast.warning(`Uploaded customer but failed to upload "${file.name}"`)
          }
        }
      }
      form.reset()
      setDocFiles([])
      setDocPreviews([])
      setRxFiles([])
      setRxPreviews([])
      setPhoneCheckError('')
      setEditingCustomer(null)
      setAddDialogOpen(false)
      returnToSplitIfNeeded()
      refetchAll()
    } catch {
      toast.error(editingCustomer ? 'Failed to update customer' : 'Failed to add customer')
    }
  }

  const handleViewDetails = (customer: Customer) => {
    navigate(`/customers/detail?customerId=${customer.id}`)
  }

  if (effectiveView === 'split') {
    return (
      <div className="flex h-full min-h-0 min-w-0 flex-col gap-2">
        {/* Collapsible stats */}
        <AnimatePresence>
          {splitShowStats && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {([
                  { label: 'Total', value: summary.total.toLocaleString(), sub: 'customers', borderAccent: 'border-l-blue-500' },
                  { label: 'With Outstanding', value: summary.withOutstanding.toLocaleString(), sub: 'have balance', borderAccent: 'border-l-rose-500' },
                  { label: 'Total Billed', value: `₹${(summary.totalAmount / 1000).toFixed(0)}k`, sub: 'all time', borderAccent: 'border-l-emerald-500' },
                  { label: 'Outstanding', value: `₹${(summary.totalOutstanding / 1000).toFixed(0)}k`, sub: 'pending', borderAccent: 'border-l-amber-500' },
                ] as const).map((s) => (
                  <Card key={s.label} className={`border-l-[3px] ${s.borderAccent}`}>
                    <CardContent className="flex items-center gap-2 p-3">
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{s.label}</p>
                        <p className="font-mono text-sm font-bold leading-tight">{s.value}</p>
                        <p className="text-[10px] text-muted-foreground">{s.sub}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Toolbar */}
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="mr-1.5 h-4 w-4" />
            <span className="hidden sm:inline">Export</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => setImportDrawerOpen(true)}>
            <Upload className="mr-1.5 h-4 w-4" />
            <span className="hidden sm:inline">Import</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            title="Toggle filters"
            onClick={() => setSplitShowFilters(!splitShowFilters)}
            className={splitShowFilters ? 'border-primary/50 bg-primary/5' : ''}
          >
            <Filter className="h-4 w-4" />
            {activeFilterCount > 0 && (
              <span className="ml-1.5 flex h-4 min-w-4 items-center justify-center rounded bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                {activeFilterCount}
              </span>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            title={splitShowStats ? 'Hide stats' : 'Show stats'}
            onClick={() => setSplitShowStats(!splitShowStats)}
            className={splitShowStats ? 'border-primary/50 bg-primary/5' : ''}
          >
            <BarChart3 className="h-4 w-4" />
          </Button>
          <Button size="sm" onClick={() => navigate(`/customers?view=table&add=1${selectedCustomerId ? `&fromSplit=${selectedCustomerId}` : ''}`)}>
            <Plus className="mr-1.5 h-4 w-4" />
            <span className="hidden sm:inline">Add Customer</span>
          </Button>
          <ViewModeToggle view="split" onViewChange={(v) => { if (v === 'table') exitSplitView() }} />
        </div>

        {/* Collapsible filter panel */}
        <AnimatePresence>
          {splitShowFilters && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="rounded-lg border border-border/40 bg-muted/20 p-4">
                <div className="flex flex-wrap items-end gap-3 *:flex-1 *:min-w-35">
                  <EnumSelect label="Type" value={customerTypeFilter} onValueChange={setCustomerTypeFilter} onClear={() => setCustomerTypeFilter('all')} options={CUSTOMER_TYPE_OPTIONS} />
                  <EnumSelect label="Outstanding" value={outstandingFilter} onValueChange={setOutstandingFilter} onClear={() => setOutstandingFilter('all')} options={OUTSTANDING_OPTIONS} />
                  <EnumSelect label="Status" value={statusFilter} onValueChange={setStatusFilter} onClear={() => setStatusFilter('all')} options={STATUS_OPTIONS} />
                  <EnumSelect label="Source" value={sourceFilter} onValueChange={setSourceFilter} onClear={() => setSourceFilter('all')} options={SOURCE_FILTER_OPTIONS} />
                  <EnumSelect label="Period Added" value={monthFilter} onValueChange={onMonthFilterChange} onClear={() => onMonthFilterChange('all')} options={PERIOD_OPTIONS} />
                  {monthFilter === 'custom' && (
                    <>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Date From</Label>
                        <DatePicker value={customFrom} max={customTo || undefined} onChange={(v) => setCustomFrom(v)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Date To</Label>
                        <DatePicker value={customTo} min={customFrom || undefined} onChange={(v) => setCustomTo(v)} />
                      </div>
                    </>
                  )}
                  <div className="flex-none! min-w-0! flex items-end gap-2">
                    <ColumnsToggle
                      columns={CARD_FIELDS}
                      visible={cardCols.visible}
                      onToggle={cardCols.toggle}
                      onReset={cardCols.reset}
                    />
                    {activeFilterCount > 0 && (
                      <Button variant="ghost" size="sm" onClick={clearFilters}>
                        <X className="mr-1 h-3.5 w-3.5" />Clear all
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Split view */}
        <div className="min-h-0 flex-1">
          <CustomerSplitView
            customers={allCustomers}
            loading={isLoading && currentPage === 1}
            loadingMore={isLoading && currentPage > 1}
            hasMore={allCustomers.length < total && !isLoading}
            onLoadMore={() => setCurrentPage((p) => p + 1)}
            selectedCustomerId={selectedCustomerId}
            onSelectCustomer={selectCustomer}
            onExitSplitView={exitSplitView}
            onRefresh={() => setRefreshToken((t) => t + 1)}
            isCardFieldVisible={cardCols.isVisible}
            searchValue={searchQuery}
            onSearchChange={setSearchQuery}
            tabsNode={
              <CustomerPaymentTabs
                tab={payTab}
                onChange={(t) => { setPayTab(t); selectCustomer(null); setCurrentPage(1) }}
                counts={{
                  all: summary.total,
                  PAID: summary.paidCount,
                  PARTIAL: summary.partialCount,
                  UNPAID: summary.unpaidCount,
                }}
              />
            }
          />
        </div>

        {/* Import drawer — also reachable from the split-view toolbar */}
        <ImportCustomersDrawer
          open={importDrawerOpen}
          onOpenChange={setImportDrawerOpen}
          onImported={refetchAll}
        />
      </div>
    )
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* ─── Summary Cards (clickable drill-down → drives the Outstanding filter) ─── */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-5">
        {([
          {
            label: 'Total Customers',
            value: summary.total.toString(),
            subtitle: 'directory',
            icon: Users,
            iconBg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
            borderAccent: 'border-l-blue-500',
            // "Total" clears the outstanding narrowing back to all customers.
            filterKey: 'all' as const,
            activeRing: 'ring-2 ring-blue-500/50',
          },
          {
            label: 'With Outstanding',
            value: summary.withOutstanding.toString(),
            subtitle: 'pending dues',
            icon: AlertCircle,
            iconBg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
            borderAccent: 'border-l-amber-500',
            filterKey: 'has' as const,
            activeRing: 'ring-2 ring-amber-500/50',
          },
          {
            label: 'Total Amount',
            value: formatCurrency(summary.totalAmount),
            subtitle: 'billed across all invoices',
            icon: Wallet,
            iconBg: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
            borderAccent: 'border-l-violet-500',
            // Informational only — not a filter.
            filterKey: null,
            activeRing: '',
          },
          {
            label: 'Paid Amount',
            value: formatCurrency(summary.paidAmount),
            subtitle: 'collected across all invoices',
            icon: CheckCircle2,
            iconBg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
            borderAccent: 'border-l-emerald-500',
            filterKey: null,
            activeRing: '',
          },
          {
            label: 'Total Outstanding',
            value: formatCurrency(summary.totalOutstanding),
            subtitle: 'across all customers',
            icon: IndianRupee,
            iconBg: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
            borderAccent: 'border-l-rose-500',
            // Same server filter as "With Outstanding" — both narrow to
            // customers carrying dues (hasOutstanding=true).
            filterKey: 'has' as const,
            activeRing: 'ring-2 ring-rose-500/50',
          },
        ] as Array<{
          label: string
          value: string
          subtitle: string
          icon: typeof Users
          iconBg: string
          borderAccent: string
          filterKey: 'all' | 'has' | null
          activeRing: string
        }>).map((stat) => {
          const interactive = stat.filterKey !== null
          const active = !interactive
            ? false
            : stat.filterKey === 'all'
            ? outstandingFilter === 'all'
            : outstandingFilter === stat.filterKey
          const apply = () => { if (stat.filterKey !== null) { setOutstandingFilter(stat.filterKey); setCurrentPage(1) } }
          return (
          <Card
            key={stat.label}
            hover={interactive}
            role={interactive ? 'button' : undefined}
            tabIndex={interactive ? 0 : undefined}
            title={interactive ? (stat.filterKey === 'all' ? 'Show all customers' : 'Filter to customers with outstanding dues') : undefined}
            onClick={interactive ? apply : undefined}
            onKeyDown={interactive ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); apply() } } : undefined}
            className={cn('border-l-[3px] transition-shadow', interactive && 'cursor-pointer', stat.borderAccent, active && stat.activeRing)}
          >
            <CardContent className="flex items-center gap-2 p-3 sm:gap-4 sm:p-4">
              <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:h-10 sm:w-10', stat.iconBg)}>
                <stat.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {stat.label}
                </p>
                <p className="text-base font-bold font-mono leading-tight truncate sm:text-lg" title={stat.value}>{stat.value}</p>
                <p className="truncate text-[11px] text-muted-foreground">{stat.subtitle}</p>
              </div>
            </CardContent>
          </Card>
          )
        })}
      </motion.div>

      {/* ─── Search + Filters ─── */}
      <DataTableFilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search by name, phone, or GSTIN..."
        resultsCount={total}
        activeFilterCount={activeFilterCount}
        open={tableFiltersOpen}
        onOpenChange={setTableFiltersOpen}
        onClearFilters={clearFilters}
        columnsNode={<ColumnsToggle columns={CUSTOMER_COLUMNS} visible={cols.visible} onToggle={cols.toggle} onReset={cols.reset} />}
        actionNode={
          <div className="flex w-full flex-wrap items-center justify-end gap-1.5 sm:w-auto sm:flex-nowrap">
            <Button variant="outline" size="sm" className="flex-1 sm:w-auto sm:flex-none" onClick={handleExport}>
              <Download className="mr-1.5 h-4 w-4" />
              Export
            </Button>
            <Button variant="outline" size="sm" className="flex-1 sm:w-auto sm:flex-none" onClick={() => setImportDrawerOpen(true)}>
              <Upload className="mr-1.5 h-4 w-4" />
              Import
            </Button>
            <Button size="sm" className="w-full sm:w-auto" onClick={() => setAddDialogOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              <span className="hidden sm:inline">Add Customer</span>
              <span className="sm:hidden">Add</span>
            </Button>
            <ViewModeToggle view="table" onViewChange={(v) => { if (v === 'split') navigate('/customers') }} />
          </div>
        }
      >
        <div className="col-span-full grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <EnumSelect
            label="Type"
            value={customerTypeFilter}
            onValueChange={setCustomerTypeFilter}
            onClear={() => setCustomerTypeFilter('all')}
            options={CUSTOMER_TYPE_OPTIONS}
          />
          <EnumSelect
            label="Source"
            value={sourceFilter}
            onValueChange={setSourceFilter}
            onClear={() => setSourceFilter('all')}
            options={SOURCE_FILTER_OPTIONS}
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
          <EnumSelect
            label="Status"
            value={statusFilter}
            onValueChange={setStatusFilter}
            onClear={() => setStatusFilter('all')}
            options={STATUS_OPTIONS}
          />
          <EnumSelect
            label="Added"
            value={monthFilter}
            onValueChange={onMonthFilterChange}
            onClear={() => { onMonthFilterChange('all'); setCustomFrom(''); setCustomTo('') }}
            options={PERIOD_OPTIONS}
          />
          {monthFilter === 'custom' && (
            <>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">From</label>
                <DatePicker
                  className="h-9"
                  value={customFrom}
                  max={customTo || undefined}
                  onChange={(v) => setCustomFrom(v)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">To</label>
                <DatePicker
                  className="h-9"
                  value={customTo}
                  min={customFrom || undefined}
                  onChange={(v) => setCustomTo(v)}
                />
              </div>
            </>
          )}
        </div>
      </DataTableFilterBar>

      {/* ─── Payment status tabs (All / Paid / Partial / Unpaid) ─── */}
      <motion.div variants={itemVariants} className="overflow-x-auto">
        <CustomerPaymentTabs
          tab={payTab}
          onChange={(t) => { setPayTab(t); setCurrentPage(1) }}
          counts={{
            all: summary.total,
            PAID: summary.paidCount,
            PARTIAL: summary.partialCount,
            UNPAID: summary.unpaidCount,
          }}
        />
      </motion.div>

      {/* ─── Customers Table ─── */}
      <motion.div variants={itemVariants}>
        <Card className="overflow-x-auto">
          <CardContent className="p-0">
            {/* Mobile + Tablet card list (hidden on lg+). Mobile has no header,
                so the empty state replaces the rows entirely here. */}
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
              <div className="divide-y divide-border/40">
                {!isLoading && pageRows.map((customer) => (
                  <div
                    key={customer.id}
                    role="button"
                    tabIndex={0}
                    className="flex items-center gap-3 px-4 py-3.5 hover:bg-muted/30 active:bg-muted/50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:bg-muted/30"
                    onClick={() => handleViewDetails(customer)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleViewDetails(customer) } }}
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
                            customer.isActive === false
                              ? { label: 'Activate', icon: <CheckCircle2 className="h-4 w-4" />, onClick: () => handleToggleActive(customer) }
                              : { label: 'Deactivate', icon: <Ban className="h-4 w-4" />, onClick: () => handleToggleActive(customer), variant: 'destructive' as const },
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
                  {cols.isVisible('phone') && <TableHead>Phone</TableHead>}
                  {cols.isVisible('type') && <TableHead>Type</TableHead>}
                  {cols.isVisible('source') && <TableHead>Source</TableHead>}
                  {cols.isVisible('totalAmount') && <TableHead className="text-right">Total Amount</TableHead>}
                  {cols.isVisible('paidAmount') && <TableHead className="text-right">Paid Amount</TableHead>}
                  {cols.isVisible('outstanding') && <TableHead className="text-right">Outstanding</TableHead>}
                  {cols.isVisible('pending') && <TableHead className="text-right">Pending</TableHead>}
                  {cols.isVisible('status') && <TableHead>Status</TableHead>}
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!isLoading && pageRows.length === 0 && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={cols.visible.length + 1} className="p-0">
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
                    </TableCell>
                  </TableRow>
                )}
                {pageRows.map((customer) => (
                  <TableRow
                    key={customer.id}
                    className={cn(
                      'border-l-2 cursor-pointer hover:bg-muted/30',
                      typeBorderColor[customer.type] || 'border-l-transparent'
                    )}
                    onClick={() => handleViewDetails(customer)}
                  >
                    <TableCell className="text-sm font-bold">
                      <span className="flex items-center gap-2">
                        <span
                          role="link"
                          tabIndex={0}
                          title="View customer details"
                          className="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer truncate"
                          onClick={(e) => { e.stopPropagation(); handleViewDetails(customer) }}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); handleViewDetails(customer) } }}
                        >
                          {customer.name}
                        </span>
                      </span>
                    </TableCell>
                    {cols.isVisible('phone') && <TableCell className="text-muted-foreground">{customer.phone}</TableCell>}
                    {cols.isVisible('type') && (
                    <TableCell>
                      <Badge
                        variant={typeBadgeVariant[customer.type] || 'secondary'}
                        size="sm"
                        dot
                      >
                        {customer.type.charAt(0) + customer.type.slice(1).toLowerCase()}
                      </Badge>
                    </TableCell>
                    )}
                    {cols.isVisible('source') && (
                    <TableCell>
                      {customer.source ? (
                        <Badge variant="secondary" size="sm">{customer.source}</Badge>
                      ) : (
                        <span className="text-muted-foreground/50">—</span>
                      )}
                    </TableCell>
                    )}
                    {cols.isVisible('totalAmount') && (
                    <TableCell className="text-right font-mono text-[15px] font-semibold">
                      {formatCurrency(customer.totalAmount ?? 0)}
                    </TableCell>
                    )}
                    {cols.isVisible('paidAmount') && (
                    <TableCell className="text-right font-mono text-[15px] font-semibold text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(customer.paidAmount ?? 0)}
                    </TableCell>
                    )}
                    {cols.isVisible('outstanding') && (
                    <TableCell
                      className={cn(
                        'text-right font-mono text-[15px] font-bold',
                        outstandingColor(customer.currentOutstanding)
                      )}
                    >
                      {formatCurrency(customer.currentOutstanding)}
                    </TableCell>
                    )}
                    {cols.isVisible('pending') && (
                    <TableCell className="text-right">
                      {Number(customer.pendingCreditCount ?? 0) > 0 ? (
                        <Badge variant="warning" size="sm" className="font-mono tabular-nums text-sm font-bold px-2.5 py-0.5">
                          {customer.pendingCreditCount}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground/50">—</span>
                      )}
                    </TableCell>
                    )}
                    {cols.isVisible('status') && (
                    <TableCell>
                      {customer.isActive === false ? (
                        <Badge variant="secondary" size="sm" dot className="text-muted-foreground">Inactive</Badge>
                      ) : (
                        <Badge variant="success" size="sm" dot>Active</Badge>
                      )}
                    </TableCell>
                    )}
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
                            customer.isActive === false
                              ? {
                                  label: 'Activate',
                                  icon: <CheckCircle2 className="h-4 w-4" />,
                                  onClick: () => handleToggleActive(customer),
                                }
                              : {
                                  label: 'Deactivate',
                                  icon: <Ban className="h-4 w-4" />,
                                  onClick: () => handleToggleActive(customer),
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

      {/* ─── Add / Edit Customer Drawer ─── */}
      <Sheet open={addDialogOpen} onOpenChange={(open) => {
        if (!open) { setEditingCustomer(null); form.reset(); setDocFiles([]); setDocPreviews([]); setRxFiles([]); setRxPreviews([]); setPhoneCheckError('') }
        setAddDialogOpen(open)
        if (!open) returnToSplitIfNeeded()
      }}>
        {/* Side-drawer — full-width on mobile, fixed 640px on sm+ */}
        <SheetContent
          side="right"
          className="w-full sm:max-w-160 p-0 gap-0 flex flex-col"
        >
          <SheetHeader className="px-5 pt-5 pb-4 border-b border-border/40 shrink-0 space-y-0">
            <SheetTitle>{editingCustomer ? 'Edit Customer' : 'Add New Customer'}</SheetTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Name, Phone, Type and Address are required. Email and Referred By are optional.
            </p>
          </SheetHeader>
          <form onSubmit={form.handleSubmit(handleSaveCustomer)} className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">

              {/* Row 1: Name + Phone */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                    pattern="[0-9]{10}"
                    maxLength={10}
                    autoComplete="tel"
                    error={!!form.formState.errors.phone || !!phoneCheckError}
                    onBlur={(e) => checkPhoneDuplicate(e.target.value)}
                  />
                  {form.formState.errors.phone && <p className="text-xs text-rose-500">{form.formState.errors.phone.message}</p>}
                  {!form.formState.errors.phone && phoneCheckError && <p className="text-xs text-rose-500">{phoneCheckError}</p>}
                </div>
              </div>

              {/* Row 2: Type + Email (optional) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

              {/* Row 4: Referred By + Source */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Referred By <span className="text-muted-foreground/50 font-normal normal-case">(optional)</span></Label>
                  <Controller control={form.control} name="referredBy" render={({ field }) => (
                    <Select value={field.value || ''} onValueChange={field.onChange}>
                      <SelectTrigger className={form.formState.errors.referredBy ? 'border-rose-500' : ''}>
                        <SelectValue placeholder="Select salesperson" />
                      </SelectTrigger>
                      <SelectContent>
                        {salespersons.length === 0 ? (
                          <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                            No salespersons found
                          </div>
                        ) : (
                          salespersons.map((sp) => (
                            <SelectItem key={sp.id} value={sp.name}>{sp.name}</SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  )} />
                  {form.formState.errors.referredBy && <p className="text-xs text-rose-500">{form.formState.errors.referredBy.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Source <span className="text-muted-foreground/50 font-normal normal-case">(optional)</span></Label>
                  <Controller control={form.control} name="source" render={({ field }) => (
                    <Select value={field.value || ''} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="How acquired?" />
                      </SelectTrigger>
                      <SelectContent>
                        {CUSTOMER_SOURCES.map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )} />
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

              {/* Row 6b: Prescription Document — separate multi-upload */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Prescription Document</Label>
                  {rxFiles.length > 0 && (
                    <span className="text-[10px] text-muted-foreground">{rxFiles.length} file{rxFiles.length !== 1 ? 's' : ''} selected</span>
                  )}
                </div>

                {/* Uploaded file list */}
                {rxPreviews.length > 0 && (
                  <div className="space-y-1.5">
                    {rxPreviews.map((doc, idx) => (
                      <div key={idx} className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
                        {doc.preview ? (
                          <img src={doc.preview} alt={doc.name} className="h-8 w-10 rounded object-cover shrink-0" />
                        ) : (
                          <div className="flex h-8 w-10 shrink-0 items-center justify-center rounded bg-muted">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                        <span className="min-w-0 flex-1 truncate text-xs text-foreground">{doc.name}</span>
                        <button type="button" onClick={() => removeRxFile(idx)}
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
                  <p className="text-[11px] text-muted-foreground text-center">Upload prescription document only</p>
                  <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted/40 transition shadow-sm">
                    <Upload className="h-3.5 w-3.5 text-amber-500" />
                    Add Files
                    <input
                      type="file"
                      className="sr-only"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      multiple
                      onChange={(e) => handleRxFiles(e.target.files)}
                    />
                  </label>
                </div>
              </div>

              {/* Row 7: Notes (full width) */}
              <div className="space-y-1.5">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Notes</Label>
                <Textarea {...form.register('notes')} placeholder="Additional notes (optional)" rows={2} />
              </div>

              {/* Row 8: WhatsApp opt-in toggle. Controls whether invoices +
                  payment QRs auto-deliver to this customer's phone via Meta
                  Cloud API. Defaults on; toggle off for customers who opt out. */}
              <div className="flex items-start gap-3 rounded-lg border border-dashed border-border/60 bg-muted/30 p-3">
                <Controller
                  control={form.control}
                  name="whatsappOptIn"
                  render={({ field }) => (
                    <Switch
                      checked={field.value ?? true}
                      onCheckedChange={field.onChange}
                      className="mt-0.5"
                    />
                  )}
                />
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium leading-none cursor-pointer">
                    Send WhatsApp messages to this customer
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Invoices and payment QR codes will be auto-delivered to the phone number above.
                    Turn off if the customer prefers not to receive WhatsApp messages.
                  </p>
                </div>
              </div>

            </div>
            <div className="shrink-0 flex items-center justify-end gap-3 px-5 py-3 bg-background border-t border-border/40">
              <Button type="button" variant="outline" onClick={() => { setEditingCustomer(null); form.reset(); setDocFiles([]); setDocPreviews([]); setRxFiles([]); setRxPreviews([]); setPhoneCheckError(''); setAddDialogOpen(false); returnToSplitIfNeeded() }}>Cancel</Button>
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
        </SheetContent>
      </Sheet>

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

      {/* ─── Customer + History Import Drawer ─── */}
      <ImportCustomersDrawer
        open={importDrawerOpen}
        onOpenChange={setImportDrawerOpen}
        onImported={refetchAll}
      />
    </motion.div>
  )
}
