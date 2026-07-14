import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence, type Variants } from 'framer-motion'
import {
  CheckCircle2, XCircle, Clock, UserPlus, CreditCard,
  RotateCcw, Truck, RefreshCw, ListFilter, ChevronRight, Search,
  AlertTriangle, ArrowLeft, Phone, SlidersHorizontal, ArrowUpDown,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Label } from '@/components/ui/label'
import api from '@/lib/api'
import { navigate, goBack } from '@/lib/router'
import { cn, formatCurrency, timeAgo, formatDateTime } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'
import { useMasterDataStore } from '@/stores/masterDataStore'
import { isAdminish } from '@/types'
import { useDeepLinkParam, useDeepLinkHighlightState } from '@/hooks/useDeepLinkHighlight'

// ─── Types ────────────────────────────────────────────────────
type ApprovalType = 'NEW_CUSTOMER' | 'CREDIT_BILL' | 'SALES_RETURN' | 'PURCHASE_RETURN' | 'INVENTORY_ADJUSTMENT'
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
  { key: 'INVENTORY_ADJUSTMENT', label: 'Stock Adjustment', icon: SlidersHorizontal, accent: 'text-cyan-600 dark:text-cyan-400' },
]

const typeConfig: Record<ApprovalType, { label: string; icon: typeof UserPlus; tone: string; border: string }> = {
  NEW_CUSTOMER:    { label: 'New Customer',    icon: UserPlus,   tone: 'text-blue-600 dark:text-blue-400 bg-blue-500/10',     border: 'border-l-blue-500' },
  CREDIT_BILL:     { label: 'Credit Bill',     icon: CreditCard, tone: 'text-amber-600 dark:text-amber-400 bg-amber-500/10',  border: 'border-l-amber-500' },
  SALES_RETURN:    { label: 'Sales Return',    icon: RotateCcw,  tone: 'text-rose-600 dark:text-rose-400 bg-rose-500/10',     border: 'border-l-rose-500' },
  PURCHASE_RETURN: { label: 'Purchase Return', icon: Truck,      tone: 'text-purple-600 dark:text-purple-400 bg-purple-500/10', border: 'border-l-purple-500' },
  INVENTORY_ADJUSTMENT: { label: 'Stock Adjustment', icon: SlidersHorizontal, tone: 'text-cyan-600 dark:text-cyan-400 bg-cyan-500/10', border: 'border-l-cyan-500' },
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
    case 'INVENTORY_ADJUSTMENT': {
      const n = Array.isArray(p.items) ? p.items.length : 0
      return [`${n} batch${n === 1 ? '' : 'es'}`, p.requestedByName].filter(Boolean).join(' · ')
    }
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
  const isAdmin = isAdminish(user)

  const [allRequests, setAllRequests] = useState<ApprovalRequest[]>([])
  const [loading, setLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState<StatusKey>('PENDING')
  const [typeFolder, setTypeFolder] = useState<TypeKey>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortDir, setSortDir] = useState<'newest' | 'oldest'>('newest')

  const [selectedId, setSelectedId] = useState<string | null>(null)
  // True when the open detail panel was reached via a notification deep-link, so
  // the panel's Back arrow steps back to the notification folder (one history
  // entry) instead of just closing the panel in place.
  const [fromDeepLink, setFromDeepLink] = useState(false)
  // Manual, in-page selection from the list — Back should close the panel.
  const selectRequest = useCallback((id: string | null) => {
    setFromDeepLink(false)
    setSelectedId(id)
  }, [])
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

  // Customers — used by the detail panel to resolve a request's customer id +
  // phone (for the clickable name / phone) when the payload predates them.
  const fetchMasterData = useMasterDataStore(s => s.fetchMasterData)
  useEffect(() => { fetchMasterData() }, [fetchMasterData])

  // Sidebar counts — reflect current status filter so badges show actionable totals
  const typeCounts = useMemo(() => {
    const base = statusFilter === 'all' ? allRequests : allRequests.filter(r => r.status === statusFilter)
    const counts: Record<TypeKey, number> = {
      all: base.length, NEW_CUSTOMER: 0, CREDIT_BILL: 0, SALES_RETURN: 0, PURCHASE_RETURN: 0, INVENTORY_ADJUSTMENT: 0,
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
    // Newest-request-first by default; "oldest" reverses (within each date group).
    const sorted = [...rows].sort((a, b) =>
      new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime(),
    )
    return sortDir === 'oldest' ? sorted.reverse() : sorted
  }, [allRequests, statusFilter, typeFolder, searchQuery, sortDir])

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
    setFromDeepLink(true)
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
  // Caption describing both filters so the list count never reads as a bare "0 in All"
  // when the default PENDING status filter is active and pending is empty.
  const statusCaptionMap: Record<StatusKey, string> = {
    all: 'requests',
    PENDING: 'pending',
    APPROVED: 'approved',
    REJECTED: 'rejected',
  }
  const statusCaption = statusCaptionMap[statusFilter]
  const listCaption = typeFolder === 'all'
    ? statusCaption
    : `${statusCaption} · ${activeFolderLabel}`
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
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center rounded-md border border-border/60 bg-background p-0.5">
                {STATUS_FILTERS.map(s => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setStatusFilter(s.key)}
                    className={cn(
                      'whitespace-nowrap rounded px-2 py-1 text-[11px] font-medium transition-colors',
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

          {/* Below xl the app shows the fixed bottom tab bar, so the shell must
              shrink by its height (≈5rem) or the detail-panel footer renders
              underneath it and the Approve/Reject buttons aren't reachable. */}
          <div className="flex h-[calc(100dvh-15rem)] min-h-100 flex-col lg:flex-row xl:h-[calc(100vh-160px)]">
            {/* ── Sidebar: type folders ── */}
            <aside className={cn(
              'shrink-0 border-b border-border/60 lg:w-56 lg:border-b-0 lg:border-r',
              // On small screens, when the detail panel is open, hide the type sidebar
              // to give the panel the full viewport width.
              selectedReq && 'hidden lg:block',
            )}>
              <div className="px-3 py-2 lg:py-3">
                <p className="hidden px-2 pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 lg:block">
                  Types
                </p>
                {/* Mobile: horizontal scrollable chip strip so the type rail
                    doesn't consume vertical space. Desktop: vertical nav. */}
                <nav className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:block lg:space-y-0.5 lg:overflow-visible lg:pb-0">
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
                          'group relative flex w-auto shrink-0 items-center gap-2.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-left text-sm transition-colors lg:w-full lg:shrink',
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
                        <span className="flex-1 truncate text-[13px]">{cat.label}</span>
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
                // Hidden on all sizes when a request is open so the detail goes full-width
                // (matches the Reminders master-detail layout).
                selectedReq && 'hidden',
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
                  {/* Sort by request date. One-click toggle (newest ⇄ oldest)
                      — simpler than a two-option picker. */}
                  <button
                    type="button"
                    onClick={() => setSortDir(sortDir === 'newest' ? 'oldest' : 'newest')}
                    title="Click to switch newest / oldest"
                    aria-label={`Sort ${sortDir === 'newest' ? 'newest' : 'oldest'} first — click to switch`}
                    className="flex shrink-0 items-center gap-1.5 rounded-md border border-border/60 bg-background px-2 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                  >
                    <ArrowUpDown className="h-3 w-3 shrink-0 text-muted-foreground/60" />
                    {sortDir === 'newest' ? 'Newest' : 'Oldest'}
                  </button>
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
                    filtered.map(req => (
                      <ApprovalRow
                        key={req.id}
                        req={req}
                        isAdmin={isAdmin}
                        isSelected={selectedId === req.id}
                        highlighted={highlightRequestId === req.id}
                        onSelect={selectRequest}
                        onApprove={id => { setActionDialog({ id, action: 'approve' }); setReviewNote('') }}
                        onReject={id => { setActionDialog({ id, action: 'reject' }); setReviewNote('') }}
                      />
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
                    className="flex min-w-0 flex-1 flex-col bg-background"
                  >
                    <ApprovalDetailPanel
                      req={selectedReq}
                      isAdmin={isAdmin}
                      onClose={() => fromDeepLink ? goBack('/notifications') : setSelectedId(null)}
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
        'group flex cursor-pointer items-start gap-3 border-b border-border/30 px-4 py-4 transition-colors hover:bg-muted/40',
        isSelected && 'bg-accent/60',
        highlighted && 'bg-emerald-500/10 ring-1 ring-emerald-500/40',
        !isPending && 'opacity-80',
      )}
    >
      <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', cfg.tone)}>
        <Icon className="h-5 w-5" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className={cn(
            'truncate text-base leading-tight',
            isPending ? 'font-semibold text-foreground' : 'font-normal text-foreground/80',
          )}>
            {cfg.label}
          </p>
          <Badge variant={statusVariant} size="sm">{req.status}</Badge>
          {stale && (
            <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-amber-500/15 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-3 w-3" /> Stale
            </span>
          )}
        </div>
        {summary && <p className="mt-1 truncate text-sm text-muted-foreground">{summary}</p>}
        <p className="mt-1.5 text-xs text-muted-foreground/60">
          {req.requestedBy?.name ?? 'Unknown'} · {timeAgo(req.requestedAt)}
          {req.reviewedBy && req.reviewedAt && (
            <> · {req.status === 'APPROVED' ? 'Approved' : 'Rejected'} by {req.reviewedBy.name} · {timeAgo(req.reviewedAt)}</>
          )}
        </p>
        {req.reviewNote && !isPending && (
          <p className="mt-1.5 truncate text-xs italic text-muted-foreground/80">
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
  // Resolve the request's customer (id + phone) so the detail can link to the
  // customer page and show their number. New requests carry these in the
  // payload; older ones fall back to a unique name match from master data.
  const customers = useMasterDataStore(s => s.customers)
  const { customerId, customerPhone } = resolveCustomerRef(req.payload, customers)

  return (
    <>
      {/* Header — back arrow returns to the list (full-width master-detail). */}
      <div className={cn('flex items-start gap-3 border-b border-l-[3px] border-border/60 px-4 py-3', cfg.border)}>
        <Button
          size="icon-sm"
          variant="ghost"
          className="-ml-1 h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
          onClick={onClose}
          aria-label="Back to list"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', cfg.tone)}>
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
      </div>

      {/* Body */}
      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        {/* Reviewer trail */}
        {req.reviewedBy && (
          <div className="rounded-xl border border-border/40 bg-muted/20 p-4 text-sm">
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

        {/* Request details — full field set, no raw JSON */}
        <div className="rounded-xl border border-border/40 bg-muted/20 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
            Request Details
          </p>
          <div className="mt-4">
            <PayloadDetail
              type={req.type}
              payload={req.payload}
              customerId={customerId}
              customerPhone={customerPhone}
            />
          </div>
        </div>

        {/* Line items — the full set of products/quantities involved so the
            reviewer can verify exactly what they're approving. Stock
            adjustments use their own card (current → new qty); everything else
            (returns, credit bills) shares the line-item + totals table. */}
        {Array.isArray(req.payload.items) && req.payload.items.length > 0 && (
          req.type === 'INVENTORY_ADJUSTMENT'
            ? <AdjustmentItemsCard items={req.payload.items} />
            : <ReturnItemsCard type={req.type} items={req.payload.items} payload={req.payload} />
        )}

        {/* Status hint when no longer actionable */}
        {!isPending && (
          <div className="flex items-center gap-2 rounded-xl border border-border/40 bg-muted/10 px-4 py-2.5 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            This request is no longer pending.
          </div>
        )}
      </div>

      {/* Footer actions */}
      {isAdmin && isPending && (
        <div className="flex items-center justify-end gap-2 border-t border-border/60 bg-muted/10 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <Button
            size="sm"
            variant="outline"
            className="flex-1 gap-1.5 border-rose-300 text-rose-600 hover:bg-rose-50 sm:flex-none dark:border-rose-800 dark:text-rose-400 dark:hover:bg-rose-950/30"
            onClick={onReject}
          >
            <XCircle className="h-3.5 w-3.5" /> Reject
          </Button>
          <Button
            size="sm"
            className="flex-1 gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700 sm:flex-none"
            onClick={onApprove}
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> Approve
          </Button>
        </div>
      )}
    </>
  )
}

// Resolve a request's customer id + phone. New requests carry these in the
// payload; for older ones we fall back to a UNIQUE name match from master data
// (never guess when two customers share a name).
function resolveCustomerRef(
  payload: Record<string, any>,
  customers: { id: string; name: string; phone?: string | null }[],
): { customerId: string | null; customerPhone: string | null } {
  if (payload?.customerId) {
    return { customerId: payload.customerId, customerPhone: payload.customerPhone ?? null }
  }
  const name = (payload?.customerName || '').trim().toLowerCase()
  if (name) {
    const matches = customers.filter(c => (c.name || '').trim().toLowerCase() === name)
    if (matches.length === 1) {
      return { customerId: matches[0].id, customerPhone: payload?.customerPhone ?? matches[0].phone ?? null }
    }
  }
  return { customerId: null, customerPhone: payload?.customerPhone ?? null }
}

// A labelled value block. Arranged in a responsive grid so the details fill
// the full-width detail area instead of hugging the top-left corner.
function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={cn(wide && 'sm:col-span-2 lg:col-span-3')}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">{label}</p>
      <div className="mt-1 text-sm font-medium text-foreground">{children}</div>
    </div>
  )
}

// Customer value — a blue link to the customer detail page (with phone below)
// when we know the id; plain text otherwise (e.g. a not-yet-created customer).
function CustomerField({
  name, customerId, phone, label = 'Customer',
}: { name: string; customerId: string | null; phone: string | null; label?: string }) {
  return (
    <Field label={label}>
      {customerId ? (
        <button
          type="button"
          onClick={() => navigate(`/customers/detail?customerId=${customerId}`)}
          className="text-left font-semibold text-blue-600 hover:underline dark:text-blue-400"
        >
          {name}
        </button>
      ) : (
        <span className="font-semibold">{name}</span>
      )}
      {phone && (
        <p className="mt-0.5 flex items-center gap-1 text-xs font-normal text-muted-foreground">
          <Phone className="h-3 w-3" /> {phone}
        </p>
      )}
    </Field>
  )
}

// Per-type field set rendered inside the Request Details card.
function PayloadDetail({
  type, payload, customerId, customerPhone,
}: {
  type: ApprovalType
  payload: Record<string, any>
  customerId: string | null
  customerPhone: string | null
}) {
  const gridCls = 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'

  switch (type) {
    case 'NEW_CUSTOMER':
      // The customer doesn't exist yet — this request creates it, so no link.
      return (
        <div className={gridCls}>
          <Field label="Name">{payload.name}</Field>
          <Field label="Phone">{payload.phone || '—'}</Field>
          {payload.email && <Field label="Email">{payload.email}</Field>}
          {payload.type && <Field label="Type">{payload.type}</Field>}
          {payload.creditLimit > 0 && <Field label="Credit Limit">{formatCurrency(payload.creditLimit)}</Field>}
        </div>
      )
    case 'CREDIT_BILL':
      return (
        <div className={gridCls}>
          <CustomerField name={payload.customerName} customerId={customerId} phone={customerPhone} />
          <Field label="Invoice #"><span className="font-mono">{payload.invoiceNumber}</span></Field>
          <Field label="Amount">{formatCurrency(payload.grandTotal)}</Field>
          <Field label="Existing Credits">
            <span className="text-amber-600 dark:text-amber-400">{payload.pendingCount} unpaid</span>
          </Field>
        </div>
      )
    case 'SALES_RETURN':
      return (
        <div className={gridCls}>
          <CustomerField name={payload.customerName} customerId={customerId} phone={customerPhone} />
          <Field label="Invoice #"><span className="font-mono">{payload.invoiceNumber}</span></Field>
          <Field label="Settlement">{payload.settlementMode ?? '—'}</Field>
          <Field label="Return Reason" wide>{payload.reason || '—'}</Field>
        </div>
      )
    case 'PURCHASE_RETURN':
      return (
        <div className={gridCls}>
          <Field label="Supplier"><span className="font-semibold">{payload.supplierName}</span></Field>
          <Field label="Return Reason" wide>{payload.reason || '—'}</Field>
        </div>
      )
    case 'INVENTORY_ADJUSTMENT':
      return (
        <div className={gridCls}>
          <Field label="Requested By">{payload.requestedByName || '—'}</Field>
          <Field label="Batches">
            {Array.isArray(payload.items) ? payload.items.length : 0} batch
            {(Array.isArray(payload.items) ? payload.items.length : 0) === 1 ? '' : 'es'}
          </Field>
        </div>
      )
  }
}

// The products being returned — full line-item table + tax/total breakdown so
// the reviewer sees exactly what's coming back before approving.
function ReturnItemsCard({
  type, items, payload,
}: {
  type: ApprovalType
  items: any[]
  payload: Record<string, any>
}) {
  const title = type === 'CREDIT_BILL' ? 'Billed Products'
    : type === 'PURCHASE_RETURN' ? 'Items to Return'
    : 'Products to Return'
  // Credit bills carry `grandTotal`; returns carry `totalAmount`.
  const grandTotal = payload.totalAmount ?? payload.grandTotal
  const totalLabel = type === 'CREDIT_BILL' ? 'Invoice Total' : 'Return Total'
  return (
    <div className="overflow-hidden rounded-xl border border-border/40">
      <div className="flex items-center justify-between border-b border-border/40 bg-muted/20 px-4 py-2.5">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">{title}</p>
        <p className="text-xs text-muted-foreground">{items.length} item{items.length !== 1 ? 's' : ''}</p>
      </div>
      {/* Desktop: full table. Mobile: stacked cards (below) so the 7 columns
          don't overflow a phone width. */}
      <div className="hidden md:block">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8">#</TableHead>
            <TableHead>Product</TableHead>
            <TableHead>Batch</TableHead>
            <TableHead className="text-right">Qty</TableHead>
            <TableHead className="text-right">Rate</TableHead>
            <TableHead className="text-right">GST%</TableHead>
            <TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((it, i) => (
            <TableRow key={i}>
              <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
              <TableCell className="text-sm font-medium">
                {it.productId ? (
                  <button
                    type="button"
                    onClick={() => navigate(`/inventory/product-history?productId=${it.productId}`)}
                    className="text-left text-blue-600 hover:underline dark:text-blue-400"
                  >
                    {it.productName ?? '—'}
                  </button>
                ) : (
                  it.productName ?? '—'
                )}
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">{it.batchNumber ?? '—'}</TableCell>
              <TableCell className="text-right text-sm font-semibold">{it.returnedQty ?? it.quantity ?? '—'}</TableCell>
              <TableCell className="text-right text-sm">{it.rate != null ? formatCurrency(it.rate) : '—'}</TableCell>
              <TableCell className="text-right text-xs text-muted-foreground">
                {it.gstPercent != null ? `${Number(it.gstPercent).toFixed(0)}%` : '—'}
              </TableCell>
              <TableCell className="text-right text-sm font-medium">{it.amount != null ? formatCurrency(it.amount) : '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      </div>

      <div className="divide-y divide-border/40 md:hidden">
        {items.map((it, i) => (
          <div key={i} className="px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              {it.productId ? (
                <button
                  type="button"
                  onClick={() => navigate(`/inventory/product-history?productId=${it.productId}`)}
                  className="text-left text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
                >
                  {it.productName ?? '—'}
                </button>
              ) : (
                <span className="text-sm font-medium">{it.productName ?? '—'}</span>
              )}
              <span className="shrink-0 text-sm font-semibold">
                {it.amount != null ? formatCurrency(it.amount) : '—'}
              </span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Batch</p>
                <p className="font-mono text-xs text-muted-foreground">{it.batchNumber ?? '—'}</p>
              </div>
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Qty</p>
                <p className="text-sm font-semibold">{it.returnedQty ?? it.quantity ?? '—'}</p>
              </div>
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Rate</p>
                <p className="text-sm">{it.rate != null ? formatCurrency(it.rate) : '—'}</p>
              </div>
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">GST%</p>
                <p className="text-xs text-muted-foreground">
                  {it.gstPercent != null ? `${Number(it.gstPercent).toFixed(0)}%` : '—'}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
      {grandTotal != null && (
        <div className="ml-auto w-full max-w-xs space-y-1 border-t border-border/40 px-4 py-3 text-sm">
          {payload.subtotal != null && <TotalRow label="Subtotal" value={payload.subtotal} />}
          {Number(payload.cgst) > 0 && <TotalRow label="CGST" value={payload.cgst} />}
          {Number(payload.sgst) > 0 && <TotalRow label="SGST" value={payload.sgst} />}
          {Number(payload.igst) > 0 && <TotalRow label="IGST" value={payload.igst} />}
          <div className="flex justify-between border-t border-border/40 pt-2 font-semibold">
            <span>{totalLabel}</span>
            <span className="font-mono">{formatCurrency(grandTotal)}</span>
          </div>
        </div>
      )}
    </div>
  )
}

function TotalRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between text-muted-foreground">
      <span>{label}</span>
      <span className="font-mono">{formatCurrency(value)}</span>
    </div>
  )
}

// The batches being adjusted — full detail (current → new qty, delta, reason)
// so the approver can verify each change before approving the stock movement.
function AdjustmentItemsCard({ items }: { items: any[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border/40">
      <div className="flex items-center justify-between border-b border-border/40 bg-muted/20 px-4 py-2.5">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Batches to Adjust</p>
        <p className="text-xs text-muted-foreground">{items.length} batch{items.length !== 1 ? 'es' : ''}</p>
      </div>
      {/* Desktop: full table. Mobile: stacked cards (below). */}
      <div className="hidden md:block">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8">#</TableHead>
            <TableHead>Product</TableHead>
            <TableHead>Batch</TableHead>
            <TableHead className="text-right">Current</TableHead>
            <TableHead className="text-right">New</TableHead>
            <TableHead className="text-right">Δ</TableHead>
            <TableHead>Reason</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((it, i) => {
            const prev = it.previousQty
            const next = it.adjustedQty
            const diff = (prev != null && next != null) ? Number(next) - Number(prev) : null
            return (
              <TableRow key={i}>
                <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                <TableCell className="text-sm font-medium">
                  {it.productId ? (
                    <button
                      type="button"
                      onClick={() => navigate(`/inventory/product-history?productId=${it.productId}`)}
                      className="text-left text-blue-600 hover:underline dark:text-blue-400"
                    >
                      {it.productName ?? '—'}
                    </button>
                  ) : (
                    it.productName ?? '—'
                  )}
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{it.batchNumber ?? '—'}</TableCell>
                <TableCell className="text-right text-sm font-mono">{prev ?? '—'}</TableCell>
                <TableCell className="text-right text-sm font-mono font-semibold">{next ?? '—'}</TableCell>
                <TableCell className={cn(
                  'text-right text-sm font-mono font-semibold',
                  diff != null && diff < 0 && 'text-rose-600 dark:text-rose-400',
                  diff != null && diff > 0 && 'text-emerald-600 dark:text-emerald-400',
                )}>
                  {diff == null ? '—' : diff > 0 ? `+${diff}` : diff}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {it.reason || '—'}
                  {it.notes && <span className="block text-[11px] text-muted-foreground/70">{it.notes}</span>}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      </div>

      <div className="divide-y divide-border/40 md:hidden">
        {items.map((it, i) => {
          const prev = it.previousQty
          const next = it.adjustedQty
          const diff = (prev != null && next != null) ? Number(next) - Number(prev) : null
          return (
            <div key={i} className="px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                {it.productId ? (
                  <button
                    type="button"
                    onClick={() => navigate(`/inventory/product-history?productId=${it.productId}`)}
                    className="text-left text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
                  >
                    {it.productName ?? '—'}
                  </button>
                ) : (
                  <span className="text-sm font-medium">{it.productName ?? '—'}</span>
                )}
                <span className={cn(
                  'shrink-0 font-mono text-sm font-semibold',
                  diff != null && diff < 0 && 'text-rose-600 dark:text-rose-400',
                  diff != null && diff > 0 && 'text-emerald-600 dark:text-emerald-400',
                )}>
                  {diff == null ? '—' : diff > 0 ? `+${diff}` : diff}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Batch</p>
                  <p className="font-mono text-xs text-muted-foreground">{it.batchNumber ?? '—'}</p>
                </div>
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Current</p>
                  <p className="font-mono text-sm">{prev ?? '—'}</p>
                </div>
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">New</p>
                  <p className="font-mono text-sm font-semibold">{next ?? '—'}</p>
                </div>
              </div>
              {(it.reason || it.notes) && (
                <p className="mt-2 text-xs text-muted-foreground">
                  <span className="font-semibold uppercase tracking-wider text-[9px] text-muted-foreground">Reason </span>
                  {it.reason || '—'}
                  {it.notes && <span className="block text-[11px] text-muted-foreground/70">{it.notes}</span>}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
