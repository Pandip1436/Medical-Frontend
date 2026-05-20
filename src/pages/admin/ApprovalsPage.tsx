import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence, type Variants } from 'framer-motion'
import {
  CheckCircle2, XCircle, Clock, UserPlus, CreditCard,
  RotateCcw, Truck, RefreshCw, ListFilter, ChevronRight, Search,
  AlertTriangle, X, ChevronDown, ChevronUp,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import api from '@/lib/api'
import { cn, formatCurrency, timeAgo, formatDateTime } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'
import { useDeepLinkParam, useDeepLinkHighlightState } from '@/hooks/useDeepLinkHighlight'

// ─── Types ────────────────────────────────────────────────────
type ApprovalType = 'NEW_CUSTOMER' | 'CREDIT_BILL' | 'SALES_RETURN' | 'PURCHASE_RETURN'
type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED'
type TypeKey = ApprovalType | 'all'
type StatusKey = ApprovalStatus | 'all'

interface ApprovalRequest {
  id: string
  type: ApprovalType
  status: ApprovalStatus
  requestedAt: string
  reviewedAt?: string
  reviewNote?: string
  refId?: string
  payload: Record<string, any>
  requestedBy: { id: string; name: string; role: string }
  reviewedBy?: { id: string; name: string }
}

// ─── Config ───────────────────────────────────────────────────
const TYPE_FOLDERS: { key: TypeKey; label: string; icon: typeof ListFilter; accent: string }[] = [
  { key: 'all',             label: 'All',             icon: ListFilter, accent: 'text-foreground' },
  { key: 'NEW_CUSTOMER',    label: 'New Customer',    icon: UserPlus,   accent: 'text-blue-600 dark:text-blue-400' },
  { key: 'CREDIT_BILL',     label: 'Credit Bill',     icon: CreditCard, accent: 'text-amber-600 dark:text-amber-400' },
  { key: 'SALES_RETURN',    label: 'Sales Return',    icon: RotateCcw,  accent: 'text-rose-600 dark:text-rose-400' },
  { key: 'PURCHASE_RETURN', label: 'Purchase Return', icon: Truck,      accent: 'text-purple-600 dark:text-purple-400' },
]

const typeConfig: Record<ApprovalType, { label: string; icon: typeof UserPlus; tone: string; border: string }> = {
  NEW_CUSTOMER:    { label: 'New Customer',    icon: UserPlus,   tone: 'text-blue-600 dark:text-blue-400 bg-blue-500/10',     border: 'border-l-blue-500' },
  CREDIT_BILL:     { label: 'Credit Bill',     icon: CreditCard, tone: 'text-amber-600 dark:text-amber-400 bg-amber-500/10',  border: 'border-l-amber-500' },
  SALES_RETURN:    { label: 'Sales Return',    icon: RotateCcw,  tone: 'text-rose-600 dark:text-rose-400 bg-rose-500/10',     border: 'border-l-rose-500' },
  PURCHASE_RETURN: { label: 'Purchase Return', icon: Truck,      tone: 'text-purple-600 dark:text-purple-400 bg-purple-500/10', border: 'border-l-purple-500' },
}

const STATUS_FILTERS: { key: StatusKey; label: string }[] = [
  { key: 'all',      label: 'All' },
  { key: 'PENDING',  label: 'Pending' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'REJECTED', label: 'Rejected' },
]

// One-line per-type summary. Full payload renders in the side detail panel.
function inlineSummary(req: ApprovalRequest): string {
  const p = req.payload || {}
  switch (req.type) {
    case 'NEW_CUSTOMER':
      return [p.name, p.phone].filter(Boolean).join(' · ')
    case 'CREDIT_BILL':
      return [p.customerName, p.invoiceNumber, p.grandTotal != null && formatCurrency(p.grandTotal)]
        .filter(Boolean).join(' · ')
    case 'SALES_RETURN':
      return [p.customerName, p.totalAmount != null && formatCurrency(p.totalAmount), p.reason]
        .filter(Boolean).join(' · ')
    case 'PURCHASE_RETURN':
      return [p.supplierName, p.totalAmount != null && formatCurrency(p.totalAmount), p.reason]
        .filter(Boolean).join(' · ')
  }
}

function searchHaystack(req: ApprovalRequest): string {
  const p = req.payload || {}
  return [
    req.requestedBy?.name,
    p.name, p.customerName, p.supplierName,
    p.phone, p.invoiceNumber, p.reason,
    p.grandTotal, p.totalAmount,
  ].filter(Boolean).map(String).join(' ').toLowerCase()
}

// ─── Date grouping (same buckets as Notifications) ────────────
function groupByDate(items: ApprovalRequest[]): { label: string; items: ApprovalRequest[] }[] {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterdayStart = new Date(todayStart.getTime() - 86_400_000)
  const weekStart = new Date(todayStart.getTime() - 6 * 86_400_000)
  const buckets: Record<string, ApprovalRequest[]> = {
    'Just now': [], 'Earlier today': [], 'Yesterday': [], 'This week': [], 'Older': [],
  }
  for (const r of items) {
    const ts = new Date(r.requestedAt)
    const diffMin = (now.getTime() - ts.getTime()) / 60_000
    if (diffMin < 5) buckets['Just now'].push(r)
    else if (ts >= todayStart) buckets['Earlier today'].push(r)
    else if (ts >= yesterdayStart) buckets['Yesterday'].push(r)
    else if (ts >= weekStart) buckets['This week'].push(r)
    else buckets['Older'].push(r)
  }
  return Object.entries(buckets)
    .filter(([, list]) => list.length > 0)
    .map(([label, list]) => ({ label, items: list }))
}

const STALE_MS = 24 * 60 * 60 * 1000
const isStale = (req: ApprovalRequest) =>
  req.status === 'PENDING' && Date.now() - new Date(req.requestedAt).getTime() > STALE_MS

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.04 } },
}
const itemVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] as const } },
}

// ─── Page ─────────────────────────────────────────────────────
export default function ApprovalsPage() {
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'ADMIN'

  const [allRequests, setAllRequests] = useState<ApprovalRequest[]>([])
  const [loading, setLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState<StatusKey>('PENDING')
  const [typeFolder, setTypeFolder] = useState<TypeKey>('all')
  const [searchQuery, setSearchQuery] = useState('')

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [actionDialog, setActionDialog] = useState<{ id: string; action: 'approve' | 'reject' } | null>(null)
  const [reviewNote, setReviewNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/approvals')
      setAllRequests(res.data)
    } catch {
      toast.error('Failed to load approval requests')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Sidebar counts — reflect current status filter so badges show actionable totals
  const typeCounts = useMemo(() => {
    const base = statusFilter === 'all' ? allRequests : allRequests.filter(r => r.status === statusFilter)
    const counts: Record<TypeKey, number> = {
      all: base.length, NEW_CUSTOMER: 0, CREDIT_BILL: 0, SALES_RETURN: 0, PURCHASE_RETURN: 0,
    }
    for (const r of base) counts[r.type]++
    return counts
  }, [allRequests, statusFilter])

  // Toolbar status counts — reflect current type folder
  const statusCounts = useMemo(() => {
    const base = typeFolder === 'all' ? allRequests : allRequests.filter(r => r.type === typeFolder)
    return {
      all: base.length,
      PENDING: base.filter(r => r.status === 'PENDING').length,
      APPROVED: base.filter(r => r.status === 'APPROVED').length,
      REJECTED: base.filter(r => r.status === 'REJECTED').length,
    } as Record<StatusKey, number>
  }, [allRequests, typeFolder])

  const filtered = useMemo(() => {
    let rows = allRequests
    if (statusFilter !== 'all') rows = rows.filter(r => r.status === statusFilter)
    if (typeFolder !== 'all') rows = rows.filter(r => r.type === typeFolder)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      rows = rows.filter(r => searchHaystack(r).includes(q))
    }
    return [...rows].sort((a, b) =>
      new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime(),
    )
  }, [allRequests, statusFilter, typeFolder, searchQuery])

  const grouped = useMemo(() => groupByDate(filtered), [filtered])

  // Selected request — looked up from the canonical list so it stays fresh after refetch
  const selectedReq = useMemo(
    () => (selectedId ? allRequests.find(r => r.id === selectedId) ?? null : null),
    [selectedId, allRequests],
  )

  // Deep-link from notifications: open filters wide so the row is visible,
  // and pop the side panel for the target request.
  const { targetId: deepLinkRequestId, clearParam: clearDeepLink } =
    useDeepLinkParam('requestId', '/admin/approvals')
  const { highlightId: highlightRequestId, highlight } = useDeepLinkHighlightState()
  useEffect(() => {
    if (!deepLinkRequestId || allRequests.length === 0) return
    const req = allRequests.find(r => r.id === deepLinkRequestId)
    if (!req) return
    setStatusFilter('all')
    setTypeFolder('all')
    setSearchQuery('')
    setSelectedId(deepLinkRequestId)
    highlight(deepLinkRequestId)
    clearDeepLink()
  }, [deepLinkRequestId, allRequests, highlight, clearDeepLink])

  const handleAction = async () => {
    if (!actionDialog) return
    if (actionDialog.action === 'reject' && !reviewNote.trim()) {
      toast.error('A rejection reason is required')
      return
    }
    setSubmitting(true)
    try {
      await api.post(`/approvals/${actionDialog.id}/${actionDialog.action}`, {
        reviewNote: reviewNote.trim() || undefined,
      })
      toast.success(actionDialog.action === 'approve' ? 'Request approved successfully' : 'Request rejected')
      setActionDialog(null)
      setReviewNote('')
      load()
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Action failed')
    } finally {
      setSubmitting(false)
    }
  }

  const activeFolderLabel = TYPE_FOLDERS.find(f => f.key === typeFolder)?.label ?? 'All'
  const totalCount = allRequests.length
  const pendingCount = useMemo(() => allRequests.filter(r => r.status === 'PENDING').length, [allRequests])
  const staleCount = useMemo(() => allRequests.filter(isStale).length, [allRequests])

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible">
      <motion.div variants={itemVariants}>
        <Card className="overflow-hidden p-0">
          {/* ── Slim toolbar ── */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-3 py-2">
            <p className="text-xs text-muted-foreground">
              {pendingCount > 0 ? (
                <>
                  <span className="font-semibold text-foreground">{pendingCount}</span> pending · {totalCount} total
                  {staleCount > 0 && (
                    <> · <span className="font-semibold text-amber-600 dark:text-amber-400">{staleCount} stale</span></>
                  )}
                </>
              ) : (
                <>No pending requests · {totalCount} total</>
              )}
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
                    {statusCounts[s.key] > 0 && (
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
              <Button
                variant="ghost"
                size="icon-sm"
                className="h-7 w-7"
                onClick={load}
                disabled={loading}
                aria-label="Refresh"
              >
                <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
              </Button>
            </div>
          </div>

          <div className="flex h-[calc(100vh-160px)] min-h-100 flex-col lg:flex-row">
            {/* ── Sidebar: type folders ── */}
            <aside className={cn(
              'shrink-0 border-b border-border/60 lg:w-56 lg:border-b-0 lg:border-r',
              // On small screens, when the detail panel is open, hide the type sidebar
              // to give the panel the full viewport width.
              selectedReq && 'hidden lg:block',
            )}>
              <div className="px-3 py-3">
                <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  Types
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
                            layoutId="approvals-sidebar-active"
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
              {/* List column */}
              <div className={cn(
                'flex min-w-0 flex-1 flex-col',
                // On mobile when the side panel is open, hide the list entirely
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
                    {filtered.length} in {activeFolderLabel}
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
                        <CheckCircle2 className="h-5 w-5 text-muted-foreground/50" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">No requests found</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {searchQuery || statusFilter !== 'PENDING' || typeFolder !== 'all'
                            ? 'Try clearing the filters'
                            : 'Nothing pending — you’re all caught up'}
                        </p>
                      </div>
                    </div>
                  ) : (
                    grouped.map(group => (
                      <div key={group.label}>
                        <div className="sticky top-0 z-10 bg-background/95 px-3 py-1 backdrop-blur-sm">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                            {group.label}
                          </p>
                        </div>
                        {group.items.map(req => (
                          <ApprovalRow
                            key={req.id}
                            req={req}
                            isAdmin={isAdmin}
                            isSelected={selectedId === req.id}
                            highlighted={highlightRequestId === req.id}
                            onSelect={setSelectedId}
                            onApprove={id => { setActionDialog({ id, action: 'approve' }); setReviewNote('') }}
                            onReject={id => { setActionDialog({ id, action: 'reject' }); setReviewNote('') }}
                          />
                        ))}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Detail panel — opens on row click, replaces the old detail page navigation */}
              <AnimatePresence initial={false}>
                {selectedReq && (
                  <motion.aside
                    key="detail-panel"
                    initial={{ x: 24, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: 24, opacity: 0 }}
                    transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                    className="flex min-w-0 flex-1 flex-col bg-background lg:w-md lg:flex-none lg:border-l lg:border-border/60 xl:w-lg"
                  >
                    <ApprovalDetailPanel
                      req={selectedReq}
                      isAdmin={isAdmin}
                      onClose={() => setSelectedId(null)}
                      onApprove={() => { setActionDialog({ id: selectedReq.id, action: 'approve' }); setReviewNote('') }}
                      onReject={() => { setActionDialog({ id: selectedReq.id, action: 'reject' }); setReviewNote('') }}
                    />
                  </motion.aside>
                )}
              </AnimatePresence>
            </section>
          </div>
        </Card>
      </motion.div>

      {/* ── Approve / Reject dialog ── */}
      <Dialog open={!!actionDialog} onOpenChange={open => { if (!open) { setActionDialog(null); setReviewNote('') } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{actionDialog?.action === 'approve' ? 'Approve Request' : 'Reject Request'}</DialogTitle>
            <DialogDescription>
              {actionDialog?.action === 'approve'
                ? 'This will execute the action immediately.'
                : 'The requestor will be notified with your reason.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {actionDialog?.action === 'reject' ? 'Rejection Reason *' : 'Note (optional)'}
            </Label>
            <Input
              placeholder={actionDialog?.action === 'reject' ? 'Enter reason for rejection…' : 'Optional note…'}
              value={reviewNote}
              onChange={e => setReviewNote(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setActionDialog(null); setReviewNote('') }}>Cancel</Button>
            <Button
              onClick={handleAction}
              disabled={submitting}
              className={actionDialog?.action === 'approve'
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : 'bg-rose-600 hover:bg-rose-700 text-white'}
            >
              {submitting ? 'Processing…' : actionDialog?.action === 'approve' ? 'Approve' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}

// ─── Row ──────────────────────────────────────────────────────
// Click anywhere (except action buttons) → opens the side detail panel.
// Hover reveals Approve/Reject (admin + pending only).
function ApprovalRow({
  req, isAdmin, isSelected, highlighted, onSelect, onApprove, onReject,
}: {
  req: ApprovalRequest
  isAdmin: boolean
  isSelected: boolean
  highlighted: boolean
  onSelect: (id: string) => void
  onApprove: (id: string) => void
  onReject: (id: string) => void
}) {
  const cfg = typeConfig[req.type]
  const Icon = cfg.icon
  const isPending = req.status === 'PENDING'
  const stale = isStale(req)
  const summary = inlineSummary(req)
  const statusVariant = isPending ? 'warning' : req.status === 'APPROVED' ? 'success' : 'destructive'
  const showActions = isAdmin && isPending

  return (
    <div
      id={`requestId-${req.id}`}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(req.id)}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect(req.id)
        }
      }}
      className={cn(
        'group flex cursor-pointer items-start gap-2.5 border-b border-border/30 px-3 py-2.5 transition-colors hover:bg-muted/40',
        isSelected && 'bg-accent/60',
        highlighted && 'bg-emerald-500/10 ring-1 ring-emerald-500/40',
        !isPending && 'opacity-80',
      )}
    >
      <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', cfg.tone)}>
        <Icon className="h-3.5 w-3.5" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className={cn(
            'truncate text-[13px] leading-tight',
            isPending ? 'font-semibold text-foreground' : 'font-normal text-foreground/80',
          )}>
            {cfg.label}
          </p>
          <Badge variant={statusVariant} size="sm">{req.status}</Badge>
          {stale && (
            <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-amber-500/15 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-2.5 w-2.5" /> Stale
            </span>
          )}
        </div>
        {summary && <p className="mt-0.5 truncate text-xs text-muted-foreground">{summary}</p>}
        <p className="mt-1 text-[10px] text-muted-foreground/60">
          {req.requestedBy?.name ?? 'Unknown'} · {timeAgo(req.requestedAt)}
          {req.reviewedBy && req.reviewedAt && (
            <> · {req.status === 'APPROVED' ? 'Approved' : 'Rejected'} by {req.reviewedBy.name} · {timeAgo(req.reviewedAt)}</>
          )}
        </p>
        {req.reviewNote && !isPending && (
          <p className="mt-1 truncate text-[11px] italic text-muted-foreground/80">
            Note: {req.reviewNote}
          </p>
        )}
      </div>

      {showActions && (
        // stopPropagation so clicking an action doesn't also open the side panel
        <div
          onClick={e => e.stopPropagation()}
          className="flex shrink-0 items-center gap-0.5 self-center opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
        >
          <Button
            size="icon-sm"
            variant="ghost"
            className="h-7 w-7 text-rose-600 hover:bg-rose-500/10 hover:text-rose-600 dark:text-rose-400"
            onClick={() => onReject(req.id)}
            aria-label="Reject"
            title="Reject"
          >
            <XCircle className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            className="h-7 w-7 text-emerald-700 hover:bg-emerald-500/10 hover:text-emerald-700 dark:text-emerald-400"
            onClick={() => onApprove(req.id)}
            aria-label="Approve"
            title="Approve"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      <ChevronRight
        className={cn(
          'mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground/40 transition-opacity',
          showActions && 'group-hover:opacity-0',
        )}
        aria-hidden
      />
    </div>
  )
}

// ─── Side detail panel ────────────────────────────────────────
// Replaces the standalone /admin/approvals/detail page for in-list review.
// Uses the canonical request object passed from the list — no extra fetch.
function ApprovalDetailPanel({
  req, isAdmin, onClose, onApprove, onReject,
}: {
  req: ApprovalRequest
  isAdmin: boolean
  onClose: () => void
  onApprove: () => void
  onReject: () => void
}) {
  const cfg = typeConfig[req.type]
  const Icon = cfg.icon
  const isPending = req.status === 'PENDING'
  const statusVariant = isPending ? 'warning' : req.status === 'APPROVED' ? 'success' : 'destructive'
  const [showRawPayload, setShowRawPayload] = useState(false)

  return (
    <>
      {/* Header */}
      <div className={cn('flex items-start gap-3 border-b border-border/60 border-l-[3px] px-4 py-3', cfg.border)}>
        <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', cfg.tone)}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold">{cfg.label}</p>
            <Badge variant={statusVariant} size="sm">{req.status}</Badge>
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Requested by <span className="font-medium text-foreground">{req.requestedBy?.name ?? 'Unknown'}</span>
            {' · '}{formatDateTime(req.requestedAt)}
          </p>
        </div>
        <Button size="icon-sm" variant="ghost" className="h-7 w-7" onClick={onClose} aria-label="Close panel">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Body */}
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {/* Reviewer trail */}
        {req.reviewedBy && (
          <div className="rounded-lg border border-border/40 bg-muted/20 p-3 text-xs">
            <p className="font-medium">
              {req.status === 'APPROVED' ? 'Approved' : 'Rejected'} by {req.reviewedBy.name}
              {req.reviewedAt && <> · {formatDateTime(req.reviewedAt)}</>}
            </p>
            {req.reviewNote && (
              <p className="mt-1.5 text-muted-foreground">
                <span className="font-medium text-foreground">Note:</span> {req.reviewNote}
              </p>
            )}
          </div>
        )}

        {/* Payload */}
        <div className="rounded-lg border border-border/40 bg-muted/20 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            Request Details
          </p>
          <div className="mt-3">
            <PayloadDetail type={req.type} payload={req.payload} />
          </div>
          <button
            type="button"
            onClick={() => setShowRawPayload(v => !v)}
            className="mt-3 flex items-center gap-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
          >
            {showRawPayload ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {showRawPayload ? 'Hide' : 'Show'} raw payload
          </button>
          {showRawPayload && (
            <pre className="mt-2 max-h-64 overflow-x-auto rounded-md bg-muted/50 p-2 text-[10px]">
              {JSON.stringify(req.payload, null, 2)}
            </pre>
          )}
        </div>

        {/* Status hint when no longer actionable */}
        {!isPending && (
          <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-muted/10 px-3 py-2 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            This request is no longer pending.
          </div>
        )}
      </div>

      {/* Footer actions */}
      {isAdmin && isPending && (
        <div className="flex items-center justify-end gap-2 border-t border-border/60 bg-muted/10 px-4 py-3">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 border-rose-300 text-rose-600 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-400 dark:hover:bg-rose-950/30"
            onClick={onReject}
          >
            <XCircle className="h-3.5 w-3.5" /> Reject
          </Button>
          <Button
            size="sm"
            className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
            onClick={onApprove}
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> Approve
          </Button>
        </div>
      )}
    </>
  )
}

// Two-column grid used inside the detail panel
function PayloadDetail({ type, payload }: { type: ApprovalType; payload: Record<string, any> }) {
  const Row = ({ label, value, mono, accent }: { label: string; value: React.ReactNode; mono?: boolean; accent?: string }) => (
    <>
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('font-medium', mono && 'font-mono', accent)}>{value}</span>
    </>
  )

  switch (type) {
    case 'NEW_CUSTOMER':
      return (
        <div className="grid grid-cols-[110px_1fr] gap-y-1.5 text-xs">
          <Row label="Name" value={payload.name} />
          <Row label="Phone" value={payload.phone} />
          {payload.email && <Row label="Email" value={payload.email} />}
          {payload.type && <Row label="Type" value={payload.type} />}
          {payload.creditLimit > 0 && <Row label="Credit Limit" value={formatCurrency(payload.creditLimit)} />}
        </div>
      )
    case 'CREDIT_BILL':
      return (
        <div className="grid grid-cols-[110px_1fr] gap-y-1.5 text-xs">
          <Row label="Customer" value={payload.customerName} />
          <Row label="Invoice #" value={payload.invoiceNumber} mono />
          <Row label="Amount" value={formatCurrency(payload.grandTotal)} />
          <Row label="Existing Credits" value={`${payload.pendingCount} unpaid`} accent="text-amber-600 dark:text-amber-400" />
        </div>
      )
    case 'SALES_RETURN':
      return (
        <div className="grid grid-cols-[110px_1fr] gap-y-1.5 text-xs">
          <Row label="Customer" value={payload.customerName} />
          <Row label="Invoice #" value={payload.invoiceNumber} mono />
          <Row label="Return Amount" value={formatCurrency(payload.totalAmount)} />
          <Row label="Settlement" value={payload.settlementMode} />
          <Row label="Reason" value={payload.reason} />
          {payload.items?.length > 0 && (
            <Row label="Items" value={`${payload.items.length} item${payload.items.length !== 1 ? 's' : ''}`} />
          )}
        </div>
      )
    case 'PURCHASE_RETURN':
      return (
        <div className="grid grid-cols-[110px_1fr] gap-y-1.5 text-xs">
          <Row label="Supplier" value={payload.supplierName} />
          <Row label="Return Amount" value={formatCurrency(payload.totalAmount)} />
          <Row label="Reason" value={payload.reason} />
          {payload.items?.length > 0 && (
            <Row label="Items" value={`${payload.items.length} item${payload.items.length !== 1 ? 's' : ''}`} />
          )}
        </div>
      )
  }
}
