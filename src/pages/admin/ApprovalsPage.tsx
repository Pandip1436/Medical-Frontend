import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  CheckCircle2, XCircle, Clock, UserPlus, CreditCard,
  RotateCcw, Truck, ChevronDown, ChevronUp, RefreshCw,
  ListFilter,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import api from '@/lib/api'
import { navigate } from '@/lib/router'
import { cn, formatCurrency } from '@/lib/utils'
import { DataTablePagination } from '@/components/shared/DataTablePagination'
import { useAuthStore } from '@/stores/authStore'
import { useDeepLinkParam, useDeepLinkHighlightState } from '@/hooks/useDeepLinkHighlight'

// ─── Types ────────────────────────────────────────────────────
type ApprovalType = 'NEW_CUSTOMER' | 'CREDIT_BILL' | 'SALES_RETURN' | 'PURCHASE_RETURN'
type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

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
const TYPE_CONFIG: Record<ApprovalType, {
  label: string; icon: typeof UserPlus; color: string; bg: string; border: string; activeBorder: string
}> = {
  NEW_CUSTOMER:   { label: 'New Customer',   icon: UserPlus,  color: 'text-blue-600 dark:text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-l-blue-500',   activeBorder: 'border-blue-500' },
  CREDIT_BILL:    { label: 'Credit Bill',    icon: CreditCard, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/10',  border: 'border-l-amber-500',  activeBorder: 'border-amber-500' },
  SALES_RETURN:   { label: 'Sales Return',   icon: RotateCcw, color: 'text-rose-600 dark:text-rose-400',   bg: 'bg-rose-500/10',   border: 'border-l-rose-500',   activeBorder: 'border-rose-500' },
  PURCHASE_RETURN:{ label: 'Purchase Return',icon: Truck,     color: 'text-purple-600 dark:text-purple-400',bg: 'bg-purple-500/10', border: 'border-l-purple-500', activeBorder: 'border-purple-500' },
}

const STATUS_TABS: { key: ApprovalStatus | 'all'; label: string; icon: typeof Clock; color: string; activeColor: string }[] = [
  { key: 'all',      label: 'All',      icon: ListFilter,   color: 'text-muted-foreground',                        activeColor: 'text-primary border-primary' },
  { key: 'PENDING',  label: 'Pending',  icon: Clock,        color: 'text-amber-600 dark:text-amber-400',           activeColor: 'text-amber-600 border-amber-500' },
  { key: 'APPROVED', label: 'Approved', icon: CheckCircle2, color: 'text-emerald-600 dark:text-emerald-400',       activeColor: 'text-emerald-600 border-emerald-500' },
  { key: 'REJECTED', label: 'Rejected', icon: XCircle,      color: 'text-rose-600 dark:text-rose-400',             activeColor: 'text-rose-600 border-rose-500' },
]

const TYPE_FILTER_TABS: { key: ApprovalType | 'all'; label: string }[] = [
  { key: 'all',             label: 'All Types' },
  { key: 'NEW_CUSTOMER',    label: 'New Customer' },
  { key: 'CREDIT_BILL',     label: 'Credit Bill' },
  { key: 'SALES_RETURN',    label: 'Sales Return' },
  { key: 'PURCHASE_RETURN', label: 'Purchase Return' },
]

// ─── Payload summary ──────────────────────────────────────────
function PayloadSummary({ type, payload }: { type: ApprovalType; payload: Record<string, any> }) {
  const [expanded, setExpanded] = useState(false)

  const summary = () => {
    switch (type) {
      case 'NEW_CUSTOMER':
        return (
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
            <span className="text-muted-foreground">Name</span><span className="font-medium">{payload.name}</span>
            <span className="text-muted-foreground">Phone</span><span className="font-medium">{payload.phone}</span>
            {payload.email && <><span className="text-muted-foreground">Email</span><span>{payload.email}</span></>}
            {payload.type && <><span className="text-muted-foreground">Type</span><span>{payload.type}</span></>}
            {payload.creditLimit > 0 && <><span className="text-muted-foreground">Credit Limit</span><span>{formatCurrency(payload.creditLimit)}</span></>}
          </div>
        )
      case 'CREDIT_BILL':
        return (
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
            <span className="text-muted-foreground">Customer</span><span className="font-medium">{payload.customerName}</span>
            <span className="text-muted-foreground">Invoice #</span><span className="font-mono">{payload.invoiceNumber}</span>
            <span className="text-muted-foreground">Amount</span><span className="font-semibold">{formatCurrency(payload.grandTotal)}</span>
            <span className="text-muted-foreground">Existing Credits</span><span className="font-semibold text-amber-600">{payload.pendingCount} unpaid</span>
          </div>
        )
      case 'SALES_RETURN':
        return (
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
            <span className="text-muted-foreground">Customer</span><span className="font-medium">{payload.customerName}</span>
            <span className="text-muted-foreground">Invoice #</span><span className="font-mono">{payload.invoiceNumber}</span>
            <span className="text-muted-foreground">Return Amount</span><span className="font-semibold">{formatCurrency(payload.totalAmount)}</span>
            <span className="text-muted-foreground">Settlement</span><span>{payload.settlementMode}</span>
            <span className="text-muted-foreground">Reason</span><span>{payload.reason}</span>
            {payload.items?.length > 0 && <><span className="text-muted-foreground">Items</span><span>{payload.items.length} item{payload.items.length !== 1 ? 's' : ''}</span></>}
          </div>
        )
      case 'PURCHASE_RETURN':
        return (
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
            <span className="text-muted-foreground">Supplier</span><span className="font-medium">{payload.supplierName}</span>
            <span className="text-muted-foreground">Return Amount</span><span className="font-semibold">{formatCurrency(payload.totalAmount)}</span>
            <span className="text-muted-foreground">Reason</span><span>{payload.reason}</span>
            {payload.items?.length > 0 && <><span className="text-muted-foreground">Items</span><span>{payload.items.length} item{payload.items.length !== 1 ? 's' : ''}</span></>}
          </div>
        )
    }
  }

  return (
    <div className="space-y-2">
      {summary()}
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
      >
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {expanded ? 'Hide' : 'Show'} raw payload
      </button>
      {expanded && (
        <pre className="rounded-lg bg-muted/50 p-3 text-[10px] overflow-x-auto max-h-48">
          {JSON.stringify(payload, null, 2)}
        </pre>
      )}
    </div>
  )
}

// ─── Request card ─────────────────────────────────────────────
function RequestCard({
  req, isAdmin,
  onApprove, onReject,
}: {
  req: ApprovalRequest
  isAdmin: boolean
  onApprove: (id: string) => void
  onReject: (id: string) => void
}) {
  const cfg = TYPE_CONFIG[req.type]
  const Icon = cfg.icon
  const isPending = req.status === 'PENDING'

  return (
    <Card className={cn('border-l-[3px] transition-shadow hover:shadow-md', cfg.border)}>
      <CardContent className="p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3 min-w-0">
            <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl mt-0.5', cfg.bg)}>
              <Icon className={cn('h-4 w-4', cfg.color)} />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">{cfg.label}</span>
                <Badge
                  variant={isPending ? 'warning' : req.status === 'APPROVED' ? 'success' : 'destructive'}
                  size="sm"
                >
                  {req.status}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Requested by <span className="font-medium text-foreground">{req.requestedBy.name}</span>
                {' · '}{new Date(req.requestedAt).toLocaleString('en-IN')}
              </p>
              {req.reviewedBy && (
                <p className="text-xs text-muted-foreground">
                  {req.status === 'APPROVED' ? 'Approved' : 'Rejected'} by{' '}
                  <span className="font-medium text-foreground">{req.reviewedBy.name}</span>
                  {' · '}{req.reviewedAt ? new Date(req.reviewedAt).toLocaleString('en-IN') : ''}
                </p>
              )}
              {req.reviewNote && (
                <p className="text-xs rounded-lg bg-muted/50 px-3 py-1.5 border border-border/40">
                  <span className="font-medium">Note:</span> {req.reviewNote}
                </p>
              )}
            </div>
          </div>
          {isAdmin && isPending && (
            // stopPropagation so clicking the inline action doesn't also trigger
            // the row's navigate-to-detail.
            <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 border-rose-300 text-rose-600 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-400 dark:hover:bg-rose-950/30"
                onClick={() => onReject(req.id)}
              >
                <XCircle className="h-3.5 w-3.5" /> Reject
              </Button>
              <Button
                size="sm"
                className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => onApprove(req.id)}
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> Approve
              </Button>
            </div>
          )}
        </div>
        <div className="mt-4 rounded-xl border border-border/40 bg-muted/20 p-3">
          <PayloadSummary type={req.type} payload={req.payload} />
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Main Page ────────────────────────────────────────────────
export default function ApprovalsPage() {
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'ADMIN'

  const [allRequests, setAllRequests] = useState<ApprovalRequest[]>([])
  const [loading, setLoading] = useState(false)
  const [statusTab, setStatusTab] = useState<ApprovalStatus | 'all'>('PENDING')
  const [typeTab, setTypeTab] = useState<ApprovalType | 'all'>('all')

  const [actionDialog, setActionDialog] = useState<{ id: string; action: 'approve' | 'reject' } | null>(null)
  const [reviewNote, setReviewNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const PAGE_SIZE = 10

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

  // Client-side filtering — no re-fetch on tab change
  const filtered = useMemo(() => {
    let rows = allRequests
    if (statusTab !== 'all') rows = rows.filter(r => r.status === statusTab)
    if (typeTab !== 'all') rows = rows.filter(r => r.type === typeTab)
    return rows
  }, [allRequests, statusTab, typeTab])

  useEffect(() => {
    setCurrentPage(1)
  }, [statusTab, typeTab])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  // Deep-link from notifications: locate the request across all status/type tabs
  // and jump to the page containing it.
  const { targetId: deepLinkRequestId, clearParam: clearDeepLink } =
    useDeepLinkParam('requestId', '/admin/approvals')
  const { highlightId: highlightRequestId, highlight } = useDeepLinkHighlightState()
  useEffect(() => {
    if (!deepLinkRequestId || allRequests.length === 0) return
    const req = allRequests.find((r) => r.id === deepLinkRequestId)
    if (!req) return
    setStatusTab('all')
    setTypeTab('all')
    // Position to the page containing the request within an unfiltered list.
    const idx = allRequests.findIndex((r) => r.id === deepLinkRequestId)
    setCurrentPage(Math.floor(idx / PAGE_SIZE) + 1)
    highlight(deepLinkRequestId)
    setTimeout(() => {
      document.getElementById(`requestId-${deepLinkRequestId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 100)
    clearDeepLink()
  }, [deepLinkRequestId, allRequests, highlight, clearDeepLink])

  // Counts per status tab (respecting type filter)
  const counts = useMemo(() => {
    const base = typeTab !== 'all' ? allRequests.filter(r => r.type === typeTab) : allRequests
    return {
      all: base.length,
      PENDING: base.filter(r => r.status === 'PENDING').length,
      APPROVED: base.filter(r => r.status === 'APPROVED').length,
      REJECTED: base.filter(r => r.status === 'REJECTED').length,
    }
  }, [allRequests, typeTab])

  const handleAction = async () => {
    if (!actionDialog) return
    if (actionDialog.action === 'reject' && !reviewNote.trim()) {
      toast.error('A rejection reason is required')
      return
    }
    setSubmitting(true)
    try {
      await api.post(`/approvals/${actionDialog.id}/${actionDialog.action}`, { reviewNote: reviewNote.trim() || undefined })
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="space-y-5"
    >
      {/* Header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Approvals</h1>
          <p className="text-sm text-muted-foreground">
            {isAdmin ? 'Review and act on pending requests from your team' : 'Track the status of your submitted requests'}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5 self-start">
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} /> Refresh
        </Button>
      </div>

      {/* Main card with tabs */}
      <Card className="overflow-hidden">

        {/* ── Status tabs (primary) ── */}
        <div className="flex overflow-x-auto border-b border-border/60 px-1 shrink-0">
          {STATUS_TABS.map(tab => {
            const Icon = tab.icon
            const count = counts[tab.key as keyof typeof counts]
            const isActive = statusTab === tab.key
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setStatusTab(tab.key as ApprovalStatus | 'all')}
                className={cn(
                  'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                  isActive
                    ? `border-current ${tab.activeColor}`
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
                {count > 0 && (
                  <span className={cn(
                    'flex h-4.5 min-w-4.5 items-center justify-center rounded-full px-1 text-[10px] font-bold',
                    isActive ? 'bg-current/15' : 'bg-muted text-muted-foreground'
                  )}>
                    {count > 99 ? '99+' : count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* ── Type filter (secondary) ── */}
        <div className="flex overflow-x-auto gap-1.5 border-b border-border/40 bg-muted/20 px-4 py-2.5">
          {TYPE_FILTER_TABS.map(tab => {
            const isActive = typeTab === tab.key
            const cfg = tab.key !== 'all' ? TYPE_CONFIG[tab.key as ApprovalType] : null
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setTypeTab(tab.key as ApprovalType | 'all')}
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors',
                  isActive
                    ? cfg
                      ? `${cfg.bg} ${cfg.color} ring-1 ring-current/20`
                      : 'bg-primary/10 text-primary ring-1 ring-primary/20'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                )}
              >
                {cfg && <cfg.icon className="h-3 w-3" />}
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* ── List ── */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 rounded-full border-b-2 border-primary animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/50">
              <CheckCircle2 className="h-7 w-7 text-muted-foreground/50" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">No requests found</p>
            <p className="text-xs text-muted-foreground/60">
              {statusTab !== 'all' || typeTab !== 'all' ? 'Try changing the filters above' : 'Nothing here yet'}
            </p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-border/30 overflow-y-auto max-h-150">
              {paginated.map(req => (
                <div
                  key={req.id}
                  id={`requestId-${req.id}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/admin/approvals/detail?id=${req.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      navigate(`/admin/approvals/detail?id=${req.id}`)
                    }
                  }}
                  className={cn(
                    'cursor-pointer p-4 sm:p-5 transition-colors hover:bg-muted/30',
                    highlightRequestId === req.id && 'bg-emerald-500/10 ring-1 ring-emerald-500/40'
                  )}
                >
                  <RequestCard
                    req={req}
                    isAdmin={isAdmin}
                    onApprove={id => { setActionDialog({ id, action: 'approve' }); setReviewNote('') }}
                    onReject={id => { setActionDialog({ id, action: 'reject' }); setReviewNote('') }}
                  />
                </div>
              ))}
            </div>
            <DataTablePagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              totalItems={filtered.length}
              itemsPerPage={PAGE_SIZE}
              className="border-t border-border/40 px-4"
            />
          </>
        )}
      </Card>

      {/* Approve / Reject dialog */}
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
                : 'bg-rose-600 hover:bg-rose-700 text-white'
              }
            >
              {submitting ? 'Processing…' : actionDialog?.action === 'approve' ? 'Approve' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
