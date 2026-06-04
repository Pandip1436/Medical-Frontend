import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowLeft, FileX2, CheckCircle2, XCircle, Clock,
  UserPlus, CreditCard, RotateCcw, Truck, ChevronDown, ChevronUp,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { goBack as routerGoBack, useRoute } from '@/lib/router'
import api from '@/lib/api'
import { cn, formatCurrency, formatDateTime } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'
import { isAdminish } from '@/types'

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

const TYPE_CONFIG: Record<ApprovalType, {
  label: string; icon: typeof UserPlus; color: string; bg: string; border: string
}> = {
  NEW_CUSTOMER:   { label: 'New Customer',   icon: UserPlus,   color: 'text-blue-600 dark:text-blue-400',    bg: 'bg-blue-500/10',   border: 'border-l-blue-500' },
  CREDIT_BILL:    { label: 'Credit Bill',    icon: CreditCard, color: 'text-amber-600 dark:text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-l-amber-500' },
  SALES_RETURN:   { label: 'Sales Return',   icon: RotateCcw,  color: 'text-rose-600 dark:text-rose-400',    bg: 'bg-rose-500/10',   border: 'border-l-rose-500' },
  PURCHASE_RETURN:{ label: 'Purchase Return',icon: Truck,      color: 'text-purple-600 dark:text-purple-400',bg: 'bg-purple-500/10', border: 'border-l-purple-500' },
}

// ─── Approval Detail Page ─────────────────────────────────────
// Destination for Approval notifications. Single-request focused view with
// approve/reject controls (admin only), reviewer audit, and raw payload.
export default function ApprovalDetailPage() {
  const { search } = useRoute()
  // Accept either `?id=` (new) or `?requestId=` (legacy).
  const params = new URLSearchParams(search)
  const id = params.get('id') ?? params.get('requestId')
  const isAdmin = useAuthStore((s) => isAdminish(s.user))

  const [req, setReq] = useState<ApprovalRequest | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionDialog, setActionDialog] = useState<'approve' | 'reject' | null>(null)
  const [reviewNote, setReviewNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showRawPayload, setShowRawPayload] = useState(false)

  const fetchApproval = useCallback(async (approvalId: string) => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await api.get(`/approvals/${approvalId}`)
      setReq(res.data)
    } catch (err: any) {
      const msg = err.response?.status === 404 ? 'Approval request not found' : 'Failed to load request'
      setError(msg)
      toast.error(msg)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (id) fetchApproval(id)
    else { setIsLoading(false); setError('No request id provided') }
  }, [id, fetchApproval])

  const handleAction = async () => {
    if (!req || !actionDialog) return
    setSubmitting(true)
    try {
      await api.post(`/approvals/${req.id}/${actionDialog}`, { reviewNote: reviewNote || undefined })
      toast.success(actionDialog === 'approve' ? 'Request approved' : 'Request rejected')
      setActionDialog(null)
      setReviewNote('')
      await fetchApproval(req.id)
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Action failed')
    } finally {
      setSubmitting(false)
    }
  }

  const goBack = () => routerGoBack('/admin/approvals')

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <Button variant="ghost" size="sm" className="gap-1.5 -ml-2" onClick={goBack}>
        <ArrowLeft className="h-3.5 w-3.5" /> Back
      </Button>

      <Card>
        {isLoading ? (
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-xs text-muted-foreground">Loading request…</p>
          </CardContent>
        ) : error || !req ? (
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/60">
              <FileX2 className="h-5 w-5 text-muted-foreground/50" />
            </div>
            <div>
              <p className="text-sm font-medium">{error ?? 'Request unavailable'}</p>
              <p className="mt-1 text-xs text-muted-foreground">It may have been deleted or you don&apos;t have access.</p>
            </div>
            <Button size="sm" variant="outline" onClick={goBack}>Back to approvals</Button>
          </CardContent>
        ) : (
          <ApprovalDetailBody
            req={req}
            isAdmin={isAdmin}
            showRawPayload={showRawPayload}
            onToggleRaw={() => setShowRawPayload(v => !v)}
            onApprove={() => setActionDialog('approve')}
            onReject={() => setActionDialog('reject')}
          />
        )}
      </Card>

      {/* Approve / Reject dialog */}
      <Dialog open={!!actionDialog} onOpenChange={(open) => { if (!open) { setActionDialog(null); setReviewNote('') } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {actionDialog === 'approve' ? 'Approve request' : 'Reject request'}
            </DialogTitle>
            <DialogDescription>
              {actionDialog === 'approve'
                ? 'Approving will execute the requested action.'
                : 'Optional: leave a reason for the requestor.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="review-note" className="text-xs">Review note {actionDialog === 'reject' ? '(recommended)' : '(optional)'}</Label>
            <Input
              id="review-note"
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
              placeholder="e.g. Customer credit history verified"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setActionDialog(null); setReviewNote('') }} disabled={submitting}>
              Cancel
            </Button>
            <Button
              variant={actionDialog === 'reject' ? 'destructive' : 'default'}
              onClick={handleAction}
              disabled={submitting}
            >
              {submitting ? 'Saving…' : actionDialog === 'approve' ? 'Approve' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}

function ApprovalDetailBody({
  req, isAdmin, showRawPayload, onToggleRaw, onApprove, onReject,
}: {
  req: ApprovalRequest
  isAdmin: boolean
  showRawPayload: boolean
  onToggleRaw: () => void
  onApprove: () => void
  onReject: () => void
}) {
  const cfg = TYPE_CONFIG[req.type]
  const Icon = cfg.icon
  const isPending = req.status === 'PENDING'

  return (
    <>
      <CardHeader className="border-b border-border/40">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={cn('flex h-11 w-11 items-center justify-center rounded-xl', cfg.bg)}>
              <Icon className={cn('h-5 w-5', cfg.color)} />
            </div>
            <div>
              <p className="text-base font-semibold leading-snug">{cfg.label}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Requested by <span className="font-medium text-foreground">{req.requestedBy.name}</span>
                {' · '}{formatDateTime(req.requestedAt)}
              </p>
            </div>
          </div>
          <Badge
            variant={isPending ? 'warning' : req.status === 'APPROVED' ? 'success' : 'destructive'}
            size="sm"
          >
            {req.status}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="pt-6 space-y-5">
        {/* Reviewer trail */}
        {req.reviewedBy && (
          <div className="rounded-xl border border-border/40 bg-muted/20 p-3 text-xs">
            <p className="font-medium">
              {req.status === 'APPROVED' ? 'Approved' : 'Rejected'} by {req.reviewedBy.name}
              {' · '}{req.reviewedAt ? formatDateTime(req.reviewedAt) : ''}
            </p>
            {req.reviewNote && (
              <p className="mt-1.5 text-muted-foreground">
                <span className="font-medium text-foreground">Note:</span> {req.reviewNote}
              </p>
            )}
          </div>
        )}

        {/* Payload summary */}
        <div className="rounded-xl border border-border/40 bg-muted/20 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Request Details</p>
          <div className="mt-3">
            <PayloadSummary type={req.type} payload={req.payload} />
          </div>
          <button
            type="button"
            onClick={onToggleRaw}
            className="mt-3 flex items-center gap-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
          >
            {showRawPayload ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {showRawPayload ? 'Hide' : 'Show'} raw payload
          </button>
          {showRawPayload && (
            <pre className="mt-2 max-h-64 overflow-x-auto rounded-lg bg-muted/50 p-3 text-[10px]">
              {JSON.stringify(req.payload, null, 2)}
            </pre>
          )}
        </div>

        {/* Actions */}
        {isAdmin && isPending && (
          <div className="flex flex-wrap gap-2 border-t border-border/40 pt-4">
            <Button
              size="sm"
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={onApprove}
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 border-rose-300 text-rose-600 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-400 dark:hover:bg-rose-950/30"
              onClick={onReject}
            >
              <XCircle className="h-3.5 w-3.5" /> Reject
            </Button>
          </div>
        )}
        {!isPending && (
          <div className="flex items-center gap-2 border-t border-border/40 pt-4 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            This request is no longer pending.
          </div>
        )}
      </CardContent>
    </>
  )
}

function PayloadSummary({ type, payload }: { type: ApprovalType; payload: Record<string, any> }) {
  switch (type) {
    case 'NEW_CUSTOMER':
      return (
        <div className="grid grid-cols-1 gap-y-1.5 text-sm sm:grid-cols-[140px_1fr]">
          <span className="text-muted-foreground">Name</span><span className="font-medium">{payload.name}</span>
          <span className="text-muted-foreground">Phone</span><span className="font-medium">{payload.phone}</span>
          {payload.email && <><span className="text-muted-foreground">Email</span><span>{payload.email}</span></>}
          {payload.type && <><span className="text-muted-foreground">Type</span><span>{payload.type}</span></>}
          {payload.creditLimit > 0 && <><span className="text-muted-foreground">Credit Limit</span><span>{formatCurrency(payload.creditLimit)}</span></>}
        </div>
      )
    case 'CREDIT_BILL':
      return (
        <div className="grid grid-cols-1 gap-y-1.5 text-sm sm:grid-cols-[140px_1fr]">
          <span className="text-muted-foreground">Customer</span><span className="font-medium">{payload.customerName}</span>
          <span className="text-muted-foreground">Invoice #</span><span className="font-mono">{payload.invoiceNumber}</span>
          <span className="text-muted-foreground">Amount</span><span className="font-semibold">{formatCurrency(payload.grandTotal)}</span>
          <span className="text-muted-foreground">Existing Credits</span><span className="font-semibold text-amber-600">{payload.pendingCount} unpaid</span>
        </div>
      )
    case 'SALES_RETURN':
      return (
        <div className="grid grid-cols-1 gap-y-1.5 text-sm sm:grid-cols-[140px_1fr]">
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
        <div className="grid grid-cols-1 gap-y-1.5 text-sm sm:grid-cols-[140px_1fr]">
          <span className="text-muted-foreground">Supplier</span><span className="font-medium">{payload.supplierName}</span>
          <span className="text-muted-foreground">Return Amount</span><span className="font-semibold">{formatCurrency(payload.totalAmount)}</span>
          <span className="text-muted-foreground">Reason</span><span>{payload.reason}</span>
          {payload.items?.length > 0 && <><span className="text-muted-foreground">Items</span><span>{payload.items.length} item{payload.items.length !== 1 ? 's' : ''}</span></>}
        </div>
      )
  }
}
