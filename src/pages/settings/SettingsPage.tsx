import { useState, useEffect, useMemo, useCallback } from 'react'
import api, { handleApiError } from '@/lib/api'
import { createPortal } from 'react-dom'
import { useSettingsStore, type DateFormat } from '@/stores/settingsStore'
import { useAuthStore } from '@/stores/authStore'
import { isAdminish } from '@/types'
import { motion, type Variants } from 'framer-motion'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { requiredGstin, requiredDrugLicense, DL_MAX } from '@/lib/validators'
import { isValidPhone } from '@/lib/phones'
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
  MessageCircle,
  AlertTriangle,
  Bell,
  FileText,
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
import { JustdialCard } from './integrations/JustdialCard'
import NumberingSection from '@/pages/numbering/NumberingPage'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'

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
  { id: 'invoicePrint', label: 'Invoice & Payment', icon: FileText, description: 'Printed title, GSTIN / D.L. visibility, payment details', adminOnly: true },
  { id: 'numbering', label: 'Document Numbering', icon: Hash, description: 'Invoice / quotation / PE formats' },
  { id: 'backup', label: 'Backup & Data', icon: Database, description: 'Backups & data management' },
  { id: 'whatsapp', label: 'WhatsApp Messages', icon: MessageCircle, description: 'Automatic customer & supplier messages', adminOnly: true },
  { id: 'notifications', label: 'Notifications', icon: Bell, description: 'How often dues, expiry & stock alerts repeat', adminOnly: true },
  { id: 'integrations', label: 'Integrations', icon: Zap, description: 'IndiaMART & external APIs', adminOnly: true },
  { id: 'general', label: 'General', icon: Settings, description: 'App-wide preferences' },
]

// ─────────────────────────────────────────────────────────────
// Zod schemas
// ─────────────────────────────────────────────────────────────

// Room for three 10-digit numbers plus separators, with slack for a landline
// carrying an STD code.
const BUSINESS_PHONE_MAX = 60

const businessProfileSchema = z.object({
  companyName: z.string().min(1, 'Company name is required'),
  address: z.string().min(1, 'Address is required'),
  // A business publishes every number it answers on — our own letterhead lists
  // three — so this takes a comma-separated list rather than one mobile. Each
  // entry goes through the same rule the customer/supplier phone fields use, so
  // landlines are accepted here too.
  phone: z
    .string()
    .trim()
    .min(1, 'Phone is required')
    .refine((v) => {
      const parts = v.split(',').map((p) => p.trim()).filter(Boolean)
      return parts.length > 0 && parts.every(isValidPhone)
    }, 'Enter valid phone numbers, separated by commas'),
  email: z.string().email('Valid email required'),
  gstin: requiredGstin(),
  drugLicense: requiredDrugLicense(),
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
  const isAdmin = useAuthStore((s) => isAdminish(s.user))
  const visibleSections = useMemo(
    () => settingsSections.filter((s) => !s.adminOnly || isAdmin),
    [isAdmin],
  )

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  const activeConfig = visibleSections.find((s) => s.id === activeSection)
  const ActiveIcon = activeConfig?.icon || Settings

  return (
    <div className="-m-3 md:-m-4 lg:-m-6 flex h-content-viewport flex-col overflow-hidden">
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
        <div className="hidden lg:flex w-64 shrink-0 flex-col border-r border-border/40 bg-muted/5 dark:bg-muted/2">
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
                      {/* Label must never clip — it's the nav item's name. Wrap
                          if the width is ever tight rather than truncating. */}
                      <p className="leading-tight">{section.label}</p>
                      <p
                        title={section.description}
                        className={cn(
                          'truncate text-[9px] leading-tight transition-colors',
                          isActive ? 'text-primary/70' : 'text-muted-foreground/60'
                        )}
                      >
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
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* Mobile / tablet section switcher — the left sidebar is hidden below
              lg, so this horizontal scrollable pill bar is the only way to move
              between sections on phones and tablets. */}
          <div className="lg:hidden shrink-0 border-b border-border/40 bg-muted/10 dark:bg-muted/5">
            <div className="flex gap-1.5 overflow-x-auto px-3 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {visibleSections.map((section) => {
                const Icon = section.icon
                const isActive = activeSection === section.id
                return (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    className={cn(
                      'flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all',
                      isActive
                        ? 'bg-primary/10 text-primary shadow-sm dark:bg-primary/15'
                        : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                    )}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="whitespace-nowrap">{section.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Section sub-header */}
          <div className="shrink-0 flex items-center justify-between gap-2 border-b border-border/40 bg-muted/10 px-4 py-2 sm:px-6 dark:bg-muted/5">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                activeSection === 'business' ? 'bg-primary/10 text-primary' :
                activeSection === 'numbering' ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400' :
                activeSection === 'backup' ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400' :
                activeSection === 'integrations' ? 'bg-violet-500/10 text-violet-600 dark:text-violet-400' :
                activeSection === 'notifications' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' :
                'bg-muted/60 text-muted-foreground'
              )}>
                <ActiveIcon className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{activeConfig?.label}</p>
                <p className="truncate text-[10px] text-muted-foreground">{activeConfig?.description}</p>
              </div>
            </div>

            {/* Top-right save button placeholder */}
            <div id="settings-save-button-portal" className="shrink-0" />
          </div>

          {/* Scrollable content */}
          <ScrollArea className="min-h-0 flex-1">
            <div className="p-3 sm:p-6">
              <motion.div
                key={activeSection}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
              >
                {activeSection === 'business' && <BusinessProfileSection />}
                {activeSection === 'numbering' && <NumberingSection />}
                {activeSection === 'backup' && <BackupDataSection />}
                {activeSection === 'whatsapp' && isAdmin && <WhatsAppMessagesSection />}
                {activeSection === 'notifications' && isAdmin && <NotificationCadenceSection />}
                {activeSection === 'integrations' && isAdmin && <IntegrationsSection />}
                {activeSection === 'invoicePrint' && isAdmin && <InvoicePrintSection />}
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
// Section: WhatsApp Messages
// ─────────────────────────────────────────────────────────────

type WhatsAppFlagKey =
  | 'invoiceAutoSend'
  | 'paymentReceipt'
  | 'saleReminder'
  | 'lowStock'
  | 'orderDispatched'

// Order here is the order shown on screen — customer-facing messages first,
// then supplier-facing, then the one that isn't wired to any button yet.
const WHATSAPP_FLAGS: { key: WhatsAppFlagKey; title: string; description: string }[] = [
  {
    key: 'invoiceAutoSend',
    title: 'Invoice with payment QR',
    description: 'Sent to the customer automatically when a credit or partly-paid invoice is saved, and by the "Send WhatsApp" button.',
  },
  {
    key: 'paymentReceipt',
    title: 'Payment receipt',
    description: 'Sent when a payment is recorded — at billing, from the invoice page, or when an online UPI payment is confirmed.',
  },
  {
    key: 'saleReminder',
    title: 'Monthly sale reminder',
    description: 'Sent to the customer on the day their reminder falls due, once per month.',
  },
  {
    key: 'lowStock',
    title: 'Low-stock alert to supplier',
    description: 'Sent to the supplier who last delivered a product when its stock falls to the minimum. Goes to suppliers, not customers.',
  },
  // 'orderDispatched' is deliberately NOT listed — the dispatch notice isn't in
  // use yet and nothing in the UI triggers it. The backend flag still exists and
  // still defaults to OFF, so the endpoint stays disabled; add a row back here
  // when the feature is actually wired up.
]

function WhatsAppMessagesSection() {
  const [flags, setFlags] = useState<Record<WhatsAppFlagKey, boolean> | null>(null)
  const [masterEnabled, setMasterEnabled] = useState(true)
  const [savingKey, setSavingKey] = useState<WhatsAppFlagKey | null>(null)

  useEffect(() => {
    api.get('/whatsapp/automation')
      .then((res) => {
        setFlags(res.data.flags)
        setMasterEnabled(res.data.masterEnabled)
      })
      .catch(() => toast.error('Could not load WhatsApp message settings'))
  }, [])

  const toggle = async (key: WhatsAppFlagKey, next: boolean) => {
    if (!flags) return
    const previous = flags
    // Optimistic — the switch should feel instant; we roll back if the save fails.
    setFlags({ ...flags, [key]: next })
    setSavingKey(key)
    try {
      const res = await api.put('/whatsapp/automation', { [key]: next })
      setFlags(res.data.flags)
      setMasterEnabled(res.data.masterEnabled)
      toast.success(`${WHATSAPP_FLAGS.find(f => f.key === key)?.title} ${next ? 'enabled' : 'disabled'}`)
    } catch (err) {
      setFlags(previous)
      handleApiError(err, 'Could not save — the setting was not changed')
    } finally {
      setSavingKey(null)
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <MessageCircle className="h-4 w-4" />
            </div>
            <div>
              <CardTitle>Automatic WhatsApp Messages</CardTitle>
              <CardDescription>
                Choose which messages the system sends on its own. Changes apply within 30 seconds.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* When the server-side master switch is off, every toggle below is
              inert. Say so plainly rather than letting the screen look broken. */}
          {!masterEnabled && (
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-foreground">All WhatsApp sending is switched off on the server</p>
                <p className="text-xs text-muted-foreground">
                  These toggles are saved but have no effect until the master switch
                  (<code className="text-[11px]">WHATSAPP_AUTO_SEND_ENABLED</code>) is turned back on by your developer.
                </p>
              </div>
            </div>
          )}

          {!flags ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              <span className="text-sm">Loading…</span>
            </div>
          ) : (
            WHATSAPP_FLAGS.map((f) => (
              <div
                key={f.key}
                className="flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-muted/20 px-4 py-3.5 transition-colors dark:bg-muted/10"
              >
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm font-medium text-foreground">{f.title}</p>
                  <p className="text-xs text-muted-foreground">{f.description}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {savingKey === f.key && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                  <Switch
                    checked={flags[f.key]}
                    disabled={savingKey !== null}
                    onCheckedChange={(v) => void toggle(f.key, v)}
                  />
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Section: Notifications (reminder cadence)
// ─────────────────────────────────────────────────────────────

// Mirrors NotificationCadence in the backend's notification-cadence.ts. The
// server clamps every value on save and returns what it stored, so this screen
// always shows what the alert generators will actually do.
interface Cadence {
  customerDue: { beforeDays: number; reAlertDays: number }
  supplierDue: { beforeDays: number; reAlertDays: number }
  stock: { reAlertDays: number; expiredGraceDays: number }
}

type CadenceGroup = keyof Cadence

interface CadenceField {
  group: CadenceGroup
  key: string
  label: string
  hint: string
  min: number
  max: number
}

const CADENCE_FIELDS: CadenceField[] = [
  { group: 'customerDue', key: 'beforeDays',       label: 'Start reminding',   hint: 'days before the invoice due date (0 = on the due date)',           min: 0, max: 90 },
  { group: 'customerDue', key: 'reAlertDays',      label: 'Alert again after', hint: 'days, if the alert was opened and it is still unpaid',            min: 1, max: 90 },
  { group: 'supplierDue', key: 'beforeDays',       label: 'Start reminding',   hint: 'days before the payment is due to the supplier',                  min: 0, max: 90 },
  { group: 'supplierDue', key: 'reAlertDays',      label: 'Alert again after', hint: 'days, if the alert was opened and it is still unpaid',            min: 1, max: 90 },
  { group: 'stock',       key: 'reAlertDays',      label: 'Alert again after', hint: 'days, if the alert was opened and nothing was done',              min: 1, max: 90 },
  { group: 'stock',       key: 'expiredGraceDays', label: 'Stop chasing expired after', hint: 'days past the expiry date (older stock assumed already dealt with)', min: 1, max: 3650 },
]

const CADENCE_GROUPS: { id: CadenceGroup; title: string; description: string }[] = [
  { id: 'customerDue', title: 'Customer payment due', description: 'Unpaid and part-paid invoices. It keeps asking until the invoice is paid or somebody marks the alert Resolved.' },
  { id: 'supplierDue', title: 'Supplier payment due', description: 'Money owed on purchase entries, counted from the entry\'s due date (or the supplier\'s credit term).' },
  { id: 'stock',       title: 'Expiry & low stock',   description: 'Keeps asking while the batch is still expiring or expired, or the product is still below its minimum. Writing a batch off — or restocking — closes its alerts.' },
]

// Same rule everywhere, so it's stated once rather than repeated per group.
const CADENCE_RULE =
  'An alert you have not opened yet never repeats itself — it is already sitting in the list. ' +
  'Once you have opened one, the next arrives the set number of days after it appeared, ' +
  'and keeps coming until the invoice is paid, the batch written off, or the product restocked.'

function NotificationCadenceSection() {
  const [cadence, setCadence] = useState<Cadence | null>(null)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    api.get<Cadence>('/notifications/cadence')
      .then((res) => setCadence(res.data))
      .catch(() => toast.error('Could not load notification settings'))
  }, [])

  const setField = (group: CadenceGroup, key: string, raw: string) => {
    // Keep an empty box empty while typing (parsing '' as 0 fights the user);
    // the server clamps anything out of range on save.
    const value = raw === '' ? ('' as unknown as number) : Number(raw)
    if (raw !== '' && !Number.isFinite(value)) return
    setCadence((c) => (c ? { ...c, [group]: { ...c[group], [key]: value } } : c))
    setDirty(true)
  }

  const save = async () => {
    if (!cadence) return
    setSaving(true)
    try {
      const res = await api.put<Cadence>('/notifications/cadence', cadence)
      setCadence(res.data)
      setDirty(false)
      toast.success('Notification settings saved', {
        description: 'Applied on the next alert run (nightly, or when you trigger one).',
      })
    } catch (err) {
      handleApiError(err, 'Could not save notification settings')
    } finally {
      setSaving(false)
    }
  }

  // Plain-English restatement of the numbers, so an admin can sanity-check the
  // effect without reasoning about three fields at once.
  const summary = (group: CadenceGroup): string => {
    if (!cadence) return ''
    if (group === 'stock') {
      const { reAlertDays, expiredGraceDays } = cadence.stock
      return (
        `Asks again every ${reAlertDays} day(s) after you open it, until the batch is written off ` +
        `or the product is restocked. Expired batches stop being chased ${expiredGraceDays} day(s) past expiry.`
      )
    }
    const g = cadence[group]
    const start = g.beforeDays > 0 ? `${g.beforeDays} day(s) before the due date` : 'on the due date'
    return `Starts ${start}, then asks again every ${g.reAlertDays} day(s) after you open it, until it is paid or resolved.`
  }

  return (
    <motion.div variants={itemVariants}>
      {createPortal(
        <Button onClick={save} disabled={!cadence || saving || !dirty} size="sm" className="gap-1.5 cursor-pointer h-8">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Notification Settings
        </Button>,
        document.getElementById('settings-save-button-portal') || document.body
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Bell className="h-4 w-4" />
            </div>
            <div>
              <CardTitle>Alert Reminders</CardTitle>
              <CardDescription>
                How long before an unfinished job asks you again.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3 text-xs leading-relaxed text-muted-foreground dark:bg-muted/10">
            {CADENCE_RULE}
          </p>
          {!cadence ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              <span className="text-sm">Loading…</span>
            </div>
          ) : (
            CADENCE_GROUPS.map((g) => (
              <div key={g.id} className="space-y-3">
                <div className="space-y-0.5">
                  <SectionLabel>{g.title}</SectionLabel>
                  <p className="text-xs text-muted-foreground">{g.description}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  {CADENCE_FIELDS.filter((f) => f.group === g.id).map((f) => (
                    <div key={`${f.group}.${f.key}`} className="space-y-1.5">
                      <Label htmlFor={`${f.group}-${f.key}`} className="text-xs">{f.label}</Label>
                      <Input
                        id={`${f.group}-${f.key}`}
                        type="number"
                        inputMode="numeric"
                        min={f.min}
                        max={f.max}
                        value={String((cadence[f.group] as Record<string, number>)[f.key] ?? '')}
                        onChange={(e) => setField(f.group, f.key, e.target.value)}
                      />
                      <p className="text-[11px] leading-snug text-muted-foreground">{f.hint}</p>
                    </div>
                  ))}
                </div>
                <p className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground dark:bg-muted/20">
                  {summary(g.id)}
                </p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </motion.div>
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
    setValue,
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
                    inputMode="tel"
                    maxLength={BUSINESS_PHONE_MAX}
                    placeholder="9994113242, 9994173036"
                    {...register('phone')}
                    // Digits plus the separators a list needs; letters dropped.
                    onChange={(e) => setValue('phone', e.target.value.replace(/[^\d,+()\s-]/g, '').slice(0, BUSINESS_PHONE_MAX), { shouldValidate: true, shouldDirty: true })}
                    error={!!errors.phone}
                  />
                  {errors.phone ? (
                    <p className="text-xs text-destructive">{errors.phone.message}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Separate multiple numbers with a comma.</p>
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
                    className="font-mono text-xs uppercase"
                    error={!!errors.gstin}
                    // GSTIN is 15 uppercase alphanumerics — force case, strip the rest, cap at 15.
                    onChange={(e) => setValue('gstin', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15), { shouldValidate: true, shouldDirty: true })}
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
                    maxLength={DL_MAX}
                    error={!!errors.drugLicense}
                    onChange={(e) => setValue('drugLicense', e.target.value, { shouldValidate: true, shouldDirty: true })}
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
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

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
      handleApiError(err, Array.isArray(msg) ? msg[0] : msg)
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
      handleApiError(err, 'Failed to get download link')
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeletingId(deleteTarget)
    try {
      await api.delete(`/backups/${deleteTarget}`)
      toast.success('Backup deleted')
      await fetchHistory()
    } catch (err: any) {
      handleApiError(err, 'Delete failed')
    } finally {
      setDeletingId(null)
      setDeleteTarget(null)
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
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 dark:bg-blue-500/15">
              <Download className="h-4.5 w-4.5 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="min-w-0">
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
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 dark:bg-emerald-500/15">
              <Clock className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="min-w-0">
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
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted/60 dark:bg-muted/30">
              <Database className="h-4.5 w-4.5 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <CardTitle>Backup History</CardTitle>
              <CardDescription>Newest first — click a row to download</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Mobile card list (below md) — the 6-column table is unusable on a
              phone; each backup collapses to a compact card here. */}
          <div className="md:hidden divide-y divide-border/40 rounded-xl border border-border/60 overflow-hidden">
            {loading ? (
              <div className="h-20 flex items-center justify-center text-sm text-muted-foreground">Loading…</div>
            ) : history.length === 0 ? (
              <div className="h-20 flex items-center justify-center px-4 text-center text-sm text-muted-foreground italic">
                No backups yet — tap "Backup Now" to create the first one.
              </div>
            ) : history.map((b) => {
              const isCompleted = b.status === 'COMPLETED'
              const isFailed = b.status === 'FAILED'
              const isRunning = b.status === 'IN_PROGRESS'
              return (
                <div key={b.id} className="space-y-2 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{formatDateTime(b.createdAt)}</p>
                      <p className="text-xs text-muted-foreground">
                        {isCompleted ? `${formatBytes(b.sizeBytes)} · ${b.rowCount.toLocaleString()} rows` : '—'}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {isCompleted && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 cursor-pointer hover:text-primary" onClick={() => handleDownload(b.id)} title="Download">
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {!isRunning && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 cursor-pointer text-destructive hover:bg-destructive/10" onClick={() => setDeleteTarget(b.id)} disabled={deletingId === b.id} title="Delete">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant={b.trigger === 'SCHEDULED' ? 'info' : 'purple'} size="sm">
                      {b.trigger === 'SCHEDULED' ? 'Scheduled' : 'Manual'}
                    </Badge>
                    {isRunning ? (
                      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" /> In progress
                      </span>
                    ) : (
                      <Badge variant={isCompleted ? 'success' : 'destructive'} size="sm" dot title={isFailed ? b.errorMessage ?? undefined : undefined}>
                        {isCompleted ? 'Completed' : 'Failed'}
                      </Badge>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Desktop table (md+) — scrolls horizontally if ever needed. */}
          <div className="hidden md:block rounded-xl border border-border/60 overflow-x-auto">
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
                              onClick={() => setDeleteTarget(b.id)}
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

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => { if (!o) setDeleteTarget(null) }}
        title="Delete this backup?"
        description="The backup file stored in Cloudflare R2 will also be permanently removed. This cannot be undone."
        confirmLabel="Delete"
        onConfirm={confirmDelete}
      />
    </motion.div>
  )
}

// ─────────────────────────────────────────────────────────────
// Integrations section — IndiaMART (and future external APIs)
// ─────────────────────────────────────────────────────────────

function IntegrationsSection() {
  const [tab, setTab] = useState<'indiamart' | 'justdial'>('indiamart')
  return (
    <div className="space-y-5">
      {/* Static header — title + source tabs stay pinned to the top of the
          scroll area while the selected integration's panel scrolls. The
          negative margins + padding let its background span the full width and
          cover the scroll container's own padding so nothing peeks above it. */}
      <div className="sticky top-0 z-10 -mx-3 -mt-3 space-y-3 bg-background px-3 pb-3 pt-3 sm:-mx-6 sm:-mt-6 sm:px-6 sm:pt-6">
        <div>
          <h2 className="text-base font-semibold">Integrations</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Connect external lead sources. New leads land in /crm/leads automatically.
          </p>
        </div>

        {/* Source tabs — one integration panel at a time. */}
        <div className="flex items-center gap-1 border-b border-border/40">
          {([
            { key: 'indiamart', label: 'IndiaMART' },
            { key: 'justdial', label: 'Justdial' },
          ] as const).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                '-mb-px border-b-2 px-3 py-2 text-sm font-semibold transition-colors',
                tab === t.key
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'indiamart' ? <IndiamartCard /> : <JustdialCard />}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Section: General Settings
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// Invoice & Payment — what the printed invoice/challan shows.
//
// Persisted as one JSON blob under the `invoice_settings` GlobalSetting key and
// read at render time by InvoicePdfService.getPrintOptions(). The title, the
// GSTIN / D.L. visibility and every payment line used to be hard-coded in
// invoice.hbs, so changing a phone number meant editing a template and
// redeploying.
//
// Business and customer GSTIN / D.L. are four independent toggles rather than
// two: a business may be registered for one and not the other, and what you
// must print about yourself is a separate question from what you print about
// the buyer.
// ─────────────────────────────────────────────────────────────
interface InvoicePrintSettings {
  documentTitle: string
  hideBusinessGstin: boolean
  hideBusinessDl: boolean
  hideCustomerGstin: boolean
  hideCustomerDl: boolean
  gpay: Array<{ name: string; number: string }>
  bankName: string
  bankAccountNumber: string
  bankIfsc: string
}

// Matches InvoicePdfService's fallbacks, so an untouched install prints exactly
// what it printed before any of this was configurable.
const INVOICE_PRINT_DEFAULTS: InvoicePrintSettings = {
  documentTitle: 'DELIVERY CHALLAN',
  hideBusinessGstin: false,
  hideBusinessDl: false,
  hideCustomerGstin: false,
  hideCustomerDl: false,
  gpay: [{ name: '', number: '' }, { name: '', number: '' }],
  bankName: '',
  bankAccountNumber: '',
  bankIfsc: '',
}

function InvoicePrintSection() {
  const getSetting = useSettingsStore((s) => s.getSetting)
  const updateSetting = useSettingsStore((s) => s.updateSetting)
  // Both PDF renderers read these off the store, so it has to be refreshed
  // after a save — otherwise printing straight after saving still uses the
  // values loaded at boot.
  const fetchInvoicePrintSettings = useSettingsStore((s) => s.fetchInvoicePrintSettings)

  const [v, setV] = useState<InvoicePrintSettings>(INVOICE_PRINT_DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const raw = await getSetting<Partial<InvoicePrintSettings>>('invoice_settings')
      if (cancelled) return
      // Merge onto defaults so a key added later can't land as undefined and
      // render an uncontrolled input.
      setV({
        ...INVOICE_PRINT_DEFAULTS,
        ...(raw ?? {}),
        // Always exactly two slots, so the form shape is stable even if the
        // stored array is short, missing or over-long.
        gpay: [0, 1].map((i) => ({
          name: raw?.gpay?.[i]?.name ?? '',
          number: raw?.gpay?.[i]?.number ?? '',
        })),
      })
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [getSetting])

  const setGpay = (i: number, field: 'name' | 'number', value: string) =>
    setV((p) => ({ ...p, gpay: p.gpay.map((g, gi) => (gi === i ? { ...g, [field]: value } : g)) }))

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateSetting('invoice_settings', {
        ...v,
        documentTitle: v.documentTitle.trim() || INVOICE_PRINT_DEFAULTS.documentTitle,
        // Blank rows are dropped on the way out; the PDF filters again, but
        // storing them would resurrect empty slots on the next load.
        gpay: v.gpay
          .map((g) => ({ name: g.name.trim(), number: g.number.trim() }))
          .filter((g) => g.name || g.number),
      })
      await fetchInvoicePrintSettings()
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading invoice settings…
      </div>
    )
  }

  return (
    <motion.div variants={itemVariants}>
      {document.getElementById('settings-save-button-portal') && createPortal(
        <Button onClick={handleSave} disabled={saving} size="sm" className="gap-1.5 cursor-pointer h-8">
          <Save className="h-4 w-4" />
          {saving ? 'Saving…' : 'Save Invoice Settings'}
        </Button>,
        document.getElementById('settings-save-button-portal')!
      )}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted/60 dark:bg-muted/30">
              <FileText className="h-4.5 w-4.5 text-muted-foreground" />
            </div>
            <div>
              <CardTitle>Invoice &amp; Payment</CardTitle>
              <CardDescription>What appears on the printed invoice / challan</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Document title */}
          <div>
            <SectionLabel>Document</SectionLabel>
            <div className="mt-3 flex flex-col gap-3 rounded-xl border border-border/60 bg-muted/20 px-4 py-3.5 dark:bg-muted/10 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-0.5 sm:pr-4">
                <p className="text-sm font-medium text-foreground">Printed Title</p>
                <p className="text-xs text-muted-foreground">
                  Shown in the top-right of every printed invoice.
                </p>
              </div>
              <Input
                value={v.documentTitle}
                onChange={(e) => setV((p) => ({ ...p, documentTitle: e.target.value }))}
                placeholder="DELIVERY CHALLAN"
                className="w-full shrink-0 sm:w-56"
              />
            </div>
          </div>

          {/* Visibility */}
          <div>
            <SectionLabel>GSTIN &amp; Drug Licence</SectionLabel>
            <div className="mt-3 space-y-2">
              <SettingToggleRow
                title="Hide our GSTIN"
                description="Omits the business GSTIN from the letterhead"
                checked={v.hideBusinessGstin}
                onCheckedChange={(c) => setV((p) => ({ ...p, hideBusinessGstin: c }))}
              />
              <SettingToggleRow
                title="Hide our D.L. No."
                description="Omits the business drug-licence number from the letterhead"
                checked={v.hideBusinessDl}
                onCheckedChange={(c) => setV((p) => ({ ...p, hideBusinessDl: c }))}
              />
              <SettingToggleRow
                title="Hide customer GSTIN"
                description="Omits the buyer's GSTIN from the Bill To block"
                checked={v.hideCustomerGstin}
                onCheckedChange={(c) => setV((p) => ({ ...p, hideCustomerGstin: c }))}
              />
              <SettingToggleRow
                title="Hide customer D.L. No."
                description="Omits the buyer's drug-licence number from the Bill To block"
                checked={v.hideCustomerDl}
                onCheckedChange={(c) => setV((p) => ({ ...p, hideCustomerDl: c }))}
              />
            </div>
          </div>

          {/* Payment details */}
          <div>
            <SectionLabel>Payment Details</SectionLabel>
            <p className="mt-1 text-xs text-muted-foreground">
              Printed under “Kindly deposit Payment through Our”. Leave everything blank to omit the
              whole block.
            </p>
            <div className="mt-3 space-y-2">
              {v.gpay.map((g, i) => (
                <div
                  key={i}
                  className="flex flex-col gap-3 rounded-xl border border-border/60 bg-muted/20 px-4 py-3.5 dark:bg-muted/10 sm:flex-row sm:items-center"
                >
                  <p className="w-28 shrink-0 text-sm font-medium text-foreground">
                    GPay {i + 1}
                  </p>
                  <Input
                    value={g.name}
                    onChange={(e) => setGpay(i, 'name', e.target.value)}
                    placeholder="Account holder name"
                    className="w-full sm:flex-1"
                  />
                  <Input
                    value={g.number}
                    onChange={(e) => setGpay(i, 'number', e.target.value)}
                    placeholder="99941-13242"
                    className="w-full sm:w-48"
                  />
                </div>
              ))}

              <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-muted/20 px-4 py-3.5 dark:bg-muted/10 sm:flex-row sm:items-center">
                <p className="w-28 shrink-0 text-sm font-medium text-foreground">Bank</p>
                <Input
                  value={v.bankName}
                  onChange={(e) => setV((p) => ({ ...p, bankName: e.target.value }))}
                  placeholder="Bank name"
                  className="w-full sm:flex-1"
                />
              </div>
              <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-muted/20 px-4 py-3.5 dark:bg-muted/10 sm:flex-row sm:items-center">
                <p className="w-28 shrink-0 text-sm font-medium text-foreground">A/C No.</p>
                <Input
                  value={v.bankAccountNumber}
                  onChange={(e) => setV((p) => ({ ...p, bankAccountNumber: e.target.value }))}
                  placeholder="Account number"
                  className="w-full sm:flex-1"
                />
              </div>
              <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-muted/20 px-4 py-3.5 dark:bg-muted/10 sm:flex-row sm:items-center">
                <p className="w-28 shrink-0 text-sm font-medium text-foreground">IFSC</p>
                <Input
                  value={v.bankIfsc}
                  onChange={(e) => setV((p) => ({ ...p, bankIfsc: e.target.value.toUpperCase() }))}
                  placeholder="HDFC0001234"
                  className="w-full sm:flex-1"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

function GeneralSettingsSection() {
  const storeSettings = useSettingsStore((s) => s.generalSettings)
  const fetchGeneralSettings = useSettingsStore((s) => s.fetchGeneralSettings)
  const updateGeneralSettings = useSettingsStore((s) => s.updateGeneralSettings)

  // Display scale is a per-device preference (authStore, local-only) and applies
  // live — not part of the batched "Save General Settings" below.
  const uiScale = useAuthStore((s) => s.uiScale)
  const setUiScale = useAuthStore((s) => s.setUiScale)

  // Local draft state so toggles feel responsive; saved as a batch on Save click.
  const [dateFormat, setDateFormat] = useState<DateFormat>(storeSettings.dateFormat)
  const [autoPrint, setAutoPrint] = useState(storeSettings.autoPrint)
  const [fefoEnforcement, setFefoEnforcement] = useState(storeSettings.fefoEnforcement)
  const [sessionTimeout, setSessionTimeout] = useState(String(storeSettings.sessionTimeoutMinutes))
  const [stockTracking, setStockTracking] = useState(storeSettings.stockTracking)
  const [saving, setSaving] = useState(false)

  // Stock Tracking changes how billing behaves for everyone, so it's
  // admin-only. Non-admins don't see the row at all and their save carries the
  // stored value through untouched (see handleSave).
  const isAdmin = useAuthStore((s) => isAdminish(s.user))

  useEffect(() => { fetchGeneralSettings() }, [fetchGeneralSettings])

  // Re-sync local draft when the store updates (e.g. after the fetch above).
  useEffect(() => {
    setDateFormat(storeSettings.dateFormat)
    setAutoPrint(storeSettings.autoPrint)
    setFefoEnforcement(storeSettings.fefoEnforcement)
    setSessionTimeout(String(storeSettings.sessionTimeoutMinutes))
    setStockTracking(storeSettings.stockTracking)
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
        // A non-admin never sees the toggle, so send back what's stored rather
        // than this component's draft — otherwise a pharmacist saving an
        // unrelated preference could write a stale value over an admin's flip.
        stockTracking: isAdmin ? stockTracking : storeSettings.stockTracking,
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
          {/* Display */}
          <div>
            <SectionLabel>Display</SectionLabel>
            <div className="mt-3 space-y-2">
              {/* Display Scale — applies live, per-device (authStore) */}
              <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-muted/20 px-4 py-3.5 dark:bg-muted/10 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-0.5 sm:pr-4">
                  <p className="text-sm font-medium text-foreground">Display Scale</p>
                  <p className="text-xs text-muted-foreground">
                    Auto adjusts to your screen so the app isn't oversized at high Windows
                    scaling. Pick a fixed size to override.
                  </p>
                </div>
                <Select
                  value={uiScale === 'auto' ? 'auto' : String(uiScale)}
                  onValueChange={(v) => setUiScale(v === 'auto' ? 'auto' : Number(v))}
                >
                  <SelectTrigger className="w-full shrink-0 sm:w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto (fit screen)</SelectItem>
                    <SelectItem value="1.1">Larger (110%)</SelectItem>
                    <SelectItem value="1">Default (100%)</SelectItem>
                    <SelectItem value="0.9">Compact (90%)</SelectItem>
                    <SelectItem value="0.8">Smaller (80%)</SelectItem>
                    <SelectItem value="0.75">Smallest (75%)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Date Format */}
              <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-muted/20 px-4 py-3.5 dark:bg-muted/10 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-0.5 sm:pr-4">
                  <p className="text-sm font-medium text-foreground">Date Format</p>
                  <p className="text-xs text-muted-foreground">How dates are displayed across the app</p>
                </div>
                <Select value={dateFormat} onValueChange={(v) => setDateFormat(v as DateFormat)}>
                  <SelectTrigger className="w-full shrink-0 sm:w-44">
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

          {/* Inventory — admin only. This is the master switch for whether the
              app counts stock at all, so it gets its own section (and a warning
              panel when off) rather than sitting among the automation toggles. */}
          {isAdmin && (
            <div>
              <SectionLabel>Inventory</SectionLabel>
              <div className="mt-3 space-y-2">
                <SettingToggleRow
                  title="Stock Tracking"
                  description="Require available stock to bill an item. Turn OFF to sell without stock — products become unlimited and purchase entry is no longer needed."
                  checked={stockTracking}
                  onCheckedChange={setStockTracking}
                />
                {!stockTracking && (
                  <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3.5">
                    <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                      Stock tracking is off — products sell as unlimited
                    </p>
                    <ul className="mt-1.5 space-y-1 text-xs text-amber-700/90 dark:text-amber-400/90">
                      <li>• Sales no longer check or reduce stock. Current stock figures are frozen, not zeroed — switch this back on and they pick up where they left off.</li>
                      <li>• Batch and expiry become free-text fields on each sale line, so the printed invoice can still carry them.</li>
                      <li>• Out-of-stock and low-stock alerts are hidden, since every product would otherwise read as permanently out of stock.</li>
                      <li>• Sales returns refund the customer but add nothing back to stock — the sale never took any.</li>
                      <li>• Purchase Entry, Purchase Orders and Batches stay available, but nothing requires them.</li>
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Session */}
          <div>
            <SectionLabel>Security</SectionLabel>
            <div className="mt-3 flex flex-col gap-3 rounded-xl border border-border/60 bg-muted/20 px-4 py-3.5 dark:bg-muted/10 sm:flex-row sm:items-center sm:justify-between">
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
                  className="w-full sm:w-38"
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
