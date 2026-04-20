import { useState, useEffect, useMemo, useCallback } from 'react'
import api from '@/lib/api'
import { useBranchStore } from '@/stores/branchStore'
import { useBranchRefresh } from '@/hooks/useBranchRefresh'
import { motion, type Variants } from 'framer-motion'
import { useForm, Controller } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import {
  Building2,
  Receipt,
  Users,
  Bell,
  Printer,
  Percent,
  Database,
  Shield,
  Settings,
  Save,
  Plus,
  Pencil,
  Trash2,
  Power,
  Send,
  Eye,
  EyeOff,
  Download,
  Clock,
  Search,
  ChevronRight,
  Check,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { DataTableFilterBar } from '@/components/shared/DataTableFilterBar'
import { DataTableRowActions } from '@/components/shared/DataTableRowActions'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { cn, formatDate, formatDateTime } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────
// Animation variants
// ─────────────────────────────────────────────────────────────

const pageEntryVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: 'easeOut' as const },
  },
}

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
// Settings sections
// ─────────────────────────────────────────────────────────────

interface SettingsSection {
  id: string
  label: string
  icon: LucideIcon
  description: string
}

const settingsSections: SettingsSection[] = [
  { id: 'business', label: 'Business Profile', icon: Building2, description: 'Company details & invoicing' },
  { id: 'tax', label: 'Tax Configuration', icon: Receipt, description: 'GST rates & tax settings' },
  { id: 'users', label: 'User Management', icon: Users, description: 'Roles & permissions' },
  { id: 'notifications', label: 'Notifications', icon: Bell, description: 'SMS, email & templates' },
  { id: 'printer', label: 'Printer Settings', icon: Printer, description: 'Invoice & label formats' },
  { id: 'discounts', label: 'Discount Rules', icon: Percent, description: 'Auto & manual discounts' },
  { id: 'backup', label: 'Backup & Data', icon: Database, description: 'Backups & data management' },
  { id: 'audit', label: 'Audit Trail', icon: Shield, description: 'System change log' },
  { id: 'general', label: 'General', icon: Settings, description: 'App-wide preferences' },
]

// ─────────────────────────────────────────────────────────────
// Mock GST rates
// ─────────────────────────────────────────────────────────────

interface GstRate {
  id: string
  hsnCode: string
  description: string
  cgst: number
  sgst: number
  igst: number
}

const initialGstRates: GstRate[] = [
  { id: 'GST-001', hsnCode: '30049099', description: 'Medicaments (Pharma)', cgst: 6, sgst: 6, igst: 12 },
  { id: 'GST-002', hsnCode: '30021200', description: 'Antisera & Blood Products', cgst: 6, sgst: 6, igst: 12 },
  { id: 'GST-003', hsnCode: '30021400', description: 'Immunological Products', cgst: 6, sgst: 6, igst: 12 },
  { id: 'GST-004', hsnCode: '30039000', description: 'Medicaments (General)', cgst: 9, sgst: 9, igst: 18 },
  { id: 'GST-005', hsnCode: '90189090', description: 'Surgical Instruments', cgst: 6, sgst: 6, igst: 12 },
]

// ─────────────────────────────────────────────────────────────
// Mock discount rules
// ─────────────────────────────────────────────────────────────

interface DiscountRule {
  id: string
  name: string
  type: 'PERCENTAGE' | 'FLAT'
  value: number
  applicableTo: string
  validFrom: string
  validTo: string
  isActive: boolean
}

const initialDiscountRules: DiscountRule[] = [
  { id: 'DR-001', name: 'Hospital Bulk Discount', type: 'PERCENTAGE', value: 10, applicableTo: 'Hospital Customers', validFrom: '2026-01-01', validTo: '2026-12-31', isActive: true },
  { id: 'DR-002', name: 'Wholesale Slab Discount', type: 'PERCENTAGE', value: 15, applicableTo: 'Wholesale Buyers', validFrom: '2026-01-01', validTo: '2026-06-30', isActive: true },
  { id: 'DR-003', name: 'Near-Expiry Clearance', type: 'PERCENTAGE', value: 25, applicableTo: 'Expiring in 90 days', validFrom: '2026-03-01', validTo: '2026-03-31', isActive: true },
  { id: 'DR-004', name: 'Loyalty Reward', type: 'FLAT', value: 500, applicableTo: 'Loyalty Points > 1000', validFrom: '2026-01-01', validTo: '2026-12-31', isActive: false },
  { id: 'DR-005', name: 'Oncology Bundle', type: 'PERCENTAGE', value: 8, applicableTo: 'Oncology Category', validFrom: '2026-02-01', validTo: '2026-05-31', isActive: true },
]

// ─────────────────────────────────────────────────────────────
// Mock backup history
// ─────────────────────────────────────────────────────────────

interface BackupEntry {
  id: string
  date: string
  size: string
  type: 'AUTO' | 'MANUAL'
  status: 'COMPLETED' | 'FAILED'
}

const backupHistory: BackupEntry[] = [
  { id: 'BK-001', date: '2026-03-21T06:00:00Z', size: '245 MB', type: 'AUTO', status: 'COMPLETED' },
  { id: 'BK-002', date: '2026-03-20T06:00:00Z', size: '243 MB', type: 'AUTO', status: 'COMPLETED' },
  { id: 'BK-003', date: '2026-03-19T14:30:00Z', size: '242 MB', type: 'MANUAL', status: 'COMPLETED' },
  { id: 'BK-004', date: '2026-03-19T06:00:00Z', size: '241 MB', type: 'AUTO', status: 'FAILED' },
  { id: 'BK-005', date: '2026-03-18T06:00:00Z', size: '240 MB', type: 'AUTO', status: 'COMPLETED' },
  { id: 'BK-006', date: '2026-03-17T06:00:00Z', size: '239 MB', type: 'AUTO', status: 'COMPLETED' },
  { id: 'BK-007', date: '2026-03-16T11:15:00Z', size: '238 MB', type: 'MANUAL', status: 'COMPLETED' },
]

// ─────────────────────────────────────────────────────────────
// Mock audit trail (20+ entries)
// ─────────────────────────────────────────────────────────────

interface AuditEntry {
  id: string
  timestamp: string
  user: string
  module: string
  action: string
  entity: string
  field: string
  oldValue: string
  newValue: string
}

const auditTrailData: AuditEntry[] = [
  { id: 'AUD-001', timestamp: '2026-03-21T10:30:00Z', user: 'Admin', module: 'Inventory', action: 'Update', entity: 'PRD-001', field: 'sellingRate', oldValue: '75.00', newValue: '78.00' },
  { id: 'AUD-002', timestamp: '2026-03-21T10:15:00Z', user: 'Ravi Shankar', module: 'Billing', action: 'Create', entity: 'INV-00430', field: '-', oldValue: '-', newValue: 'New Invoice' },
  { id: 'AUD-003', timestamp: '2026-03-21T09:45:00Z', user: 'Kumar Selvam', module: 'Inventory', action: 'Adjust', entity: 'PRD-008', field: 'totalStock', oldValue: '20', newValue: '15' },
  { id: 'AUD-004', timestamp: '2026-03-21T09:30:00Z', user: 'Admin', module: 'Settings', action: 'Update', entity: 'Business Profile', field: 'phone', oldValue: '04522345678', newValue: '04522345679' },
  { id: 'AUD-005', timestamp: '2026-03-21T09:00:00Z', user: 'Priya Lakshmi', module: 'Accounting', action: 'Create', entity: 'RCT-00125', field: '-', oldValue: '-', newValue: 'Payment Receipt' },
  { id: 'AUD-006', timestamp: '2026-03-20T17:30:00Z', user: 'Ravi Shankar', module: 'Billing', action: 'Return', entity: 'INV-00425', field: 'status', oldValue: 'PAID', newValue: 'RETURNED' },
  { id: 'AUD-007', timestamp: '2026-03-20T16:45:00Z', user: 'Admin', module: 'Users', action: 'Deactivate', entity: 'USR-005', field: 'isActive', oldValue: 'true', newValue: 'false' },
  { id: 'AUD-008', timestamp: '2026-03-20T16:00:00Z', user: 'Kumar Selvam', module: 'Purchase', action: 'Create', entity: 'PO-00089', field: '-', oldValue: '-', newValue: 'New Purchase Order' },
  { id: 'AUD-009', timestamp: '2026-03-20T15:30:00Z', user: 'Admin', module: 'Inventory', action: 'Update', entity: 'PRD-013', field: 'minStock', oldValue: '20', newValue: '25' },
  { id: 'AUD-010', timestamp: '2026-03-20T14:20:00Z', user: 'Ravi Shankar', module: 'Billing', action: 'Create', entity: 'INV-00429', field: '-', oldValue: '-', newValue: 'New Invoice' },
  { id: 'AUD-011', timestamp: '2026-03-20T13:00:00Z', user: 'Priya Lakshmi', module: 'Accounting', action: 'Create', entity: 'PV-00047', field: '-', oldValue: '-', newValue: 'Payment Voucher' },
  { id: 'AUD-012', timestamp: '2026-03-20T11:45:00Z', user: 'Kumar Selvam', module: 'Purchase', action: 'Receive', entity: 'GRN-00034', field: 'status', oldValue: 'DRAFT', newValue: 'RECEIVED' },
  { id: 'AUD-013', timestamp: '2026-03-20T10:30:00Z', user: 'Admin', module: 'Settings', action: 'Update', entity: 'Tax Config', field: 'taxMode', oldValue: 'INCLUSIVE', newValue: 'EXCLUSIVE' },
  { id: 'AUD-014', timestamp: '2026-03-19T17:00:00Z', user: 'Ravi Shankar', module: 'Customers', action: 'Create', entity: 'CUS-012', field: '-', oldValue: '-', newValue: 'New Customer' },
  { id: 'AUD-015', timestamp: '2026-03-19T16:15:00Z', user: 'Admin', module: 'Inventory', action: 'Create', entity: 'PRD-023', field: '-', oldValue: '-', newValue: 'New Product' },
  { id: 'AUD-016', timestamp: '2026-03-19T15:00:00Z', user: 'Kumar Selvam', module: 'Inventory', action: 'Transfer', entity: 'TRF-00012', field: 'rack', oldValue: 'A1-01', newValue: 'A2-03' },
  { id: 'AUD-017', timestamp: '2026-03-19T14:30:00Z', user: 'Admin', module: 'Settings', action: 'Backup', entity: 'System', field: '-', oldValue: '-', newValue: 'Manual Backup' },
  { id: 'AUD-018', timestamp: '2026-03-19T13:00:00Z', user: 'Priya Lakshmi', module: 'Billing', action: 'Update', entity: 'INV-00420', field: 'paymentMode', oldValue: 'CREDIT', newValue: 'CASH' },
  { id: 'AUD-019', timestamp: '2026-03-19T11:30:00Z', user: 'Ravi Shankar', module: 'Billing', action: 'Create', entity: 'QTN-00015', field: '-', oldValue: '-', newValue: 'New Quotation' },
  { id: 'AUD-020', timestamp: '2026-03-19T10:00:00Z', user: 'Admin', module: 'Users', action: 'Create', entity: 'USR-005', field: '-', oldValue: '-', newValue: 'New User' },
  { id: 'AUD-021', timestamp: '2026-03-18T17:30:00Z', user: 'Kumar Selvam', module: 'Inventory', action: 'Update', entity: 'PRD-004', field: 'rackLocation', oldValue: 'A2-03', newValue: 'A2-04' },
  { id: 'AUD-022', timestamp: '2026-03-18T16:00:00Z', user: 'Admin', module: 'Settings', action: 'Update', entity: 'Discount Rules', field: 'DR-003 value', oldValue: '20', newValue: '25' },
  { id: 'AUD-023', timestamp: '2026-03-18T14:30:00Z', user: 'Ravi Shankar', module: 'Billing', action: 'Cancel', entity: 'INV-00418', field: 'status', oldValue: 'DRAFT', newValue: 'CANCELLED' },
  { id: 'AUD-024', timestamp: '2026-03-18T12:00:00Z', user: 'Priya Lakshmi', module: 'Accounting', action: 'Create', entity: 'EXP-00089', field: '-', oldValue: '-', newValue: 'New Expense' },
  { id: 'AUD-025', timestamp: '2026-03-18T10:00:00Z', user: 'Admin', module: 'Settings', action: 'Update', entity: 'General', field: 'sessionTimeout', oldValue: '30', newValue: '60' },
]

// ─────────────────────────────────────────────────────────────
// Zod schemas
// ─────────────────────────────────────────────────────────────

const businessProfileSchema = z.object({
  companyName: z.string().min(1, 'Company name is required'),
  address: z.string().min(1, 'Address is required'),
  phone: z.string().min(10, 'Valid phone number required'),
  email: z.string().email('Valid email required'),
  gstin: z.string().min(15, 'Valid GSTIN required').max(15),
  drugLicense: z.string().min(1, 'Drug license is required'),
  invoicePrefix: z.string().min(1, 'Invoice prefix is required'),
})

type BusinessProfileForm = z.infer<typeof businessProfileSchema>

const addUserSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Valid email required'),
  phone: z.string().min(10, 'Valid phone number required'),
  role: z.string().min(1, 'Role is required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  branchId: z.string().optional(),
})

type AddUserForm = z.infer<typeof addUserSchema>

const editUserSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  phone: z.string().min(10, 'Valid phone number required'),
  role: z.string().min(1, 'Role is required'),
  branchId: z.string().optional(),
  newPassword: z.string().min(6, 'Password must be at least 6 characters').or(z.literal('')).optional(),
})
type EditUserForm = z.infer<typeof editUserSchema>

const addDiscountSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  type: z.enum(['PERCENTAGE', 'FLAT']),
  value: z.string().min(1, 'Value is required'),
  applicableTo: z.string().min(1, 'Applicable to is required'),
  validFrom: z.string().min(1, 'Start date is required'),
  validTo: z.string().min(1, 'End date is required'),
})

type AddDiscountForm = z.infer<typeof addDiscountSchema>

// ─────────────────────────────────────────────────────────────
// Shared section label component
// ─────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </p>
  )
}

// ─────────────────────────────────────────────────────────────
// Toggle row helper for general settings
// ─────────────────────────────────────────────────────────────

function SettingToggleRow({
  title,
  description,
  checked,
  onCheckedChange,
}: {
  title: string
  description: string
  checked: boolean
  onCheckedChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 px-4 py-3.5 transition-colors dark:bg-muted/10">
      <div className="space-y-0.5">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Settings Page
// ─────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState('business')

  const activeConfig = settingsSections.find((s) => s.id === activeSection)
  const ActiveIcon = activeConfig?.icon || Settings

  return (
    <div className="-m-3 md:-m-4 lg:-m-6 flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden">
      {/* ══════════════════════════════════════════════════════════ */}
      {/* FIXED HEADER                                              */}
      {/* ══════════════════════════════════════════════════════════ */}
      <div className="shrink-0 border-b border-border/40 bg-background px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 dark:bg-primary/15">
              <Settings className="h-4.5 w-4.5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">Settings</h1>
              <p className="text-[11px] text-muted-foreground">
                Manage your application preferences and configuration
              </p>
            </div>
          </div>
          <Badge variant="info" size="sm" dot>
            v2.4.0
          </Badge>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════ */}
      {/* MAIN WORKSPACE — Sidebar + Content                        */}
      {/* ══════════════════════════════════════════════════════════ */}
      <div className="flex flex-1 overflow-hidden">
        {/* ─── LEFT: Sidebar Navigation ──────────────────────── */}
        <div className="hidden lg:flex w-55 shrink-0 flex-col border-r border-border/40 bg-muted/5 dark:bg-muted/2">
          <ScrollArea className="min-h-0 flex-1">
            <nav className="p-3 space-y-0.5">
              {settingsSections.map((section) => {
                const Icon = section.icon
                const isActive = activeSection === section.id
                return (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    className={cn(
                      'group flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-medium transition-all duration-150',
                      isActive
                        ? 'bg-primary/10 text-primary shadow-sm dark:bg-primary/15'
                        : 'text-muted-foreground hover:bg-muted/80 hover:text-foreground dark:hover:bg-muted/40'
                    )}
                  >
                    <div
                      className={cn(
                        'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors',
                        isActive
                          ? 'bg-primary/15 text-primary dark:bg-primary/20'
                          : 'bg-muted/60 text-muted-foreground group-hover:bg-muted group-hover:text-foreground dark:bg-muted/30'
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 text-left">
                      <p className="truncate leading-tight">{section.label}</p>
                      <p className={cn(
                        'truncate text-[9px] leading-tight transition-colors',
                        isActive ? 'text-primary/70' : 'text-muted-foreground/60'
                      )}>
                        {section.description}
                      </p>
                    </div>
                  </button>
                )
              })}
            </nav>
          </ScrollArea>
        </div>

        {/* ─── RIGHT: Content Area ───────────────────────────── */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Section sub-header */}
          <div className="shrink-0 flex items-center gap-2.5 border-b border-border/40 bg-muted/10 px-6 py-2 dark:bg-muted/5">
            <div className={cn(
              'flex h-7 w-7 items-center justify-center rounded-lg',
              activeSection === 'business' ? 'bg-primary/10 text-primary' :
              activeSection === 'tax' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' :
              activeSection === 'users' ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400' :
              activeSection === 'notifications' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' :
              activeSection === 'printer' ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400' :
              activeSection === 'discounts' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' :
              activeSection === 'backup' ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400' :
              activeSection === 'audit' ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400' :
              'bg-muted/60 text-muted-foreground'
            )}>
              <ActiveIcon className="h-3.5 w-3.5" />
            </div>
            <div>
              <p className="text-sm font-semibold">{activeConfig?.label}</p>
              <p className="text-[10px] text-muted-foreground">{activeConfig?.description}</p>
            </div>
          </div>

          {/* Scrollable content */}
          <ScrollArea className="min-h-0 flex-1">
            <div className="p-6">
              <motion.div
                key={activeSection}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
              >
                {activeSection === 'business' && <BusinessProfileSection />}
                {activeSection === 'tax' && <TaxConfigSection />}
                {activeSection === 'users' && <UserManagementSection />}
                {activeSection === 'notifications' && <NotificationSettingsSection />}
                {activeSection === 'printer' && <PrinterSettingsSection />}
                {activeSection === 'discounts' && <DiscountRulesSection />}
                {activeSection === 'backup' && <BackupDataSection />}
                {activeSection === 'audit' && <AuditTrailSection />}
                {activeSection === 'general' && <GeneralSettingsSection />}
              </motion.div>
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Section: Business Profile
// ─────────────────────────────────────────────────────────────

function BusinessProfileSection() {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<BusinessProfileForm>({
    resolver: zodResolver(businessProfileSchema),
    defaultValues: {
      companyName: 'Hospital Suppliers',
      address: '23, Medical Complex, K.K. Nagar, Madurai - 625020, Tamil Nadu',
      phone: '04522345679',
      email: 'info@hospitalsuppliers.com',
      gstin: '33AABCH1234A1Z5',
      drugLicense: 'TN/MDU/20B/2020/0456',
      invoicePrefix: 'HS/25-26',
    },
  })

  const invoicePrefix = watch('invoicePrefix')

  const onSubmit = (_data: BusinessProfileForm) => {
    toast.success('Business profile updated successfully')
  }

  return (
    <motion.div variants={itemVariants}>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 dark:bg-primary/15">
              <Building2 className="h-4.5 w-4.5 text-primary" />
            </div>
            <div>
              <CardTitle>Business Profile</CardTitle>
              <CardDescription>Manage your company details and invoice settings</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div>
              <SectionLabel>Company Information</SectionLabel>
              <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="companyName">Company Name</Label>
                  <Input
                    id="companyName"
                    {...register('companyName')}
                    error={!!errors.companyName}
                  />
                  {errors.companyName && (
                    <p className="text-xs text-destructive">{errors.companyName.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    {...register('phone')}
                    error={!!errors.phone}
                  />
                  {errors.phone && (
                    <p className="text-xs text-destructive">{errors.phone.message}</p>
                  )}
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="address">Address</Label>
                  <Textarea id="address" {...register('address')} rows={2} />
                  {errors.address && (
                    <p className="text-xs text-destructive">{errors.address.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    {...register('email')}
                    error={!!errors.email}
                  />
                  {errors.email && (
                    <p className="text-xs text-destructive">{errors.email.message}</p>
                  )}
                </div>
              </div>
            </div>

            <Separator className="bg-border/40" />

            <div>
              <SectionLabel>License & Tax</SectionLabel>
              <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="gstin">GSTIN</Label>
                  <Input
                    id="gstin"
                    {...register('gstin')}
                    maxLength={15}
                    className="font-mono"
                    error={!!errors.gstin}
                  />
                  {errors.gstin && (
                    <p className="text-xs text-destructive">{errors.gstin.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="drugLicense">Drug License Number</Label>
                  <Input
                    id="drugLicense"
                    {...register('drugLicense')}
                    className="font-mono"
                    error={!!errors.drugLicense}
                  />
                  {errors.drugLicense && (
                    <p className="text-xs text-destructive">{errors.drugLicense.message}</p>
                  )}
                </div>
              </div>
            </div>

            <Separator className="bg-border/40" />

            <div>
              <SectionLabel>Invoice Settings</SectionLabel>
              <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="invoicePrefix">Invoice Prefix</Label>
                  <Input
                    id="invoicePrefix"
                    {...register('invoicePrefix')}
                    error={!!errors.invoicePrefix}
                  />
                  {errors.invoicePrefix && (
                    <p className="text-xs text-destructive">{errors.invoicePrefix.message}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Invoice preview */}
            <div className="rounded-xl border border-border/60 bg-muted/30 p-4 dark:bg-muted/15">
              <SectionLabel>Invoice Number Preview</SectionLabel>
              <p className="mt-1.5 font-mono text-sm font-semibold text-foreground">
                {invoicePrefix}/INV/00001
              </p>
            </div>

            <div className="flex justify-end">
              <Button type="submit" className="gap-1.5">
                <Save className="h-4 w-4" />
                Save Changes
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </motion.div>
  )
}

// ─────────────────────────────────────────────────────────────
// Section: Tax Configuration
// ─────────────────────────────────────────────────────────────

function TaxConfigSection() {
  const [gstRates, setGstRates] = useState(initialGstRates)
  const [taxMode, setTaxMode] = useState<'INCLUSIVE' | 'EXCLUSIVE'>('EXCLUSIVE')
  const [placeOfSupply, setPlaceOfSupply] = useState('Tamil Nadu')

  const states = [
    'Tamil Nadu', 'Karnataka', 'Kerala', 'Andhra Pradesh', 'Telangana',
    'Maharashtra', 'Gujarat', 'Rajasthan', 'Delhi', 'Uttar Pradesh',
  ]

  return (
    <motion.div className="space-y-6" variants={itemVariants}>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 dark:bg-amber-500/15">
              <Receipt className="h-4.5 w-4.5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <CardTitle>GST Rates</CardTitle>
              <CardDescription>Manage tax rates for different HSN codes</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border border-border/60 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 dark:bg-muted/15">
                  <TableHead>HSN Code</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">CGST %</TableHead>
                  <TableHead className="text-right">SGST %</TableHead>
                  <TableHead className="text-right">IGST %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {gstRates.map((rate) => (
                  <TableRow key={rate.id}>
                    <TableCell>
                      <Badge variant="outline" size="sm" className="font-mono">
                        {rate.hsnCode}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{rate.description}</TableCell>
                    <TableCell className="text-right font-medium">{rate.cgst}%</TableCell>
                    <TableCell className="text-right font-medium">{rate.sgst}%</TableCell>
                    <TableCell className="text-right font-medium">{rate.igst}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10 dark:bg-blue-500/15">
              <Settings className="h-4.5 w-4.5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <CardTitle>Tax Settings</CardTitle>
              <CardDescription>Configure tax calculation mode and state</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 px-4 py-3.5 dark:bg-muted/10">
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-foreground">Tax Mode</p>
              <p className="text-xs text-muted-foreground">
                {taxMode === 'INCLUSIVE' ? 'Prices include GST' : 'Prices exclude GST'}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className={cn('text-sm transition-colors', taxMode === 'INCLUSIVE' ? 'font-medium text-foreground' : 'text-muted-foreground')}>
                Inclusive
              </span>
              <Switch
                checked={taxMode === 'EXCLUSIVE'}
                onCheckedChange={(checked) => setTaxMode(checked ? 'EXCLUSIVE' : 'INCLUSIVE')}
              />
              <span className={cn('text-sm transition-colors', taxMode === 'EXCLUSIVE' ? 'font-medium text-foreground' : 'text-muted-foreground')}>
                Exclusive
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Place of Supply (State)</Label>
            <Select value={placeOfSupply} onValueChange={setPlaceOfSupply}>
              <SelectTrigger className="w-full max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {states.map((state) => (
                  <SelectItem key={state} value={state}>{state}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Determines whether CGST+SGST or IGST applies
            </p>
          </div>

          <div className="flex justify-end">
            <Button onClick={() => toast.success('Tax configuration saved')} className="gap-1.5">
              <Save className="h-4 w-4" />
              Save Changes
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

// ─────────────────────────────────────────────────────────────
// Section: User Management
// ─────────────────────────────────────────────────────────────

function UserManagementSection() {
  type UserRow = {
    id: string; name: string; email: string; phone: string; role: string
    isActive: boolean; lastLogin: string; branchId?: string
    branch?: { id: string; name: string; code: string } | null
  }
  const [users, setUsers] = useState<UserRow[]>([])
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [editingUser, setEditingUser] = useState<UserRow | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const { branches, fetchBranches } = useBranchStore()

  const fetchUsers = useCallback(() => {
    fetchBranches()
    api.get('/users').then((res) => {
      const rows = Array.isArray(res.data) ? res.data : (res.data.data ?? [])
      setUsers(rows.map((u: any) => ({
        id: u.id, name: u.name, email: u.email,
        phone: u.phone ?? '', role: u.role,
        isActive: u.isActive ?? true,
        lastLogin: u.updatedAt ?? '',
        branchId: u.branchId ?? '',
        branch: u.branch ?? null,
      })))
    }).catch(() => { toast.error('Failed to load users') })
  }, [fetchBranches])

  useEffect(() => { fetchUsers() }, [fetchUsers])
  useBranchRefresh(fetchUsers)

  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return users
    const q = searchQuery.toLowerCase()
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q)
    )
  }, [users, searchQuery])

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AddUserForm>({
    resolver: zodResolver(addUserSchema),
  })

  const roleLabels: Record<string, string> = {
    ADMIN: 'Admin',
    PHARMACIST: 'Pharmacist',
    INVENTORY_MANAGER: 'Inventory Manager',
    ACCOUNTANT: 'Accountant',
  }

  const roleBadgeVariant: Record<string, 'purple' | 'info' | 'warning' | 'success'> = {
    ADMIN: 'purple',
    PHARMACIST: 'info',
    INVENTORY_MANAGER: 'warning',
    ACCOUNTANT: 'success',
  }

  const onAddUser = async (data: AddUserForm) => {
    try {
      const res = await api.post('/users', {
        name: data.name, email: data.email, phone: data.phone,
        role: data.role, password: (data as any).password,
        branchId: data.branchId || undefined,
      })
      setUsers((prev) => [...prev, {
        id: res.data.id, name: res.data.name, email: res.data.email,
        phone: res.data.phone ?? '', role: res.data.role,
        isActive: res.data.isActive ?? true, lastLogin: '',
        branchId: res.data.branchId ?? '', branch: res.data.branch ?? null,
      }])
      setShowAddDialog(false)
      reset()
      toast.success(`User ${data.name} created successfully`)
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Failed to create user')
    }
  }

  const toggleUserStatus = async (userId: string) => {
    const user = users.find((u) => u.id === userId)
    if (!user) return
    try {
      await api.patch(`/users/${userId}`, { isActive: !user.isActive })
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, isActive: !u.isActive } : u))
      toast.success('User status updated')
    } catch {
      toast.error('Failed to update user status')
    }
  }

  return (
    <motion.div variants={itemVariants}>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10 dark:bg-purple-500/15">
                <Users className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <CardTitle>User Management</CardTitle>
                <CardDescription>Manage users and their access roles</CardDescription>
              </div>
            </div>
            <Button className="gap-1.5" onClick={() => setShowAddDialog(true)}>
              <Plus className="h-4 w-4" />
              Add User
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <DataTableFilterBar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            searchPlaceholder="Search by name, email, or role..."
            resultsCount={filteredUsers.length}
          />
          <div className="rounded-xl border border-border/60 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 dark:bg-muted/15">
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Login</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{user.email}</TableCell>
                    <TableCell>
                      <Badge variant={roleBadgeVariant[user.role] || 'secondary'} size="sm">
                        {roleLabels[user.role] || user.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {user.branch ? (
                        <span className="inline-flex items-center gap-1">
                          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-bold">{user.branch.code}</span>
                          {user.branch.name}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/50">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={user.isActive ? 'success' : 'secondary'}
                        size="sm"
                        dot
                      >
                        {user.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {user.lastLogin ? formatDateTime(user.lastLogin) : 'Never'}
                    </TableCell>
                    <TableCell className="text-right">
                      <DataTableRowActions
                        onEdit={() => setEditingUser(user)}
                        customActions={[
                          {
                            label: user.isActive ? 'Deactivate' : 'Activate',
                            icon: <Power className={cn('h-4 w-4', user.isActive ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400')} />,
                            onClick: () => toggleUserStatus(user.id),
                          },
                        ]}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Add User Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New User</DialogTitle>
            <DialogDescription>Create a new user account. Password will be auto-generated.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onAddUser)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="userName">Full Name</Label>
              <Input
                id="userName"
                placeholder="Enter full name"
                {...register('name')}
                error={!!errors.name}
              />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="userEmail">Email</Label>
              <Input
                id="userEmail"
                type="email"
                placeholder="user@company.com"
                {...register('email')}
                error={!!errors.email}
              />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="userPhone">Phone</Label>
              <Input
                id="userPhone"
                placeholder="9876543210"
                {...register('phone')}
                error={!!errors.phone}
              />
              {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="userRole">Role</Label>
              <Controller
                name="role"
                control={control}
                render={({ field }) => (
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <SelectTrigger id="userRole" className="h-10">
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ADMIN">Admin</SelectItem>
                      <SelectItem value="PHARMACIST">Pharmacist</SelectItem>
                      <SelectItem value="INVENTORY_MANAGER">Inventory Manager</SelectItem>
                      <SelectItem value="ACCOUNTANT">Accountant</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.role && <p className="text-xs text-destructive">{errors.role.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="userPassword">Password</Label>
              <Input
                id="userPassword"
                type="password"
                placeholder="Min. 6 characters"
                {...register('password')}
                error={!!(errors as any).password}
              />
              {(errors as any).password && <p className="text-xs text-destructive">{(errors as any).password.message}</p>}
            </div>
            {branches.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="userBranch">Assign Branch</Label>
                <Controller
                  name="branchId"
                  control={control}
                  render={({ field }) => (
                    <Select
                      onValueChange={(v) => field.onChange(v === '__none__' ? '' : v)}
                      value={field.value || '__none__'}
                    >
                      <SelectTrigger id="userBranch" className="h-10">
                        <SelectValue placeholder="No branch (access all)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">No branch (access all)</SelectItem>
                        {branches.filter(b => b.isActive).map((b) => (
                          <SelectItem key={b.id} value={b.id}>
                            <span className="flex items-center gap-2">
                              <span className="font-mono text-xs font-bold text-muted-foreground">{b.code}</span>
                              {b.name}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <p className="text-[11px] text-muted-foreground">
                  Leave blank to give access to all branches
                </p>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowAddDialog(false)}>
                Cancel
              </Button>
              <Button type="submit">Create User</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      {editingUser && (
        <EditUserDialog
          user={editingUser}
          branches={branches}
          onClose={() => setEditingUser(null)}
          onSaved={(updated) => {
            setUsers((prev) => prev.map((u) => u.id === updated.id ? { ...u, ...updated } : u))
            setEditingUser(null)
          }}
        />
      )}
    </motion.div>
  )
}

// ── Edit User Dialog ──────────────────────────────────────────
function EditUserDialog({
  user,
  branches,
  onClose,
  onSaved,
}: {
  user: { id: string; name: string; email: string; phone: string; role: string; isActive: boolean; lastLogin?: string; branchId?: string; branch?: { id: string; name: string; code: string } | null }
  branches: { id: string; name: string; code: string; isActive: boolean }[]
  onClose: () => void
  onSaved: (updated: any) => void
}) {
  const { register, handleSubmit, control, formState: { errors } } = useForm<EditUserForm>({
    resolver: zodResolver(editUserSchema),
    defaultValues: {
      name: user.name,
      phone: user.phone,
      role: user.role,
      branchId: user.branchId ?? '',
      newPassword: '',
    },
  })
  const [saving, setSaving] = useState(false)

  const onSubmit = async (data: EditUserForm) => {
    setSaving(true)
    try {
      const payload: any = {
        name: data.name,
        phone: data.phone,
        role: data.role,
        branchId: data.branchId || null,
      }
      if (data.newPassword) payload.password = data.newPassword
      const res = await api.patch(`/users/${user.id}`, payload)
      const updated = res.data?.data ?? res.data
      onSaved({
        id: updated.id,
        name: updated.name,
        email: updated.email ?? user.email,
        phone: updated.phone,
        role: updated.role,
        isActive: updated.isActive ?? user.isActive,
        branchId: updated.branchId ?? '',
        branch: updated.branch ?? null,
        lastLogin: user.lastLogin ?? '',
      })
      toast.success('User updated successfully')
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Failed to update user')
    } finally {
      setSaving(false)
    }
  }

  const roleLabels: Record<string, string> = {
    ADMIN: 'Admin',
    PHARMACIST: 'Pharmacist',
    INVENTORY_MANAGER: 'Inventory Manager',
    ACCOUNTANT: 'Accountant',
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit User</DialogTitle>
          <DialogDescription>Update user details and branch assignment for <strong>{user.email}</strong></DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>Full Name</Label>
            <Input {...register('name')} placeholder="Full name" />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-2">
            <Label>Phone</Label>
            <Input {...register('phone')} placeholder="9876543210" />
            {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <Controller
              name="role"
              control={control}
              render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(roleLabels).map(([val, label]) => (
                      <SelectItem key={val} value={val}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.role && <p className="text-xs text-destructive">{errors.role.message}</p>}
          </div>
          {branches.length > 0 && (
            <div className="space-y-2">
              <Label>Assign Branch</Label>
              <Controller
                name="branchId"
                control={control}
                render={({ field }) => (
                  <Select
                    onValueChange={(v) => field.onChange(v === '__none__' ? '' : v)}
                    value={field.value || '__none__'}
                  >
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder="No branch (access all)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No branch (access all)</SelectItem>
                      {branches.filter(b => b.isActive).map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          <span className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-muted-foreground">{b.code}</span>
                            {b.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <p className="text-[11px] text-muted-foreground">
                Leave blank to give access to all branches
              </p>
            </div>
          )}
          <div className="space-y-2">
            <Label>New Password <span className="text-muted-foreground text-[11px]">(leave blank to keep current)</span></Label>
            <Input
              {...register('newPassword')}
              type="password"
              placeholder="Min. 6 characters"
            />
            {errors.newPassword && <p className="text-xs text-destructive">{errors.newPassword.message}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────────────────────────────────────────
// Section: Notification Settings
// ─────────────────────────────────────────────────────────────

function NotificationSettingsSection() {
  const [smsProvider, setSmsProvider] = useState('twilio')
  const [smsApiKey, setSmsApiKey] = useState('sk_live_*****************************')
  const [smtpHost, setSmtpHost] = useState('smtp.gmail.com')
  const [smtpPort, setSmtpPort] = useState('587')
  const [smtpUser, setSmtpUser] = useState('notifications@hospitalsuppliers.com')
  const [smtpPass, setSmtpPass] = useState('app-password-here')
  const [showSmtpPass, setShowSmtpPass] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState('invoice')
  const [templateContent, setTemplateContent] = useState(
    'Dear {{customer_name}},\n\nYour invoice {{invoice_number}} of {{amount}} has been generated on {{date}}.\n\nThank you for your business.\n\n- {{company_name}}'
  )

  const templateTypes = [
    { value: 'invoice', label: 'Invoice Generated' },
    { value: 'payment', label: 'Payment Received' },
    { value: 'reminder', label: 'Payment Reminder' },
    { value: 'expiry', label: 'Near-Expiry Alert' },
    { value: 'low-stock', label: 'Low Stock Alert' },
  ]

  const templateVariables = ['customer_name', 'invoice_number', 'amount', 'date', 'company_name', 'due_date', 'product_name', 'batch_number']

  const handleTemplateChange = (type: string) => {
    setSelectedTemplate(type)
    const templates: Record<string, string> = {
      invoice: 'Dear {{customer_name}},\n\nYour invoice {{invoice_number}} of {{amount}} has been generated on {{date}}.\n\nThank you for your business.\n\n- {{company_name}}',
      payment: 'Dear {{customer_name}},\n\nWe have received your payment of {{amount}} against invoice {{invoice_number}} on {{date}}.\n\nThank you.\n\n- {{company_name}}',
      reminder: 'Dear {{customer_name}},\n\nThis is a reminder that invoice {{invoice_number}} of {{amount}} is due on {{due_date}}.\n\nPlease arrange payment at the earliest.\n\n- {{company_name}}',
      expiry: 'Alert: {{product_name}} (Batch: {{batch_number}}) is expiring on {{date}}. Please take necessary action.\n\n- {{company_name}}',
      'low-stock': 'Alert: {{product_name}} stock is below minimum level. Current stock needs replenishment.\n\n- {{company_name}}',
    }
    setTemplateContent(templates[type] || '')
  }

  return (
    <motion.div className="space-y-6" variants={itemVariants}>
      {/* SMS Gateway */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 dark:bg-emerald-500/15">
              <Send className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <CardTitle>SMS Gateway</CardTitle>
              <CardDescription>Configure SMS notifications</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Provider</Label>
              <Select value={smsProvider} onValueChange={setSmsProvider}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="twilio">Twilio</SelectItem>
                  <SelectItem value="msg91">MSG91</SelectItem>
                  <SelectItem value="textlocal">TextLocal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>API Key</Label>
              <Input
                value={smsApiKey}
                onChange={(e) => setSmsApiKey(e.target.value)}
                type="password"
              />
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => toast.success('SMS test sent successfully')}
          >
            <Send className="h-3.5 w-3.5" />
            Send Test SMS
          </Button>
        </CardContent>
      </Card>

      {/* Email SMTP */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10 dark:bg-blue-500/15">
              <Bell className="h-4.5 w-4.5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <CardTitle>Email SMTP</CardTitle>
              <CardDescription>Configure email notifications</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>SMTP Host</Label>
              <Input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Port</Label>
              <Input value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Username</Label>
              <Input value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Password</Label>
              <Input
                type={showSmtpPass ? 'text' : 'password'}
                value={smtpPass}
                onChange={(e) => setSmtpPass(e.target.value)}
                suffix={
                  <button
                    type="button"
                    onClick={() => setShowSmtpPass(!showSmtpPass)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showSmtpPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                }
              />
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => toast.success('Email test sent successfully')}
          >
            <Send className="h-3.5 w-3.5" />
            Send Test Email
          </Button>
        </CardContent>
      </Card>

      {/* Template Editor */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-500/10 dark:bg-purple-500/15">
              <Pencil className="h-4.5 w-4.5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <CardTitle>Template Editor</CardTitle>
              <CardDescription>Customize notification message templates</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Template Type</Label>
            <Select value={selectedTemplate} onValueChange={handleTemplateChange}>
              <SelectTrigger className="w-full max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {templateTypes.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <SectionLabel>Available Variables</SectionLabel>
            <div className="flex flex-wrap gap-1.5">
              {templateVariables.map((v) => (
                <Badge key={v} variant="info" size="sm" className="cursor-pointer font-mono">
                  {`{{${v}}}`}
                </Badge>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Template Content</Label>
            <Textarea
              value={templateContent}
              onChange={(e) => setTemplateContent(e.target.value)}
              rows={8}
              className="font-mono text-xs rounded-xl"
            />
          </div>

          <div className="flex justify-end">
            <Button onClick={() => toast.success('Template saved')} className="gap-1.5">
              <Save className="h-4 w-4" />
              Save Template
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

// ─────────────────────────────────────────────────────────────
// Section: Printer Settings
// ─────────────────────────────────────────────────────────────

function PrinterSettingsSection() {
  const [selectedFormat, setSelectedFormat] = useState('80mm')

  const invoiceFormats = [
    { id: '58mm', label: 'Thermal 58mm', description: 'Small POS receipts', width: 'w-16' },
    { id: '80mm', label: 'Thermal 80mm', description: 'Standard POS receipts', width: 'w-20' },
    { id: 'a4', label: 'A4 Full Page', description: 'Standard invoice format', width: 'w-24' },
    { id: 'a5', label: 'A5 Half Page', description: 'Compact invoice format', width: 'w-20' },
  ]

  const [barcodeWidth, setBarcodeWidth] = useState('38')
  const [barcodeHeight, setBarcodeHeight] = useState('25')

  return (
    <motion.div className="space-y-6" variants={itemVariants}>
      {/* Invoice Format */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/10 dark:bg-orange-500/15">
              <Printer className="h-4.5 w-4.5 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <CardTitle>Invoice Format</CardTitle>
              <CardDescription>Select the default printing format for invoices</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {invoiceFormats.map((fmt) => (
              <button
                key={fmt.id}
                onClick={() => setSelectedFormat(fmt.id)}
                className={cn(
                  'relative flex flex-col items-center gap-3 rounded-2xl border-2 p-5 transition-all duration-200 hover:shadow-md',
                  selectedFormat === fmt.id
                    ? 'border-primary bg-primary/5 shadow-sm dark:bg-primary/10'
                    : 'border-border/60 hover:border-primary/30 dark:hover:border-primary/20'
                )}
              >
                {selectedFormat === fmt.id && (
                  <div className="absolute right-2 top-2">
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary shadow-sm">
                      <Check className="h-3 w-3 text-primary-foreground" />
                    </div>
                  </div>
                )}
                <div className={cn('rounded-xl border-2 border-dashed border-muted-foreground/30 dark:border-muted-foreground/20', fmt.width, 'h-24')} />
                <div className="text-center">
                  <p className="text-sm font-semibold text-foreground">{fmt.label}</p>
                  <p className="text-xs text-muted-foreground">{fmt.description}</p>
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Barcode Label */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted/60 dark:bg-muted/30">
              <Settings className="h-4.5 w-4.5 text-muted-foreground" />
            </div>
            <div>
              <CardTitle>Barcode Label Format</CardTitle>
              <CardDescription>Configure barcode label dimensions</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 max-w-xs">
            <div className="space-y-2">
              <Label>Width (mm)</Label>
              <Input
                type="number"
                value={barcodeWidth}
                onChange={(e) => setBarcodeWidth(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Height (mm)</Label>
              <Input
                type="number"
                value={barcodeHeight}
                onChange={(e) => setBarcodeHeight(e.target.value)}
              />
            </div>
          </div>
          <div className="rounded-xl border border-border/60 bg-muted/30 p-4 dark:bg-muted/15">
            <SectionLabel>Preview</SectionLabel>
            <div
              className="mt-2 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-muted-foreground/30 p-3 dark:border-muted-foreground/20"
              style={{ width: `${Number(barcodeWidth) * 3}px`, height: `${Number(barcodeHeight) * 3}px` }}
            >
              <div className="flex gap-px">
                {Array.from({ length: 20 }).map((_, i) => (
                  <div
                    key={i}
                    className="bg-foreground"
                    style={{ width: i % 3 === 0 ? '2px' : '1px', height: '24px' }}
                  />
                ))}
              </div>
              <p className="mt-1 font-mono text-[8px] text-muted-foreground">8901234560011</p>
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => toast.success('Printer settings saved')} className="gap-1.5">
              <Save className="h-4 w-4" />
              Save Changes
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

// ─────────────────────────────────────────────────────────────
// Section: Discount Rules
// ─────────────────────────────────────────────────────────────

function DiscountRulesSection() {
  const [discountRules, setDiscountRules] = useState(initialDiscountRules)
  const [showAddDialog, setShowAddDialog] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AddDiscountForm>({
    resolver: zodResolver(addDiscountSchema),
  })

  const onAddRule = (data: AddDiscountForm) => {
    const newRule: DiscountRule = {
      id: `DR-${String(discountRules.length + 1).padStart(3, '0')}`,
      name: data.name,
      type: data.type as 'PERCENTAGE' | 'FLAT',
      value: Number(data.value),
      applicableTo: data.applicableTo,
      validFrom: data.validFrom,
      validTo: data.validTo,
      isActive: true,
    }
    setDiscountRules([...discountRules, newRule])
    setShowAddDialog(false)
    reset()
    toast.success('Discount rule added')
  }

  const toggleRule = (id: string) => {
    setDiscountRules(
      discountRules.map((r) =>
        r.id === id ? { ...r, isActive: !r.isActive } : r
      )
    )
  }

  const deleteRule = (id: string) => {
    setDiscountRules(discountRules.filter((r) => r.id !== id))
    toast.success('Discount rule deleted')
  }

  return (
    <motion.div variants={itemVariants}>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 dark:bg-amber-500/15">
                <Percent className="h-4.5 w-4.5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <CardTitle>Discount Rules</CardTitle>
                <CardDescription>Manage automatic and manual discount rules</CardDescription>
              </div>
            </div>
            <Button className="gap-1.5" onClick={() => setShowAddDialog(true)}>
              <Plus className="h-4 w-4" />
              Add Rule
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border border-border/60 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 dark:bg-muted/15">
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Applicable To</TableHead>
                  <TableHead>Valid Period</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {discountRules.map((rule) => (
                  <TableRow key={rule.id} className={cn(!rule.isActive && 'opacity-50')}>
                    <TableCell className="font-medium">{rule.name}</TableCell>
                    <TableCell>
                      <Badge variant={rule.type === 'PERCENTAGE' ? 'info' : 'purple'} size="sm">
                        {rule.type === 'PERCENTAGE' ? 'Percentage' : 'Flat'}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">
                      {rule.type === 'PERCENTAGE' ? `${rule.value}%` : `\u20B9${rule.value}`}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{rule.applicableTo}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(rule.validFrom)} - {formatDate(rule.validTo)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Switch
                          checked={rule.isActive}
                          onCheckedChange={() => toggleRule(rule.id)}
                        />
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => deleteRule(rule.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Add Discount Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Discount Rule</DialogTitle>
            <DialogDescription>Create a new automatic discount rule</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onAddRule)} className="space-y-4">
            <div className="space-y-2">
              <Label>Rule Name</Label>
              <Input
                placeholder="e.g. Summer Sale Discount"
                {...register('name')}
                error={!!errors.name}
              />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <select
                  {...register('type')}
                  className="flex h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 dark:bg-background"
                >
                  <option value="">Select type</option>
                  <option value="PERCENTAGE">Percentage</option>
                  <option value="FLAT">Flat Amount</option>
                </select>
                {errors.type && <p className="text-xs text-destructive">{errors.type.message}</p>}
              </div>
              <div className="space-y-2">
                <Label>Value</Label>
                <Input
                  type="number"
                  placeholder="10"
                  {...register('value')}
                  error={!!errors.value}
                />
                {errors.value && <p className="text-xs text-destructive">{errors.value.message}</p>}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Applicable To</Label>
              <Input
                placeholder="e.g. All Customers, Oncology Category"
                {...register('applicableTo')}
                error={!!errors.applicableTo}
              />
              {errors.applicableTo && <p className="text-xs text-destructive">{errors.applicableTo.message}</p>}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Valid From</Label>
                <Input
                  type="date"
                  {...register('validFrom')}
                  error={!!errors.validFrom}
                />
                {errors.validFrom && <p className="text-xs text-destructive">{errors.validFrom.message}</p>}
              </div>
              <div className="space-y-2">
                <Label>Valid To</Label>
                <Input
                  type="date"
                  {...register('validTo')}
                  error={!!errors.validTo}
                />
                {errors.validTo && <p className="text-xs text-destructive">{errors.validTo.message}</p>}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowAddDialog(false)}>
                Cancel
              </Button>
              <Button type="submit">Add Rule</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}

// ─────────────────────────────────────────────────────────────
// Section: Backup & Data
// ─────────────────────────────────────────────────────────────

function BackupDataSection() {
  const [backupProgress, setBackupProgress] = useState(0)
  const [isBackingUp, setIsBackingUp] = useState(false)

  const handleBackup = () => {
    setIsBackingUp(true)
    setBackupProgress(0)
    const interval = setInterval(() => {
      setBackupProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval)
          setIsBackingUp(false)
          toast.success('Backup completed successfully')
          return 100
        }
        return prev + 5
      })
    }, 150)
  }

  return (
    <motion.div className="space-y-6" variants={itemVariants}>
      {/* Manual Backup */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10 dark:bg-blue-500/15">
              <Download className="h-4.5 w-4.5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <CardTitle>Manual Backup</CardTitle>
              <CardDescription>Create an immediate backup of all data</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isBackingUp && (
            <div className="space-y-2 rounded-xl border border-border/60 bg-muted/20 p-4 dark:bg-muted/10">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Backing up...</span>
                <span className="font-medium text-foreground">{backupProgress}%</span>
              </div>
              <Progress value={backupProgress} />
            </div>
          )}
          <Button
            onClick={handleBackup}
            disabled={isBackingUp}
            loading={isBackingUp}
            className="gap-1.5"
          >
            <Download className="h-4 w-4" />
            {isBackingUp ? 'Backing Up...' : 'Backup Now'}
          </Button>
        </CardContent>
      </Card>

      {/* Auto-Backup Schedule */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 dark:bg-emerald-500/15">
              <Clock className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <CardTitle>Auto-Backup Schedule</CardTitle>
              <CardDescription>Automatic daily backup configuration</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 rounded-xl border border-border/60 bg-muted/20 p-4 dark:bg-muted/10">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Frequency</span>
              <span className="text-sm font-medium text-foreground">Daily</span>
            </div>
            <Separator className="bg-border/40" />
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Time</span>
              <span className="text-sm font-medium text-foreground">06:00 AM IST</span>
            </div>
            <Separator className="bg-border/40" />
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Retention</span>
              <span className="text-sm font-medium text-foreground">30 days</span>
            </div>
            <Separator className="bg-border/40" />
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Status</span>
              <Badge variant="success" size="sm" dot>Active</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Backup History */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted/60 dark:bg-muted/30">
              <Database className="h-4.5 w-4.5 text-muted-foreground" />
            </div>
            <div>
              <CardTitle>Backup History</CardTitle>
              <CardDescription>Recent backup records</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border border-border/60 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 dark:bg-muted/15">
                  <TableHead>Date & Time</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {backupHistory.map((backup) => (
                  <TableRow key={backup.id}>
                    <TableCell className="text-xs text-muted-foreground">{formatDateTime(backup.date)}</TableCell>
                    <TableCell className="font-medium">{backup.size}</TableCell>
                    <TableCell>
                      <Badge variant={backup.type === 'AUTO' ? 'info' : 'purple'} size="sm">
                        {backup.type === 'AUTO' ? 'Automatic' : 'Manual'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={backup.status === 'COMPLETED' ? 'success' : 'destructive'}
                        size="sm"
                        dot
                      >
                        {backup.status === 'COMPLETED' ? 'Completed' : 'Failed'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

// ─────────────────────────────────────────────────────────────
// Section: Audit Trail
// ─────────────────────────────────────────────────────────────

function AuditTrailSection() {
  const [filterUser, setFilterUser] = useState('all')
  const [filterModule, setFilterModule] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>(auditTrailData)

  useEffect(() => {
    api
      .get('/audit-logs', { params: { limit: 200 } })
      .then((res) => {
        const rows = res.data ?? []
        const mapped: AuditEntry[] = rows.map((r: any) => ({
          id: r.id,
          timestamp: r.createdAt,
          user: r.user?.name || r.userId,
          module: r.module,
          action: r.action,
          entity: r.entityId || '-',
          field: '-',
          oldValue: r.oldValue ? JSON.stringify(r.oldValue).slice(0, 80) : '-',
          newValue: r.newValue ? JSON.stringify(r.newValue).slice(0, 80) : '-',
        }))
        if (mapped.length > 0) setAuditEntries(mapped)
      })
      .catch(() => { toast.error('Failed to load audit log') })
  }, [])

  const uniqueUsers = Array.from(new Set(auditEntries.map((a) => a.user)))
  const uniqueModules = Array.from(new Set(auditEntries.map((a) => a.module)))

  const filteredAudit = auditEntries.filter((entry) => {
    if (filterUser !== 'all' && entry.user !== filterUser) return false
    if (filterModule !== 'all' && entry.module !== filterModule) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return (
        entry.entity.toLowerCase().includes(q) ||
        entry.action.toLowerCase().includes(q) ||
        entry.field.toLowerCase().includes(q) ||
        entry.newValue.toLowerCase().includes(q) ||
        entry.oldValue.toLowerCase().includes(q)
      )
    }
    return true
  })

  const actionBadgeVariant = (action: string): 'success' | 'info' | 'warning' | 'destructive' | 'secondary' => {
    switch (action.toLowerCase()) {
      case 'create': return 'success'
      case 'update': return 'info'
      case 'delete':
      case 'cancel':
      case 'deactivate': return 'destructive'
      case 'return': return 'warning'
      default: return 'secondary'
    }
  }

  return (
    <motion.div variants={itemVariants}>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-500/10 dark:bg-rose-500/15">
              <Shield className="h-4.5 w-4.5 text-rose-600 dark:text-rose-400" />
            </div>
            <div>
              <CardTitle>Audit Trail</CardTitle>
              <CardDescription>Complete log of all system changes (read-only)</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <DataTableFilterBar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            searchPlaceholder="Search entities, actions..."
            resultsCount={filteredAudit.length}
            activeFilterCount={(filterUser !== 'all' ? 1 : 0) + (filterModule !== 'all' ? 1 : 0)}
            onClearFilters={() => {
              setFilterUser('all')
              setFilterModule('all')
            }}
          >
            <div className="flex items-center gap-2">
              <Label className="shrink-0 text-xs font-medium text-muted-foreground">User:</Label>
              <Select value={filterUser} onValueChange={setFilterUser}>
                <SelectTrigger className="h-8 w-40">
                  <SelectValue placeholder="All Users" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Users</SelectItem>
                  {uniqueUsers.map((user) => (
                    <SelectItem key={user} value={user}>{user}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Label className="shrink-0 text-xs font-medium text-muted-foreground">Module:</Label>
              <Select value={filterModule} onValueChange={setFilterModule}>
                <SelectTrigger className="h-8 w-40">
                  <SelectValue placeholder="All Modules" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Modules</SelectItem>
                  {uniqueModules.map((mod) => (
                    <SelectItem key={mod} value={mod}>{mod}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </DataTableFilterBar>

          {/* Table */}
          <div className="rounded-xl border border-border/60 overflow-hidden">
            <ScrollArea className="h-125">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 dark:bg-muted/15">
                    <TableHead>Timestamp</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Module</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Field</TableHead>
                    <TableHead>Old Value</TableHead>
                    <TableHead>New Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAudit.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatDateTime(entry.timestamp)}
                      </TableCell>
                      <TableCell className="text-xs font-medium">{entry.user}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" size="sm">{entry.module}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={actionBadgeVariant(entry.action)} size="sm">
                          {entry.action}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs text-foreground">{entry.entity}</span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{entry.field}</TableCell>
                      <TableCell className="text-xs">
                        {entry.oldValue !== '-' ? (
                          <span className="rounded-md bg-destructive/10 px-1.5 py-0.5 text-destructive dark:bg-destructive/15">
                            {entry.oldValue}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {entry.newValue !== '-' ? (
                          <span className="rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-emerald-700 dark:text-emerald-400 dark:bg-emerald-500/15">
                            {entry.newValue}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

// ─────────────────────────────────────────────────────────────
// Section: General Settings
// ─────────────────────────────────────────────────────────────

function GeneralSettingsSection() {
  const [dateFormat, setDateFormat] = useState('dd/mm/yyyy')
  const [autoPrint, setAutoPrint] = useState(true)
  const [fefoEnforcement, setFefoEnforcement] = useState(true)
  const [negativeStock, setNegativeStock] = useState(false)
  const [sessionTimeout, setSessionTimeout] = useState('60')

  return (
    <motion.div variants={itemVariants}>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted/60 dark:bg-muted/30">
              <Settings className="h-4.5 w-4.5 text-muted-foreground" />
            </div>
            <div>
              <CardTitle>General Settings</CardTitle>
              <CardDescription>Configure application-wide preferences</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Date Format */}
          <div>
            <SectionLabel>Display</SectionLabel>
            <div className="mt-3 flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 px-4 py-3.5 dark:bg-muted/10">
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-foreground">Date Format</p>
                <p className="text-xs text-muted-foreground">How dates are displayed across the app</p>
              </div>
              <Select value={dateFormat} onValueChange={setDateFormat}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dd/mm/yyyy">DD/MM/YYYY</SelectItem>
                  <SelectItem value="mm/dd/yyyy">MM/DD/YYYY</SelectItem>
                  <SelectItem value="yyyy-mm-dd">YYYY-MM-DD</SelectItem>
                  <SelectItem value="dd-mmm-yyyy">DD-MMM-YYYY</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Toggles */}
          <div>
            <SectionLabel>Automation</SectionLabel>
            <div className="mt-3 space-y-2">
              <SettingToggleRow
                title="Auto-Print Invoice"
                description="Automatically print invoice after saving"
                checked={autoPrint}
                onCheckedChange={setAutoPrint}
              />
              <SettingToggleRow
                title="FEFO Enforcement"
                description="First Expiry First Out - auto-select earliest expiring batch"
                checked={fefoEnforcement}
                onCheckedChange={setFefoEnforcement}
              />
            </div>
          </div>

          {/* Stock */}
          <div>
            <SectionLabel>Stock Control</SectionLabel>
            <div className="mt-3 space-y-2">
              <SettingToggleRow
                title="Allow Negative Stock"
                description="Allow billing when stock quantity is zero or below"
                checked={negativeStock}
                onCheckedChange={setNegativeStock}
              />
            </div>
          </div>

          {/* Session */}
          <div>
            <SectionLabel>Security</SectionLabel>
            <div className="mt-3 flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 px-4 py-3.5 dark:bg-muted/10">
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-foreground">Session Timeout</p>
                <p className="text-xs text-muted-foreground">
                  Auto-logout after inactivity (in minutes)
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={sessionTimeout}
                  onChange={(e) => setSessionTimeout(e.target.value)}
                  className="w-20 text-center"
                  min={5}
                  max={480}
                  suffix="min"
                />
              </div>
            </div>
          </div>

          <Separator className="bg-border/40" />

          <div className="flex justify-end">
            <Button onClick={() => toast.success('General settings saved')} className="gap-1.5">
              <Save className="h-4 w-4" />
              Save Changes
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}
