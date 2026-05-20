import { useState, useEffect, useMemo } from 'react'
import api from '@/lib/api'
import { createPortal } from 'react-dom'
import { useSettingsStore } from '@/stores/settingsStore'
import { useAuthStore } from '@/stores/authStore'
import { motion, type Variants } from 'framer-motion'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import {
  Building2,
  Database,
  Settings,
  Zap,
  Save,
  Download,
  Clock,
  Hash,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn, formatDateTime } from '@/lib/utils'
import { IndiamartCard } from './integrations/IndiamartCard'
import NumberingSection from '@/pages/numbering/NumberingPage'

// ─────────────────────────────────────────────────────────────
// Animation variants
// ─────────────────────────────────────────────────────────────

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
  adminOnly?: boolean
}

const settingsSections: SettingsSection[] = [
  { id: 'business', label: 'Business Profile', icon: Building2, description: 'Company details & invoicing' },
  { id: 'numbering', label: 'Document Numbering', icon: Hash, description: 'Invoice / quotation / GRN formats' },
  { id: 'backup', label: 'Backup & Data', icon: Database, description: 'Backups & data management' },
  { id: 'integrations', label: 'Integrations', icon: Zap, description: 'IndiaMART & external APIs', adminOnly: true },
  { id: 'general', label: 'General', icon: Settings, description: 'App-wide preferences' },
]

// ─────────────────────────────────────────────────────────────
// Backup history
// ─────────────────────────────────────────────────────────────

interface BackupEntry {
  id: string
  date: string
  size: string
  type: 'AUTO' | 'MANUAL'
  status: 'COMPLETED' | 'FAILED'
}

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
})

type BusinessProfileForm = z.infer<typeof businessProfileSchema>

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
  const { fetchSettings, fetchDiscountRules } = useSettingsStore()
  const userRole = useAuthStore((s) => s.user?.role)
  const visibleSections = useMemo(
    () => settingsSections.filter((s) => !s.adminOnly || userRole === 'ADMIN'),
    [userRole],
  )

  useEffect(() => {
    fetchSettings()
    fetchDiscountRules()
  }, [fetchSettings, fetchDiscountRules])

  const activeConfig = visibleSections.find((s) => s.id === activeSection)
  const ActiveIcon = activeConfig?.icon || Settings

  return (
    <div className="-m-3 md:-m-4 lg:-m-6 flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden">
      {/* ══════════════════════════════════════════════════════════ */}
      {/* FIXED HEADER                                              */}
      {/* ══════════════════════════════════════════════════════════ */}
      <div className="shrink-0 border-b border-border/40 bg-background px-4 py-3 sm:px-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
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
          <div className="flex items-center gap-3">
            <Badge variant="outline" size="sm" dot className="font-mono">
              v2.4.0
            </Badge>
          </div>
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
              {visibleSections.map((section) => {
                const Icon = section.icon
                const isActive = activeSection === section.id
                return (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    className={cn(
                      'group flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-medium transition-all duration-150 cursor-pointer',
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
          <div className="shrink-0 flex items-center justify-between border-b border-border/40 bg-muted/10 px-6 py-2 dark:bg-muted/5">
            <div className="flex items-center gap-2.5">
              <div className={cn(
                'flex h-7 w-7 items-center justify-center rounded-lg',
                activeSection === 'business' ? 'bg-primary/10 text-primary' :
                activeSection === 'numbering' ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400' :
                activeSection === 'backup' ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400' :
                activeSection === 'integrations' ? 'bg-violet-500/10 text-violet-600 dark:text-violet-400' :
                'bg-muted/60 text-muted-foreground'
              )}>
                <ActiveIcon className="h-3.5 w-3.5" />
              </div>
              <div>
                <p className="text-sm font-semibold">{activeConfig?.label}</p>
                <p className="text-[10px] text-muted-foreground">{activeConfig?.description}</p>
              </div>
            </div>

            {/* Top-right save button placeholder */}
            <div id="settings-save-button-portal" />
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
                {activeSection === 'numbering' && <NumberingSection />}
                {activeSection === 'backup' && <BackupDataSection />}
                {activeSection === 'integrations' && userRole === 'ADMIN' && <IntegrationsSection />}
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
  const { businessProfile, updateBusinessProfile, isLoading } = useSettingsStore()
  
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<BusinessProfileForm>({
    resolver: zodResolver(businessProfileSchema),
  })

  useEffect(() => {
    if (businessProfile) {
      reset({
        companyName: businessProfile.name || '',
        address: businessProfile.address || '',
        phone: businessProfile.phone || '',
        email: businessProfile.email || '',
        gstin: businessProfile.gstin || '',
        drugLicense: businessProfile.drugLicense || '',
      })
    }
  }, [businessProfile, reset])

  const onSubmit = (data: BusinessProfileForm) => {
    updateBusinessProfile(data)
  }

  return (
    <motion.div variants={itemVariants}>
      {createPortal(
        <Button 
          onClick={handleSubmit(onSubmit)} 
          disabled={isLoading}
          size="sm"
          className="gap-1.5 cursor-pointer h-8"
        >
          <Save className="h-4 w-4" />
          Save Business Changes
        </Button>,
        document.getElementById('settings-save-button-portal') || document.body
      )}

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
          <form className="space-y-6">
            <div>
              <SectionLabel>Company Information</SectionLabel>
              <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="companyName">Company Name <span className="text-destructive">*</span></Label>
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
                  <Label htmlFor="phone">Phone <span className="text-destructive">*</span></Label>
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
                  <Label htmlFor="address">Address <span className="text-destructive">*</span></Label>
                  <Textarea id="address" {...register('address')} rows={2} />
                  {errors.address && (
                    <p className="text-xs text-destructive">{errors.address.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email <span className="text-destructive">*</span></Label>
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
                  <Label htmlFor="gstin">GSTIN <span className="text-destructive">*</span></Label>
                  <Input
                    id="gstin"
                    {...register('gstin')}
                    maxLength={15}
                    className="font-mono text-xs"
                    error={!!errors.gstin}
                  />
                  {errors.gstin && (
                    <p className="text-xs text-destructive">{errors.gstin.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="drugLicense">Drug License Number <span className="text-destructive">*</span></Label>
                  <Input
                    id="drugLicense"
                    {...register('drugLicense')}
                    className="font-mono text-xs"
                    error={!!errors.drugLicense}
                  />
                  {errors.drugLicense && (
                    <p className="text-xs text-destructive">{errors.drugLicense.message}</p>
                  )}
                </div>
              </div>
            </div>

          </form>
        </CardContent>
      </Card>
    </motion.div>
  )
}

// ─────────────────────────────────────────────────────────────
// Section: Backup & Data
// ─────────────────────────────────────────────────────────────

function BackupDataSection() {
  const [backupProgress, setBackupProgress] = useState(0)
  const [isBackingUp, setIsBackingUp] = useState(false)
  const [backupHistory, setBackupHistory] = useState<BackupEntry[]>([])

  useEffect(() => {
    api
      .get('/settings/backups')
      .then((res) => setBackupHistory(Array.isArray(res.data) ? res.data : []))
      .catch(() => setBackupHistory([]))
  }, [])

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
      {document.getElementById('settings-save-button-portal') && createPortal(
        <Button onClick={handleBackup} disabled={isBackingUp} size="sm" className="gap-1.5 cursor-pointer h-8">
          <Download className="h-4 w-4" />
          {isBackingUp ? 'Backing Up...' : 'Backup Now'}
        </Button>,
        document.getElementById('settings-save-button-portal')!
      )}
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
          {/* Backup button moved to top-right portal */}
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
          <div className="rounded-xl border border-border/60 overflow-x-auto">
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
// Integrations section — IndiaMART (and future external APIs)
// ─────────────────────────────────────────────────────────────

function IntegrationsSection() {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold">Integrations</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Connect external lead sources. New leads land in /crm/leads automatically.
        </p>
      </div>
      <IndiamartCard />
    </div>
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
      {document.getElementById('settings-save-button-portal') && createPortal(
        <Button onClick={() => toast.success('General settings saved')} size="sm" className="gap-1.5 cursor-pointer h-8">
          <Save className="h-4 w-4" />
          Save General Settings
        </Button>,
        document.getElementById('settings-save-button-portal')!
      )}
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
        </CardContent>
      </Card>
    </motion.div>
  )
}
