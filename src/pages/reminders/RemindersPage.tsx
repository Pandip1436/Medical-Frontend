import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence, type Variants } from 'framer-motion'
import { toast } from 'sonner'
import {
  Bell, Plus, Phone, CheckCircle2, XCircle, X, Clock, MessageSquare,
  Trash2, User, AlertCircle, RefreshCw, Mail, Search, ChevronRight,
  ListFilter, Store, Building2, Stethoscope, AlertTriangle, CalendarClock,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Card } from '@/components/ui/card'
import { DatePicker } from '@/components/ui/date-picker'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { cn, timeAgo } from '@/lib/utils'
import api from '@/lib/api'
import { useMasterDataStore } from '@/stores/masterDataStore'
import { useBranchStore } from '@/stores/branchStore'
import { useBranchRefresh } from '@/hooks/useBranchRefresh'
import { useDeepLinkParam, useDeepLinkHighlightState } from '@/hooks/useDeepLinkHighlight'

// ─── Types ────────────────────────────────────────────────────
type ContactStatus = 'TALKED' | 'NOT_RESPONDED' | 'DENIED' | 'NEED_TO_TALK' | 'SCHEDULED'
type CustomerType = 'RETAIL' | 'WHOLESALE' | 'DOCTOR'
type TypeKey = CustomerType | 'all'
type StatusKey = 'all' | 'today' | 'this-week' | 'overdue'

interface ContactLog {
  id: string
  status: ContactStatus
  notes?: string | null
  contactedAt: string
  followUpDate?: string | null
}

interface Reminder {
  id: string
  customerId: string
  dayOfMonth: number
  title: string
  notes?: string | null
  // Active one-off follow-up requested by the customer. Overrides the monthly
  // dayOfMonth schedule until the next contact is logged. null = monthly cycle.
  followUpDate?: string | null
  customer: { id: string; name: string; phone: string; type: string; email?: string | null }
  contacts: ContactLog[]
}

// ─── Config ───────────────────────────────────────────────────
const STATUS_CONFIG: Record<ContactStatus, { label: string; variant: any; icon: typeof CheckCircle2 }> = {
  TALKED:        { label: 'Talked',          variant: 'success',     icon: CheckCircle2 },
  NOT_RESPONDED: { label: 'Not Responded',   variant: 'warning',     icon: AlertCircle },
  DENIED:        { label: 'Denied',          variant: 'destructive', icon: XCircle },
  NEED_TO_TALK:  { label: 'Need to Talk',    variant: 'info',        icon: Phone },
  SCHEDULED:     { label: 'Scheduled',       variant: 'secondary',   icon: Clock },
}

const TYPE_FOLDERS: { key: TypeKey; label: string; icon: typeof ListFilter; accent: string }[] = [
  { key: 'all',       label: 'All',       icon: ListFilter,   accent: 'text-foreground' },
  { key: 'RETAIL',    label: 'Retail',    icon: Store,        accent: 'text-blue-600 dark:text-blue-400' },
  { key: 'WHOLESALE', label: 'Wholesale', icon: Building2,    accent: 'text-purple-600 dark:text-purple-400' },
  { key: 'DOCTOR',    label: 'Doctor',    icon: Stethoscope,  accent: 'text-emerald-600 dark:text-emerald-400' },
]

const typeTone: Record<CustomerType, { tone: string; border: string }> = {
  RETAIL:    { tone: 'text-blue-600 dark:text-blue-400 bg-blue-500/10',         border: 'border-l-blue-500' },
  WHOLESALE: { tone: 'text-purple-600 dark:text-purple-400 bg-purple-500/10',   border: 'border-l-purple-500' },
  DOCTOR:    { tone: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10', border: 'border-l-emerald-500' },
}

const STATUS_FILTERS: { key: StatusKey; label: string }[] = [
  { key: 'all',       label: 'All' },
  { key: 'today',     label: 'Today' },
  { key: 'this-week', label: 'This Week' },
  { key: 'overdue',   label: 'Overdue' },
]

const ORDINAL = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

// ─── Time math ────────────────────────────────────────────────
// Reminders recur monthly on `dayOfMonth`. Compute the next concrete due date
// from today: this month if the day hasn't passed yet, otherwise next month.
function nextDueDate(dayOfMonth: number, today: Date = new Date()): Date {
  const year = today.getFullYear()
  const month = today.getMonth()
  const todayDay = today.getDate()
  if (dayOfMonth >= todayDay) {
    return new Date(year, month, dayOfMonth)
  }
  return new Date(year, month + 1, dayOfMonth)
}

// Local (not UTC) yyyy-MM-dd — matches what DatePicker emits/consumes.
function toISODate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function daysUntil(date: Date, today: Date = new Date()): number {
  const a = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const b = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

function hasContactThisMonth(r: Reminder, today: Date = new Date()): boolean {
  return r.contacts.some(c => {
    const d = new Date(c.contactedAt)
    return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth()
  })
}

// "Skipped" = day already passed this month and we never logged a contact.
function isSkipped(r: Reminder, today: Date = new Date()): boolean {
  return r.dayOfMonth < today.getDate() && !hasContactThisMonth(r, today)
}

// "Done for the cycle" = the most recent contact is TALKED this calendar month.
function isTalkedThisMonth(r: Reminder, today: Date = new Date()): boolean {
  const c = r.contacts[0]
  if (!c || c.status !== 'TALKED') return false
  const d = new Date(c.contactedAt)
  return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth()
}

// Parse the reminder's active follow-up date (if any) into a Date.
function followUpDateOf(r: Reminder): Date | null {
  if (!r.followUpDate) return null
  const d = new Date(r.followUpDate)
  return isNaN(d.getTime()) ? null : d
}

// The reminder's effective due date. An active one-off follow-up overrides the
// monthly cycle — even when it's already in the past (→ overdue) — until the
// next contact is logged. Otherwise fall back to the monthly dayOfMonth.
function effectiveDue(r: Reminder, today: Date = new Date()): { date: Date; isFollowUp: boolean } {
  const fu = followUpDateOf(r)
  if (fu) return { date: fu, isFollowUp: true }
  return { date: nextDueDate(r.dayOfMonth, today), isFollowUp: false }
}

function nextDueLabel(r: Reminder, today: Date = new Date()): string {
  const { date: due, isFollowUp } = effectiveDue(r, today)
  const days = daysUntil(due, today)
  if (isFollowUp) {
    if (days < 0) return 'Follow-up overdue'
    if (days === 0) return 'Follow-up today'
    if (days === 1) return 'Follow-up tomorrow'
    if (days <= 7) return `Follow-up in ${days} days`
    return `Follow-up ${due.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
  }
  if (days === 0) return 'Due today'
  if (days === 1) return 'Due tomorrow'
  if (days <= 7) return `Due in ${days} days`
  return `Due ${due.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
}

// ─── Grouping by next due ─────────────────────────────────────
function groupByNextDue(items: Reminder[]): { label: string; items: Reminder[] }[] {
  const today = new Date()
  const buckets: Record<string, Reminder[]> = {
    'Overdue': [], 'Due today': [], 'This week': [], 'Later this month': [], 'Next month': [],
  }
  const currentMonth = today.getMonth()
  const currentYear = today.getFullYear()
  for (const r of items) {
    const { date: due } = effectiveDue(r, today)
    const days = daysUntil(due, today)
    if (days < 0) buckets['Overdue'].push(r)              // only pending follow-ups can be in the past
    else if (days === 0) buckets['Due today'].push(r)
    else if (days <= 7) buckets['This week'].push(r)
    else if (due.getMonth() === currentMonth && due.getFullYear() === currentYear) buckets['Later this month'].push(r)
    else buckets['Next month'].push(r)
  }
  return Object.entries(buckets)
    .filter(([, list]) => list.length > 0)
    .map(([label, list]) => ({ label, items: list }))
}

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.04 } },
}
const itemVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] as const } },
}

// ─── Page ─────────────────────────────────────────────────────
export default function RemindersPage() {
  const customers = useMasterDataStore(s => s.customers)
  const fetchCustomers = useMasterDataStore(s => s.fetchCustomers)
  const { activeBranchId } = useBranchStore()

  const [reminders, setReminders] = useState<Reminder[]>([])
  const [loading, setLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState<StatusKey>('today')
  const [typeFolder, setTypeFolder] = useState<TypeKey>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Add Reminder dialog state
  const [addOpen, setAddOpen] = useState(false)
  const [form, setForm] = useState({ customerId: '', dayOfMonth: '', title: '', notes: '' })
  const [customerSearch, setCustomerSearch] = useState('')
  const [saving, setSaving] = useState(false)

  const fetchReminders = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/reminders', { params: { branchId: activeBranchId || undefined } })
      setReminders(Array.isArray(res.data) ? res.data : [])
    } catch {
      toast.error('Failed to load reminders')
    } finally {
      setLoading(false)
    }
  }, [activeBranchId])

  useEffect(() => { fetchCustomers(); fetchReminders() }, [fetchReminders, fetchCustomers])
  useBranchRefresh(fetchReminders)

  // ── Counts ───────────────────────────────────────────────────
  const todayDay = new Date().getDate()
  const today = useMemo(() => new Date(), [])

  // Sidebar type counts — respect the current status filter
  const typeCounts = useMemo(() => {
    const base = applyStatusFilter(reminders, statusFilter, today)
    const counts: Record<TypeKey, number> = { all: base.length, RETAIL: 0, WHOLESALE: 0, DOCTOR: 0 }
    for (const r of base) {
      if (r.customer.type === 'RETAIL') counts.RETAIL++
      else if (r.customer.type === 'WHOLESALE') counts.WHOLESALE++
      else if (r.customer.type === 'DOCTOR') counts.DOCTOR++
    }
    return counts
  }, [reminders, statusFilter, today])

  // Toolbar status counts — respect the current type folder
  const statusCounts = useMemo(() => {
    const base = typeFolder === 'all' ? reminders : reminders.filter(r => r.customer.type === typeFolder)
    return {
      all: base.length,
      today: base.filter(r => r.dayOfMonth === todayDay).length,
      'this-week': base.filter(r => {
        const d = daysUntil(nextDueDate(r.dayOfMonth, today), today)
        return d > 0 && d <= 7
      }).length,
      overdue: base.filter(r => isSkipped(r, today)).length,
    } as Record<StatusKey, number>
  }, [reminders, typeFolder, today, todayDay])

  const filtered = useMemo(() => {
    let rows = applyStatusFilter(reminders, statusFilter, today)
    if (typeFolder !== 'all') rows = rows.filter(r => r.customer.type === typeFolder)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      rows = rows.filter(r =>
        r.customer.name.toLowerCase().includes(q)
        || r.customer.phone.includes(q)
        || r.title.toLowerCase().includes(q),
      )
    }
    // Sort by next-due ascending so the most urgent rows come first within each bucket
    return [...rows].sort((a, b) =>
      nextDueDate(a.dayOfMonth, today).getTime() - nextDueDate(b.dayOfMonth, today).getTime(),
    )
  }, [reminders, statusFilter, typeFolder, searchQuery, today])

  const grouped = useMemo(() => groupByNextDue(filtered), [filtered])

  // Selected reminder — pulled from the canonical list so it stays fresh after refetch
  const selectedReq = useMemo(
    () => (selectedId ? reminders.find(r => r.id === selectedId) ?? null : null),
    [selectedId, reminders],
  )

  // Deep-link from notifications
  const { targetId: deepLinkId, clearParam: clearDeepLink } = useDeepLinkParam('reminderId', '/reminders')
  const { highlightId, highlight } = useDeepLinkHighlightState()
  useEffect(() => {
    if (!deepLinkId || reminders.length === 0) return
    const r = reminders.find(x => x.id === deepLinkId)
    if (!r) return
    setStatusFilter('all')
    setTypeFolder('all')
    setSearchQuery('')
    setSelectedId(deepLinkId)
    highlight(deepLinkId)
    clearDeepLink()
  }, [deepLinkId, reminders, highlight, clearDeepLink])

  // ── Add Reminder handlers ────────────────────────────────────
  const filteredCustomers = customers.filter(c =>
    !customerSearch
    || c.name.toLowerCase().includes(customerSearch.toLowerCase())
    || c.phone.includes(customerSearch),
  )

  const handleAdd = async () => {
    if (!form.customerId || !form.dayOfMonth || !form.title) {
      toast.error('Customer, day and title are required')
      return
    }
    setSaving(true)
    try {
      await api.post('/reminders', {
        customerId: form.customerId,
        dayOfMonth: parseInt(form.dayOfMonth),
        title: form.title,
        notes: form.notes || undefined,
        branchId: activeBranchId || undefined,
      })
      toast.success('Reminder created')
      setAddOpen(false)
      setForm({ customerId: '', dayOfMonth: '', title: '', notes: '' })
      setCustomerSearch('')
      fetchReminders()
    } catch {
      toast.error('Failed to create reminder')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this reminder?')) return
    try {
      await api.delete(`/reminders/${id}`)
      toast.success('Reminder deleted')
      setSelectedId(null)
      fetchReminders()
    } catch {
      toast.error('Failed to delete reminder')
    }
  }

  // ── Toolbar count summary ────────────────────────────────────
  const totalCount = reminders.length
  const dueTodayCount = useMemo(() => reminders.filter(r => r.dayOfMonth === todayDay).length, [reminders, todayDay])
  const talkedThisMonthCount = useMemo(
    () => reminders.filter(r => isTalkedThisMonth(r, today)).length,
    [reminders, today],
  )

  const activeFolderLabel = TYPE_FOLDERS.find(f => f.key === typeFolder)?.label ?? 'All'
  // Caption describing both filters so the list count never reads as a bare "0 in All"
  // when a restrictive status filter (today / this-week / overdue) is active. The
  // status filter is the typical defaulted-active filter on load, so describe it first.
  const statusCaptionMap: Record<StatusKey, string> = {
    all: 'reminders',
    today: 'due today',
    'this-week': 'this week',
    overdue: 'overdue',
  }
  const statusCaption = statusCaptionMap[statusFilter]
  const listCaption = typeFolder === 'all'
    ? statusCaption
    : `${statusCaption} · ${activeFolderLabel}`

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible">
      <motion.div variants={itemVariants}>
        <Card className="overflow-hidden p-0">
          {/* ── Toolbar ── */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-3 py-2">
            <p className="text-xs text-muted-foreground">
              {dueTodayCount > 0 ? (
                <><span className="font-semibold text-amber-600 dark:text-amber-400">{dueTodayCount} due today</span></>
              ) : (
                <>No reminders due today</>
              )}
              {' · '}<span className="font-semibold text-emerald-600 dark:text-emerald-400">{talkedThisMonthCount} talked</span> this month
              {' · '}{totalCount} total
            </p>
            <div className="flex items-center gap-2">
              <div className="flex items-center rounded-md border border-border/60 bg-background p-0.5">
                {STATUS_FILTERS.map(s => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setStatusFilter(s.key)}
                    className={cn(
                      'rounded px-2 py-1 text-[11px] font-medium transition-colors',
                      statusFilter === s.key
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {s.label}
                    {(statusCounts[s.key] > 0 || statusFilter === s.key) && (
                      <span className={cn(
                        'ml-1 tabular-nums',
                        statusFilter === s.key ? 'opacity-90' : 'opacity-60',
                      )}>
                        {statusCounts[s.key] > 99 ? '99+' : statusCounts[s.key]}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <Button size="sm" className="h-7 gap-1 px-2 text-[11px]" onClick={() => setAddOpen(true)}>
                <Plus className="h-3.5 w-3.5" /> Add
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                className="h-7 w-7"
                onClick={fetchReminders}
                disabled={loading}
                aria-label="Refresh"
              >
                <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
              </Button>
            </div>
          </div>

          <div className="flex h-[calc(100vh-160px)] min-h-100 flex-col lg:flex-row">
            {/* ── Sidebar: customer-type folders ── */}
            <aside className={cn(
              'shrink-0 border-b border-border/60 lg:w-56 lg:border-b-0 lg:border-r',
              selectedReq && 'hidden lg:block',
            )}>
              <div className="px-3 py-3">
                <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  Customer Type
                </p>
                <nav className="space-y-0.5">
                  {TYPE_FOLDERS.map(cat => {
                    const Icon = cat.icon
                    const count = typeCounts[cat.key]
                    const isActive = typeFolder === cat.key
                    return (
                      <button
                        key={cat.key}
                        type="button"
                        onClick={() => setTypeFolder(cat.key)}
                        className={cn(
                          'group relative flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors',
                          isActive
                            ? 'bg-accent font-medium text-foreground'
                            : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                        )}
                      >
                        {isActive && (
                          <motion.span
                            layoutId="reminders-sidebar-active"
                            className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-primary"
                            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                          />
                        )}
                        <Icon className={cn('h-3.5 w-3.5 shrink-0', isActive ? cat.accent : '')} />
                        <span className="flex-1 truncate">{cat.label}</span>
                        {count > 0 && (
                          <span className={cn(
                            'rounded-full px-1.5 py-px text-[10px] font-semibold tabular-nums',
                            isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                          )}>
                            {count > 99 ? '99+' : count}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </nav>
              </div>
            </aside>

            {/* ── Main: search + list + detail panel ── */}
            <section className="flex min-h-0 flex-1 flex-row">
              <div className={cn(
                'flex min-w-0 flex-1 flex-col',
                selectedReq && 'hidden lg:flex',
              )}>
                <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2.5">
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder={`Search ${activeFolderLabel.toLowerCase()}…`}
                      className="h-8 border-border/60 pl-8 text-xs"
                    />
                  </div>
                  <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground/70">
                    {filtered.length} {listCaption}
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto">
                  {loading ? (
                    <div className="flex h-full flex-col items-center justify-center gap-3 py-16">
                      <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                      <p className="text-xs text-muted-foreground">Loading…</p>
                    </div>
                  ) : filtered.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-16 text-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/60">
                        <Bell className="h-5 w-5 text-muted-foreground/50" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">No reminders found</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {searchQuery || statusFilter !== 'today' || typeFolder !== 'all'
                            ? 'Try clearing the filters'
                            : 'No customer reminders due today'}
                        </p>
                      </div>
                      {!searchQuery && statusFilter === 'today' && typeFolder === 'all' && (
                        <Button size="sm" variant="outline" onClick={() => setAddOpen(true)} className="gap-1.5">
                          <Plus className="h-3.5 w-3.5" /> Add Reminder
                        </Button>
                      )}
                    </div>
                  ) : (
                    grouped.map(group => (
                      <div key={group.label}>
                        <div className="sticky top-0 z-10 bg-background/95 px-3 py-1 backdrop-blur-sm">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                            {group.label}
                          </p>
                        </div>
                        {group.items.map(r => (
                          <ReminderRow
                            key={r.id}
                            reminder={r}
                            isSelected={selectedId === r.id}
                            highlighted={highlightId === r.id}
                            onSelect={setSelectedId}
                          />
                        ))}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Detail panel */}
              <AnimatePresence initial={false}>
                {selectedReq && (
                  <motion.aside
                    key={selectedReq.id}
                    initial={{ x: 24, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: 24, opacity: 0 }}
                    transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                    className="flex min-w-0 flex-1 flex-col bg-background lg:w-md lg:flex-none lg:border-l lg:border-border/60 xl:w-lg"
                  >
                    <ReminderDetailPanel
                      reminder={selectedReq}
                      onClose={() => setSelectedId(null)}
                      onDelete={() => handleDelete(selectedReq.id)}
                      onContactLogged={fetchReminders}
                    />
                  </motion.aside>
                )}
              </AnimatePresence>
            </section>
          </div>
        </Card>
      </motion.div>

      {/* ── Add Reminder dialog (kept verbatim from the previous page) ── */}
      <Dialog open={addOpen} onOpenChange={(open) => {
        if (!open) { setForm({ customerId: '', dayOfMonth: '', title: '', notes: '' }); setCustomerSearch('') }
        setAddOpen(open)
      }}>
        <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-md">
          <DialogHeader className="shrink-0">
            <DialogTitle>Add Reminder</DialogTitle>
            <DialogDescription>Set a monthly follow-up reminder for a customer.</DialogDescription>
          </DialogHeader>
          <div className="flex-1 space-y-4 overflow-y-auto pr-1">
            {/* Customer combobox */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Customer *</Label>
              <div className="overflow-hidden rounded-xl border border-border/60">
                <div className="flex items-center gap-2 border-b border-border/40 bg-muted/20 px-3 py-2">
                  <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                  <input
                    placeholder="Search by name or phone..."
                    value={customerSearch}
                    onChange={e => { setCustomerSearch(e.target.value); setForm(f => ({ ...f, customerId: '' })) }}
                    className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/40"
                    autoComplete="off"
                  />
                  {form.customerId && (
                    <button
                      type="button"
                      onClick={() => { setCustomerSearch(''); setForm(f => ({ ...f, customerId: '' })) }}
                      className="text-muted-foreground/40 hover:text-foreground"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
                {form.customerId ? (
                  <div className="flex items-center gap-2.5 bg-emerald-50/50 px-3 py-2.5 dark:bg-emerald-950/20">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-[11px] font-bold text-emerald-600">
                      {customerSearch.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold">{customerSearch}</p>
                      <p className="flex items-center gap-1 text-[10px] text-emerald-600/70">
                        <CheckCircle2 className="h-2.5 w-2.5" /> Selected
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="max-h-30 overflow-y-auto">
                    {filteredCustomers.length === 0 ? (
                      <p className="px-3 py-4 text-center text-xs text-muted-foreground">No customers found</p>
                    ) : (
                      filteredCustomers.slice(0, 50).map(c => (
                        <div
                          key={c.id}
                          className="flex cursor-pointer items-center gap-2.5 border-b border-border/5 px-3 py-2 transition-colors last:border-0 hover:bg-accent/60 active:bg-accent"
                          onClick={() => {
                            setForm(f => ({ ...f, customerId: c.id }))
                            setCustomerSearch(c.name)
                          }}
                        >
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                            {c.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-semibold">{c.name}</p>
                            <p className="text-[10px] text-muted-foreground">{c.phone} · {c.type}</p>
                          </div>
                          <Badge variant="secondary" size="sm" className="shrink-0 text-[9px]">{c.type}</Badge>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Reminder Day (1–31) *</Label>
              <Input
                type="number"
                min={1}
                max={31}
                placeholder="e.g. 3"
                value={form.dayOfMonth}
                onChange={e => setForm(f => ({ ...f, dayOfMonth: e.target.value }))}
              />
              {form.dayOfMonth && parseInt(form.dayOfMonth) >= 1 && parseInt(form.dayOfMonth) <= 31 && (
                <p className="text-[10px] text-muted-foreground">
                  Will remind on the {ORDINAL(parseInt(form.dayOfMonth))} of every month
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Title *</Label>
              <Input
                placeholder="e.g. Monthly medicine order follow-up"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Notes (optional)</Label>
              <Textarea
                placeholder="Any additional notes..."
                rows={2}
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter className="shrink-0 pt-2">
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={saving}>
              {saving ? 'Saving...' : 'Create Reminder'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}

// Map a status pill to a row predicate
function applyStatusFilter(rows: Reminder[], status: StatusKey, today: Date): Reminder[] {
  if (status === 'all') return rows
  if (status === 'today') return rows.filter(r => daysUntil(effectiveDue(r, today).date, today) === 0)
  if (status === 'overdue') return rows.filter(r => {
    const fu = followUpDateOf(r)
    // A pending follow-up that's already passed is overdue; otherwise fall back
    // to the monthly "skipped" rule (day passed this month, no contact logged).
    if (fu) return daysUntil(fu, today) < 0
    return isSkipped(r, today)
  })
  // this-week: due in the next 7 days, excluding today
  return rows.filter(r => {
    const d = daysUntil(effectiveDue(r, today).date, today)
    return d > 0 && d <= 7
  })
}

// ─── Row ──────────────────────────────────────────────────────
function ReminderRow({
  reminder: r, isSelected, highlighted, onSelect,
}: {
  reminder: Reminder
  isSelected: boolean
  highlighted: boolean
  onSelect: (id: string) => void
}) {
  const today = new Date()
  const { date: dueDate, isFollowUp } = effectiveDue(r, today)
  const dueDays = daysUntil(dueDate, today)
  const isDueToday = dueDays === 0
  const followUpOverdue = isFollowUp && dueDays < 0
  const skipped = isSkipped(r)
  const lastContact = r.contacts[0]
  const lastStatus = lastContact?.status as ContactStatus | undefined
  const doneThisCycle = isTalkedThisMonth(r)

  return (
    <div
      id={`reminderId-${r.id}`}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(r.id)}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect(r.id)
        }
      }}
      className={cn(
        'group flex cursor-pointer items-start gap-2.5 border-b border-border/30 px-3 py-2.5 transition-colors hover:bg-muted/40',
        isSelected && 'bg-accent/60',
        highlighted && 'bg-emerald-500/10 ring-1 ring-emerald-500/40',
        doneThisCycle && 'opacity-80',
      )}
    >
      {/* Day badge — reflects the follow-up date when one is active */}
      <div className={cn(
        'flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-lg text-center',
        followUpOverdue ? 'bg-rose-500 text-white'
          : isDueToday ? 'bg-amber-500 text-white'
          : isFollowUp ? 'bg-violet-500 text-white'
          : 'bg-muted text-foreground',
      )}>
        <span className="text-[13px] font-black leading-none">{isFollowUp ? dueDate.getDate() : r.dayOfMonth}</span>
        <span className="text-[7px] font-semibold uppercase tracking-wider opacity-80">
          {isDueToday ? 'Today' : followUpOverdue ? 'Late' : isFollowUp ? 'F-up' : 'Day'}
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className={cn(
            'truncate text-[13px] leading-tight font-semibold text-foreground',
          )}>
            {r.customer.name}
          </p>
          <Badge variant="secondary" size="sm" className="text-[9px]">{r.customer.type}</Badge>
          {lastStatus ? (
            <Badge variant={STATUS_CONFIG[lastStatus].variant} size="sm" className="text-[9px]">
              {STATUS_CONFIG[lastStatus].label}
            </Badge>
          ) : (
            <Badge variant="outline" size="sm" className="text-[9px]">No contact yet</Badge>
          )}
          {isFollowUp && (
            <span className={cn(
              'inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider',
              followUpOverdue
                ? 'bg-rose-500/15 text-rose-700 dark:text-rose-400'
                : 'bg-violet-500/15 text-violet-700 dark:text-violet-400',
            )}>
              <CalendarClock className="h-2.5 w-2.5" /> Follow-up {dueDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
            </span>
          )}
          {skipped && !isFollowUp && (
            <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-amber-500/15 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-2.5 w-2.5" /> Skipped
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {r.title} · <span className="font-mono">{r.customer.phone}</span>
        </p>
        <p className="mt-1 text-[10px] text-muted-foreground/60">
          {nextDueLabel(r)}
          {lastContact && <> · Last {STATUS_CONFIG[lastStatus!].label.toLowerCase()} {timeAgo(lastContact.contactedAt)}</>}
        </p>
      </div>

      <ChevronRight
        className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground/40"
        aria-hidden
      />
    </div>
  )
}

// ─── Side detail panel ────────────────────────────────────────
function ReminderDetailPanel({
  reminder: r, onClose, onDelete, onContactLogged,
}: {
  reminder: Reminder
  onClose: () => void
  onDelete: () => void
  onContactLogged: () => void
}) {
  const todayDay = new Date().getDate()
  const isDueToday = r.dayOfMonth === todayDay
  const customerType = (r.customer.type as CustomerType) in typeTone
    ? (r.customer.type as CustomerType)
    : 'RETAIL'
  const tone = typeTone[customerType]

  // Inline log form state — reset between selections via the key={r.id} on the parent <motion.aside>
  const [logStatus, setLogStatus] = useState<ContactStatus>('TALKED')
  const [logNotes, setLogNotes] = useState('')
  const [logFollowUp, setLogFollowUp] = useState('')   // ISO yyyy-MM-dd, optional
  const [logSaving, setLogSaving] = useState(false)
  const [clearingFollowUp, setClearingFollowUp] = useState(false)

  const activeFollowUp = followUpDateOf(r)
  const followUpOverdue = !!activeFollowUp && daysUntil(activeFollowUp) < 0

  const handleLog = async () => {
    setLogSaving(true)
    try {
      await api.post(`/reminders/${r.id}/contacts`, {
        status: logStatus,
        notes: logNotes.trim() || undefined,
        followUpDate: logFollowUp || undefined,
      })
      toast.success(logFollowUp ? 'Contact logged · follow-up scheduled' : 'Contact logged')
      setLogNotes('')
      setLogStatus('TALKED')
      setLogFollowUp('')
      onContactLogged()
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Failed to log contact')
    } finally {
      setLogSaving(false)
    }
  }

  // Clear the active follow-up without logging a contact — reverts the reminder
  // to its plain monthly cycle.
  const handleClearFollowUp = async () => {
    setClearingFollowUp(true)
    try {
      await api.patch(`/reminders/${r.id}`, { followUpDate: null })
      toast.success('Follow-up cleared')
      onContactLogged()
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Failed to clear follow-up')
    } finally {
      setClearingFollowUp(false)
    }
  }

  const waUrl = `https://wa.me/91${r.customer.phone}?text=${encodeURIComponent(
    `Hi ${r.customer.name}, this is a follow-up regarding your monthly order. Please let us know if you need anything!`,
  )}`
  const mailUrl = r.customer.email ? `mailto:${r.customer.email}?subject=${encodeURIComponent(
    `Follow-up: ${r.title}`,
  )}&body=${encodeURIComponent(
    `Dear ${r.customer.name},\n\nThis is a follow-up regarding your monthly order.\n\nPlease let us know if you need anything!\n\nRegards`,
  )}` : null

  return (
    <>
      {/* Header */}
      <div className={cn('flex items-start gap-3 border-b border-l-[3px] border-border/60 px-4 py-3', tone.border)}>
        <div className={cn(
          'flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl text-center',
          isDueToday ? 'bg-amber-500 text-white' : 'bg-muted text-foreground',
        )}>
          <span className="text-sm font-black leading-none">{r.dayOfMonth}</span>
          <span className="text-[7px] font-semibold uppercase tracking-wider opacity-80">
            {isDueToday ? 'Today' : 'Day'}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold">{r.customer.name}</p>
            <Badge variant="secondary" size="sm" className="text-[9px]">{r.customer.type}</Badge>
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{r.title}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground/70">
            Recurs on the {ORDINAL(r.dayOfMonth)} of every month
          </p>
        </div>
        <Button size="icon-sm" variant="ghost" className="h-7 w-7" onClick={onClose} aria-label="Close panel">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Body */}
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {/* Active follow-up banner */}
        {activeFollowUp && (
          <div className={cn(
            'flex items-center gap-2.5 rounded-lg border px-3 py-2.5',
            followUpOverdue
              ? 'border-rose-300/60 bg-rose-500/10 dark:border-rose-900/50'
              : 'border-violet-300/60 bg-violet-500/10 dark:border-violet-900/50',
          )}>
            <CalendarClock className={cn(
              'h-4 w-4 shrink-0',
              followUpOverdue ? 'text-rose-600 dark:text-rose-400' : 'text-violet-600 dark:text-violet-400',
            )} />
            <div className="min-w-0 flex-1">
              <p className={cn(
                'text-xs font-semibold',
                followUpOverdue ? 'text-rose-700 dark:text-rose-400' : 'text-violet-700 dark:text-violet-400',
              )}>
                {followUpOverdue ? 'Follow-up overdue' : 'Follow-up scheduled'}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {activeFollowUp.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 shrink-0 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
              onClick={handleClearFollowUp}
              disabled={clearingFollowUp}
            >
              <X className="h-3 w-3" /> {clearingFollowUp ? 'Clearing…' : 'Clear'}
            </Button>
          </div>
        )}

        {/* Customer card */}
        <div className="rounded-lg border border-border/40 bg-muted/20 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Customer</p>
          <div className="mt-2 space-y-1 text-xs">
            <div className="flex items-center gap-2">
              <Phone className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
              <span className="font-mono">{r.customer.phone}</span>
            </div>
            {r.customer.email && (
              <div className="flex items-center gap-2">
                <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                <span className="truncate">{r.customer.email}</span>
              </div>
            )}
          </div>
        </div>

        {/* Quick actions */}
        <div className="flex flex-wrap gap-2">
          <a
            href={`tel:${r.customer.phone}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border/60 bg-background px-3 text-xs font-medium text-emerald-600 transition-colors hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
          >
            <Phone className="h-3.5 w-3.5" /> Call
          </a>
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border/60 bg-background px-3 text-xs font-medium transition-colors hover:bg-green-50 dark:hover:bg-green-950/30"
            style={{ color: '#25D366' }}
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
            WhatsApp
          </a>
          {mailUrl && (
            <a
              href={mailUrl}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border/60 bg-background px-3 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/30"
            >
              <Mail className="h-3.5 w-3.5" /> Email
            </a>
          )}
        </div>

        {/* Notes */}
        {r.notes && (
          <div className="rounded-lg border border-border/40 bg-muted/10 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Notes</p>
            <p className="mt-1.5 whitespace-pre-wrap text-xs">{r.notes}</p>
          </div>
        )}

        {/* Contact history */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            Contact history · {r.contacts.length}
          </p>
          <div className="mt-2 space-y-2">
            {r.contacts.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border/40 px-3 py-4 text-center text-xs text-muted-foreground">
                No contacts logged yet.
              </p>
            ) : r.contacts.map(c => {
              const cfg = STATUS_CONFIG[c.status]
              const SIcon = cfg.icon
              return (
                <div key={c.id} className="flex items-start gap-2.5 rounded-lg border border-border/40 bg-muted/10 p-2.5">
                  <Badge variant={cfg.variant} size="sm" className="shrink-0 gap-1">
                    <SIcon className="h-3 w-3" /> {cfg.label}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    {c.notes && <p className="text-xs text-foreground/80">{c.notes}</p>}
                    {c.followUpDate && (
                      <p className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-medium text-violet-600 dark:text-violet-400">
                        <CalendarClock className="h-2.5 w-2.5" />
                        Follow-up set for {new Date(c.followUpDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    )}
                    <p className="mt-0.5 text-[10px] text-muted-foreground/60">
                      {new Date(c.contactedAt).toLocaleString('en-IN', {
                        day: '2-digit', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Inline log form — replaces the previous standalone modal */}
        <div className="rounded-lg border border-border/40 bg-muted/10 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            Log new contact
          </p>
          <div className="mt-2 space-y-2">
            <div className="space-y-1">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Status</Label>
              <Select value={logStatus} onValueChange={v => setLogStatus(v as ContactStatus)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(STATUS_CONFIG) as ContactStatus[]).map(k => {
                    const cfg = STATUS_CONFIG[k]
                    const SIcon = cfg.icon
                    return (
                      <SelectItem key={k} value={k}>
                        <div className="flex items-center gap-2">
                          <SIcon className="h-3.5 w-3.5" /> {cfg.label}
                        </div>
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Notes</Label>
              <Textarea
                placeholder="What was discussed, what was ordered, next steps…"
                rows={2}
                value={logNotes}
                onChange={e => setLogNotes(e.target.value)}
                className="text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Follow up on <span className="font-normal normal-case text-muted-foreground/60">· optional</span>
              </Label>
              <DatePicker
                value={logFollowUp}
                onChange={setLogFollowUp}
                min={toISODate(new Date())}
                placeholder="Pick a date the customer asked for"
                className="h-8 text-xs"
              />
              {logFollowUp && (
                <p className="text-[10px] text-violet-600 dark:text-violet-400">
                  Reminder will resurface on this date instead of its monthly day.
                </p>
              )}
            </div>
            <Button size="sm" className="w-full gap-1.5" onClick={handleLog} disabled={logSaving}>
              <MessageSquare className="h-3.5 w-3.5" />
              {logSaving ? 'Saving…' : 'Save contact log'}
            </Button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end border-t border-border/60 bg-muted/10 px-4 py-2.5">
        <Button
          size="sm"
          variant="ghost"
          className="gap-1.5 text-destructive/80 hover:bg-destructive/10 hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="h-3.5 w-3.5" /> Delete reminder
        </Button>
      </div>
    </>
  )
}
