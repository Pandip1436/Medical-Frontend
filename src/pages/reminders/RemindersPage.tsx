import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import {
  Bell, Plus, Phone, Calendar, CheckCircle2, XCircle, X,
  Clock, MessageSquare, Trash2, ChevronDown, ChevronUp,
  User, AlertCircle, RefreshCw, Mail,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import api from '@/lib/api'
import { useMasterDataStore } from '@/stores/masterDataStore'
import { useBranchStore } from '@/stores/branchStore'
import { useBranchRefresh } from '@/hooks/useBranchRefresh'

// ─── Types ────────────────────────────────────────────────────

type ContactStatus = 'TALKED' | 'NOT_RESPONDED' | 'DENIED' | 'NEED_TO_TALK' | 'SCHEDULED'

interface ContactLog {
  id: string
  status: ContactStatus
  notes?: string | null
  contactedAt: string
}

interface Reminder {
  id: string
  customerId: string
  dayOfMonth: number
  title: string
  notes?: string | null
  customer: { id: string; name: string; phone: string; type: string; email?: string | null }
  contacts: ContactLog[]
}

// ─── Helpers ──────────────────────────────────────────────────

const STATUS_CONFIG: Record<ContactStatus, { label: string; variant: any; icon: React.ReactNode }> = {
  TALKED:        { label: 'Talked',          variant: 'success',     icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  NOT_RESPONDED: { label: 'Not Responded',   variant: 'warning',     icon: <AlertCircle className="h-3.5 w-3.5" /> },
  DENIED:        { label: 'Denied',          variant: 'destructive', icon: <XCircle className="h-3.5 w-3.5" /> },
  NEED_TO_TALK:  { label: 'Need to Talk',    variant: 'info',        icon: <Phone className="h-3.5 w-3.5" /> },
  SCHEDULED:     { label: 'Scheduled',       variant: 'secondary',   icon: <Clock className="h-3.5 w-3.5" /> },
}

const ORDINAL = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

const todayDay = new Date().getDate()

// ─── Component ────────────────────────────────────────────────

export default function RemindersPage() {
  const customers = useMasterDataStore(s => s.customers)
  const fetchCustomers = useMasterDataStore(s => s.fetchCustomers)
  const { activeBranchId } = useBranchStore()

  const [reminders, setReminders] = useState<Reminder[]>([])
  const [loading, setLoading] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [logOpen, setLogOpen] = useState(false)
  const [selectedReminder, setSelectedReminder] = useState<Reminder | null>(null)
  const [contactLogs, setContactLogs] = useState<ContactLog[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Add form
  const [form, setForm] = useState({ customerId: '', dayOfMonth: '', title: '', notes: '' })
  const [customerSearch, setCustomerSearch] = useState('')
  const [saving, setSaving] = useState(false)

  // Log form
  const [logStatus, setLogStatus] = useState<ContactStatus>('TALKED')
  const [logNotes, setLogNotes] = useState('')
  const [logSaving, setLogSaving] = useState(false)

  // Filter
  const [filterDay, setFilterDay] = useState<'all' | 'today'>('all')
  const [searchQ, setSearchQ] = useState('')

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

  useEffect(() => { fetchCustomers(); fetchReminders() }, [fetchReminders])
  useBranchRefresh(fetchReminders)

  const filteredCustomers = customers.filter(c =>
    !customerSearch ||
    c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
    c.phone.includes(customerSearch)
  )

  const filteredReminders = reminders.filter(r => {
    if (filterDay === 'today' && r.dayOfMonth !== todayDay) return false
    if (searchQ && !r.customer.name.toLowerCase().includes(searchQ.toLowerCase()) &&
        !r.customer.phone.includes(searchQ) && !r.title.toLowerCase().includes(searchQ.toLowerCase())) return false
    return true
  })

  const todayCount = reminders.filter(r => r.dayOfMonth === todayDay).length

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
      fetchReminders()
    } catch {
      toast.error('Failed to delete reminder')
    }
  }

  const openLog = async (reminder: Reminder) => {
    setSelectedReminder(reminder)
    setLogStatus('TALKED')
    setLogNotes('')
    setLogsLoading(true)
    setLogOpen(true)
    try {
      const res = await api.get(`/reminders/${reminder.id}/contacts`)
      setContactLogs(Array.isArray(res.data) ? res.data : [])
    } catch {
      setContactLogs([])
    } finally {
      setLogsLoading(false)
    }
  }

  const handleAddLog = async () => {
    if (!selectedReminder) return
    setLogSaving(true)
    try {
      await api.post(`/reminders/${selectedReminder.id}/contacts`, {
        status: logStatus,
        notes: logNotes || undefined,
      })
      toast.success('Contact log added')
      setLogNotes('')
      // Refresh logs
      const res = await api.get(`/reminders/${selectedReminder.id}/contacts`)
      setContactLogs(Array.isArray(res.data) ? res.data : [])
      // Update the last contact in the list
      fetchReminders()
    } catch {
      toast.error('Failed to add log')
    } finally {
      setLogSaving(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="space-y-5"
    >
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reminders</h1>
          <p className="text-sm text-muted-foreground">Monthly customer follow-up reminders</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchReminders} disabled={loading}>
            <RefreshCw className={cn('h-3.5 w-3.5 mr-1.5', loading && 'animate-spin')} />
            Refresh
          </Button>
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Add Reminder
          </Button>
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/10">
              <Bell className="h-5 w-5 text-violet-500" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total</p>
              <p className="text-xl font-bold tabular-nums">{reminders.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className={cn(todayCount > 0 && 'border-amber-400/50')}>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10">
              <Calendar className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Due Today</p>
              <p className={cn('text-xl font-bold tabular-nums', todayCount > 0 && 'text-amber-600')}>{todayCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="col-span-2 sm:col-span-1">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Talked This Month</p>
              <p className="text-xl font-bold tabular-nums text-emerald-600">
                {reminders.filter(r => r.contacts[0]?.status === 'TALKED' &&
                  new Date(r.contacts[0].contactedAt).getMonth() === new Date().getMonth() &&
                  new Date(r.contacts[0].contactedAt).getFullYear() === new Date().getFullYear()
                ).length}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter row */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          placeholder="Search customer or title..."
          value={searchQ}
          onChange={e => setSearchQ(e.target.value)}
          className="sm:w-72"
        />
        <div className="flex gap-2">
          <Button
            variant={filterDay === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterDay('all')}
          >
            All Reminders
          </Button>
          <Button
            variant={filterDay === 'today' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterDay('today')}
            className={cn(todayCount > 0 && filterDay !== 'today' && 'border-amber-400/60 text-amber-600')}
          >
            <Calendar className="h-3.5 w-3.5 mr-1" />
            Due Today {todayCount > 0 && `(${todayCount})`}
          </Button>
        </div>
      </div>

      {/* Reminders list */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground/40" />
        </div>
      ) : filteredReminders.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/50">
              <Bell className="h-7 w-7 text-muted-foreground/30" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">No reminders found</p>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add Reminder
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          <AnimatePresence>
            {filteredReminders.map((r) => {
              const isToday = r.dayOfMonth === todayDay
              const lastContact = r.contacts[0]
              const lastStatus = lastContact?.status as ContactStatus | undefined
              const isExpanded = expandedId === r.id

              return (
                <motion.div
                  key={r.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.15 }}
                >
                  <Card className={cn(
                    'transition-all',
                    isToday && 'border-amber-400/60 shadow-amber-100/50 dark:shadow-amber-900/20 shadow-sm'
                  )}>
                    <CardContent className="p-0">
                      {/* Main row */}
                      <div className="flex items-center gap-3 px-4 py-3">
                        {/* Day badge */}
                        <div className={cn(
                          'flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl text-center',
                          isToday ? 'bg-amber-500 text-white' : 'bg-muted/60 text-foreground'
                        )}>
                          <span className="text-sm font-black leading-none">{r.dayOfMonth}</span>
                          <span className="text-[8px] font-semibold uppercase opacity-70">
                            {isToday ? 'Today' : 'Monthly'}
                          </span>
                        </div>

                        {/* Customer info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold truncate">{r.customer.name}</span>
                            <Badge variant="secondary" size="sm" className="text-[9px]">{r.customer.type}</Badge>
                            {isToday && <Badge variant="warning" size="sm" className="text-[9px]">Due Today</Badge>}
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {r.title} · <span className="font-mono">{r.customer.phone}</span>
                          </p>
                          <p className="text-[10px] text-muted-foreground/50">
                            Every {ORDINAL(r.dayOfMonth)} of the month
                          </p>
                        </div>

                        {/* Last contact status */}
                        <div className="shrink-0 flex items-center gap-2">
                          {lastStatus ? (
                            <Badge variant={STATUS_CONFIG[lastStatus].variant} size="sm" className="gap-1">
                              {STATUS_CONFIG[lastStatus].icon}
                              {STATUS_CONFIG[lastStatus].label}
                            </Badge>
                          ) : (
                            <Badge variant="secondary" size="sm" className="text-[9px]">No contact yet</Badge>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="shrink-0 flex items-center gap-1">
                          {/* Call */}
                          <a
                            href={`tel:${r.customer.phone}`}
                            title={`Call ${r.customer.phone}`}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/60 bg-background text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors"
                          >
                            <Phone className="h-3.5 w-3.5" />
                          </a>
                          {/* WhatsApp */}
                          <a
                            href={`https://wa.me/91${r.customer.phone}?text=${encodeURIComponent(`Hi ${r.customer.name}, this is a follow-up regarding your monthly order. Please let us know if you need anything!`)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={`WhatsApp ${r.customer.phone}`}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/60 bg-background hover:bg-green-50 dark:hover:bg-green-950/30 transition-colors"
                          >
                            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#25D366' }}>
                              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                            </svg>
                          </a>
                          {/* Mail — only if customer has email */}
                          {r.customer.email && (
                            <a
                              href={`mailto:${r.customer.email}?subject=${encodeURIComponent(`Follow-up: ${r.title}`)}&body=${encodeURIComponent(`Dear ${r.customer.name},\n\nThis is a follow-up regarding your monthly order.\n\nPlease let us know if you need anything!\n\nRegards`)}`}
                              title={`Email ${r.customer.email}`}
                              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/60 bg-background text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
                            >
                              <Mail className="h-3.5 w-3.5" />
                            </a>
                          )}
                          <div className="w-px h-5 bg-border/60 mx-0.5" />
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 gap-1.5 text-xs"
                            onClick={() => openLog(r)}
                          >
                            <MessageSquare className="h-3.5 w-3.5" />
                            Log Contact
                          </Button>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            onClick={() => setExpandedId(isExpanded ? null : r.id)}
                            title={isExpanded ? 'Collapse' : 'View history'}
                          >
                            {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          </Button>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            className="text-destructive/50 hover:text-destructive"
                            onClick={() => handleDelete(r.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>

                      {/* Expanded notes + contact history */}
                      <AnimatePresence initial={false}>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <div className="border-t border-border/40 px-4 py-3 bg-muted/10 space-y-3">
                              {r.notes && (
                                <div>
                                  <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Notes</p>
                                  <p className="text-xs text-muted-foreground">{r.notes}</p>
                                </div>
                              )}
                              {/* Mini contact history fetched on expand */}
                              <ExpandedHistory reminderId={r.id} />
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </CardContent>
                  </Card>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      )}

      {/* ── Add Reminder Dialog ── */}
      <Dialog open={addOpen} onOpenChange={(open) => {
        if (!open) { setForm({ customerId: '', dayOfMonth: '', title: '', notes: '' }); setCustomerSearch('') }
        setAddOpen(open)
      }}>
        <DialogContent className="sm:max-w-md max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle>Add Reminder</DialogTitle>
            <DialogDescription>Set a monthly follow-up reminder for a customer.</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {/* Customer combobox */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Customer *</Label>
              <div className="rounded-xl border border-border/60 overflow-hidden">
                {/* Search input always visible */}
                <div className="flex items-center gap-2 border-b border-border/40 px-3 py-2 bg-muted/20">
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
                {/* Selected display */}
                {form.customerId ? (
                  <div className="flex items-center gap-2.5 px-3 py-2.5 bg-emerald-50/50 dark:bg-emerald-950/20">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-[11px] font-bold text-emerald-600">
                      {customerSearch.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate">{customerSearch}</p>
                      <p className="text-[10px] text-emerald-600/70 flex items-center gap-1">
                        <CheckCircle2 className="h-2.5 w-2.5" /> Selected
                      </p>
                    </div>
                  </div>
                ) : (
                  /* Dropdown list — max 3 rows visible */
                  <div className="max-h-30 overflow-y-auto">
                    {filteredCustomers.length === 0 ? (
                      <p className="px-3 py-4 text-center text-xs text-muted-foreground">No customers found</p>
                    ) : (
                      filteredCustomers.slice(0, 50).map(c => (
                        <div
                          key={c.id}
                          className="flex items-center gap-2.5 cursor-pointer px-3 py-2 hover:bg-accent/60 active:bg-accent transition-colors border-b border-border/5 last:border-0"
                          onClick={() => {
                            setForm(f => ({ ...f, customerId: c.id }))
                            setCustomerSearch(c.name)
                          }}
                        >
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                            {c.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold truncate">{c.name}</p>
                            <p className="text-[10px] text-muted-foreground">{c.phone} · {c.type}</p>
                          </div>
                          <Badge variant="secondary" size="sm" className="text-[9px] shrink-0">{c.type}</Badge>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Day of month */}
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

            {/* Title */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Title *</Label>
              <Input
                placeholder="e.g. Monthly medicine order follow-up"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              />
            </div>

            {/* Notes */}
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

      {/* ── Log Contact Dialog ── */}
      <Dialog open={logOpen} onOpenChange={setLogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              {selectedReminder?.customer.name}
            </DialogTitle>
            <DialogDescription>
              {selectedReminder?.title} · {selectedReminder?.customer.phone}
            </DialogDescription>
          </DialogHeader>

          {/* Log new contact */}
          <div className="space-y-3 rounded-xl border border-border/60 bg-muted/10 p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Log Contact</p>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Status *</Label>
              <Select value={logStatus} onValueChange={v => setLogStatus(v as ContactStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_CONFIG).map(([val, cfg]) => (
                    <SelectItem key={val} value={val}>
                      <div className="flex items-center gap-2">
                        {cfg.icon}
                        {cfg.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Notes</Label>
              <Textarea
                placeholder="What was discussed, what was ordered, next steps..."
                rows={3}
                value={logNotes}
                onChange={e => setLogNotes(e.target.value)}
              />
            </div>
            <Button size="sm" onClick={handleAddLog} disabled={logSaving} className="w-full">
              {logSaving ? 'Saving...' : 'Save Contact Log'}
            </Button>
          </div>

          {/* Previous logs */}
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Contact History</p>
            {logsLoading ? (
              <div className="flex items-center justify-center py-6">
                <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground/40" />
              </div>
            ) : contactLogs.length === 0 ? (
              <p className="text-xs text-muted-foreground/60 py-4 text-center">No contact logs yet</p>
            ) : (
              <div className="max-h-52 overflow-y-auto space-y-2">
                {contactLogs.map(log => {
                  const cfg = STATUS_CONFIG[log.status]
                  return (
                    <div key={log.id} className="flex items-start gap-3 rounded-xl border border-border/40 bg-background p-3">
                      <Badge variant={cfg.variant} size="sm" className="shrink-0 gap-1 mt-0.5">
                        {cfg.icon}
                        {cfg.label}
                      </Badge>
                      <div className="flex-1 min-w-0">
                        {log.notes && <p className="text-xs text-foreground/80">{log.notes}</p>}
                        <p className="text-[10px] text-muted-foreground/50 mt-0.5">
                          {new Date(log.contactedAt).toLocaleDateString('en-IN', {
                            day: '2-digit', month: 'short', year: 'numeric',
                            hour: '2-digit', minute: '2-digit',
                          })}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}

// ── Sub-component: lazy-loaded contact history on expand ──────

function ExpandedHistory({ reminderId }: { reminderId: string }) {
  const [logs, setLogs] = useState<ContactLog[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    api.get(`/reminders/${reminderId}/contacts`)
      .then(res => { setLogs(Array.isArray(res.data) ? res.data.slice(0, 5) : []); setLoaded(true) })
      .catch(() => setLoaded(true))
  }, [reminderId])

  if (!loaded) return <div className="flex justify-center py-3"><RefreshCw className="h-4 w-4 animate-spin text-muted-foreground/40" /></div>
  if (logs.length === 0) return <p className="text-[11px] text-muted-foreground/50">No contact history yet.</p>

  return (
    <div>
      <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">Recent Contacts</p>
      <div className="space-y-1.5">
        {logs.map(log => {
          const cfg = STATUS_CONFIG[log.status]
          return (
            <div key={log.id} className="flex items-start gap-2 text-[11px]">
              <Badge variant={cfg.variant} size="sm" className="shrink-0 gap-1 text-[8px]">
                {cfg.icon}
                {cfg.label}
              </Badge>
              <span className="text-muted-foreground/60 whitespace-nowrap">
                {new Date(log.contactedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
              </span>
              {log.notes && <span className="truncate text-muted-foreground/80">{log.notes}</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
