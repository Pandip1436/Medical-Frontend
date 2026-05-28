import { useState, useEffect, useMemo, useCallback } from 'react'
import api from '@/lib/api'
import { createPortal } from 'react-dom'
import { useSettingsStore, type DateFormat } from '@/stores/settingsStore'
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
  Loader2,
  Trash2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
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
import { cn, formatDateTime, formatBytes } from '@/lib/utils'
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
  { id: 'numbering', label: 'Document Numbering', icon: Hash, description: 'Invoice / quotation / PR formats' },
  { id: 'backup', label: 'Backup & Data', icon: Database, description: 'Backups & data management' },
  { id: 'integrations', label: 'Integrations', icon: Zap, description: 'IndiaMART & external APIs', adminOnly: true },
  { id: 'general', label: 'General', icon: Settings, description: 'App-wide preferences' },
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
  const { fetchSettings } = useSettingsStore()
  const userRole = useAuthStore((s) => s.user?.role)
  const visibleSections = useMemo(
    () => settingsSections.filter((s) => !s.adminOnly || userRole === 'ADMIN'),
    [userRole],
  )

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

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

interface BackupRow {
  id: string
  filename: string
  sizeBytes: number
  rowCount: number
  trigger: 'MANUAL' | 'SCHEDULED'
  status: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED'
  errorMessage?: string | null
  createdAt: string
  completedAt?: string | null
  createdBy?: { id: string; name: string; email: string } | null
}

function BackupDataSection() {
  const [history, setHistory] = useState<BackupRow[]>([])
  const [isBackingUp, setIsBackingUp] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchHistory = useCallback(async () => {
    try {
      const res = await api.get<BackupRow[]>('/backups')
      setHistory(Array.isArray(res.data) ? res.data : [])
    } catch {
      setHistory([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchHistory() }, [fetchHistory])

  const handleBackup = async () => {
    setIsBackingUp(true)
    try {
      await api.post('/backups')
      toast.success('Backup completed')
      await fetchHistory()
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? 'Backup failed'
      toast.error(Array.isArray(msg) ? msg[0] : msg)
      await fetchHistory() // surface the FAILED row so admin can see the error
    } finally {
      setIsBackingUp(false)
    }
  }

  const handleDownload = async (id: string) => {
    try {
      const res = await api.get<{ url: string; expiresAt: string }>(`/backups/${id}/download`)
      window.open(res.data.url, '_blank', 'noopener,noreferrer')
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Failed to get download link')
    }
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this backup? The file in R2 will also be removed.')) return
    setDeletingId(id)
    try {
      await api.delete(`/backups/${id}`)
      toast.success('Backup deleted')
      await fetchHistory()
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Delete failed')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <motion.div className="space-y-6" variants={itemVariants}>
      {document.getElementById('settings-save-button-portal') && createPortal(
        <Button onClick={handleBackup} disabled={isBackingUp} size="sm" className="gap-1.5 cursor-pointer h-8">
          {isBackingUp ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {isBackingUp ? 'Backing up…' : 'Backup Now'}
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
              <CardDescription>
                Snapshot all business data as a compressed JSONL file. Stored in Cloudflare R2 and
                downloadable from the history below. For disaster recovery, use Neon's point-in-time
                recovery from the Neon console.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isBackingUp && (
            <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/20 p-4 dark:bg-muted/10">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Backup in progress — this typically takes 10–30 seconds. The page will refresh when done.
              </span>
            </div>
          )}
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
              <CardDescription>Runs automatically on the backend</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 rounded-xl border border-border/60 bg-muted/20 p-4 dark:bg-muted/10">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Frequency</span>
              <span className="text-sm font-medium text-foreground">Daily, ~02:00 IST</span>
            </div>
            <Separator className="bg-border/40" />
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Retention</span>
              <span className="text-sm font-medium text-foreground">Last 30 completed backups</span>
            </div>
            <Separator className="bg-border/40" />
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Storage</span>
              <span className="text-sm font-medium text-foreground">Cloudflare R2 (private)</span>
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
              <CardDescription>Newest first — click a row to download</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border border-border/60 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 dark:bg-muted/15">
                  <TableHead>Date &amp; Time</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead className="text-right">Rows</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-20 text-center text-sm text-muted-foreground">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : history.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-20 text-center text-sm text-muted-foreground italic">
                      No backups yet — click "Backup Now" to create the first one.
                    </TableCell>
                  </TableRow>
                ) : history.map((b) => {
                  const isCompleted = b.status === 'COMPLETED'
                  const isFailed = b.status === 'FAILED'
                  const isRunning = b.status === 'IN_PROGRESS'
                  return (
                    <TableRow key={b.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDateTime(b.createdAt)}
                      </TableCell>
                      <TableCell className="font-medium">
                        {isCompleted ? formatBytes(b.sizeBytes) : '—'}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {isCompleted ? b.rowCount.toLocaleString() : '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={b.trigger === 'SCHEDULED' ? 'info' : 'purple'} size="sm">
                          {b.trigger === 'SCHEDULED' ? 'Scheduled' : 'Manual'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {isRunning ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            In progress
                          </span>
                        ) : (
                          <Badge
                            variant={isCompleted ? 'success' : 'destructive'}
                            size="sm"
                            dot
                            title={isFailed ? b.errorMessage ?? undefined : undefined}
                          >
                            {isCompleted ? 'Completed' : 'Failed'}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {isCompleted && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 cursor-pointer hover:text-primary"
                              onClick={() => handleDownload(b.id)}
                              title="Download"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {!isRunning && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 cursor-pointer text-destructive hover:bg-destructive/10"
                              onClick={() => handleDelete(b.id)}
                              disabled={deletingId === b.id}
                              title="Delete"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
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
  const storeSettings = useSettingsStore((s) => s.generalSettings)
  const fetchGeneralSettings = useSettingsStore((s) => s.fetchGeneralSettings)
  const updateGeneralSettings = useSettingsStore((s) => s.updateGeneralSettings)

  // Local draft state so toggles feel responsive; saved as a batch on Save click.
  const [dateFormat, setDateFormat] = useState<DateFormat>(storeSettings.dateFormat)
  const [autoPrint, setAutoPrint] = useState(storeSettings.autoPrint)
  const [fefoEnforcement, setFefoEnforcement] = useState(storeSettings.fefoEnforcement)
  const [sessionTimeout, setSessionTimeout] = useState(String(storeSettings.sessionTimeoutMinutes))
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchGeneralSettings() }, [fetchGeneralSettings])

  // Re-sync local draft when the store updates (e.g. after the fetch above).
  useEffect(() => {
    setDateFormat(storeSettings.dateFormat)
    setAutoPrint(storeSettings.autoPrint)
    setFefoEnforcement(storeSettings.fefoEnforcement)
    setSessionTimeout(String(storeSettings.sessionTimeoutMinutes))
  }, [storeSettings])

  const handleSave = async () => {
    const minutes = Number(sessionTimeout)
    if (!Number.isFinite(minutes) || minutes < 5 || minutes > 480) {
      toast.error('Session timeout must be between 5 and 480 minutes')
      return
    }
    setSaving(true)
    try {
      await updateGeneralSettings({
        dateFormat,
        autoPrint,
        fefoEnforcement,
        sessionTimeoutMinutes: minutes,
      })
    } catch { /* error toast already shown by store */ }
    finally { setSaving(false) }
  }

  return (
    <motion.div variants={itemVariants}>
      {document.getElementById('settings-save-button-portal') && createPortal(
        <Button onClick={handleSave} disabled={saving} size="sm" className="gap-1.5 cursor-pointer h-8">
          <Save className="h-4 w-4" />
          {saving ? 'Saving…' : 'Save General Settings'}
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
              <Select value={dateFormat} onValueChange={(v) => setDateFormat(v as DateFormat)}>
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
