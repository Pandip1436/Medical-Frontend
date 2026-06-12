import { useEffect, useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, Truck, PackageCheck, Navigation, Warehouse, Bike,
  CheckCircle2, RotateCcw, MapPin, Phone, User, Package, Receipt,
  Upload, ScanLine, Loader2, Save, Search, X, ImageIcon,
  Sparkles, Clock, FileX2, ExternalLink, Trash2,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import {
  AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader,
  AlertDialogFooter, AlertDialogTitle, AlertDialogDescription,
  AlertDialogAction, AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { StatusBadge } from '@/components/shared/StatusBadge'
import api from '@/lib/api'
import { cn, formatDate, formatDateTime } from '@/lib/utils'
import { goBack as routerGoBack, useRoute, navigate } from '@/lib/router'
import { toast } from 'sonner'
import type { DeliveryTracking, DeliveryStatus } from '@/types'
import {
  COURIERS, STATUS_LABEL, displayDeliveryStatus,
  extractCourierReceipt,
} from '@/lib/courierOcr'

// ─── Per-status visual config (icon + colour) — drives the stepper, the
// timeline nodes and the status pills consistently across the page. ──────────
const STATUS_UI: Record<
  DeliveryStatus,
  { icon: typeof Truck; ring: string; text: string; soft: string }
> = {
  BOOKED:           { icon: PackageCheck, ring: 'bg-blue-500',    text: 'text-blue-600 dark:text-blue-400',       soft: 'bg-blue-500/10' },
  DISPATCHED:       { icon: Truck,        ring: 'bg-indigo-500',  text: 'text-indigo-600 dark:text-indigo-400',   soft: 'bg-indigo-500/10' },
  IN_TRANSIT:       { icon: Navigation,   ring: 'bg-violet-500',  text: 'text-violet-600 dark:text-violet-400',   soft: 'bg-violet-500/10' },
  ARRIVED_AT_HUB:   { icon: Warehouse,    ring: 'bg-sky-500',     text: 'text-sky-600 dark:text-sky-400',         soft: 'bg-sky-500/10' },
  OUT_FOR_DELIVERY: { icon: Bike,         ring: 'bg-amber-500',   text: 'text-amber-600 dark:text-amber-400',     soft: 'bg-amber-500/10' },
  DELIVERED:        { icon: CheckCircle2, ring: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400', soft: 'bg-emerald-500/10' },
  RETURNED:         { icon: RotateCcw,    ring: 'bg-rose-500',    text: 'text-rose-600 dark:text-rose-400',       soft: 'bg-rose-500/10' },
}

// The happy-path steps shown in the horizontal stepper. "Dispatched" isn't a
// distinct step here — it folds into "In Transit" (see stepperIndex). RETURNED
// is terminal and handled separately.
const STEPPER: DeliveryStatus[] = [
  'BOOKED', 'IN_TRANSIT', 'ARRIVED_AT_HUB', 'OUT_FOR_DELIVERY', 'DELIVERED',
]

// Index of a delivery status within STEPPER. DISPATCHED has no step of its own,
// so it maps onto "In Transit". RETURNED returns -1 (rendered distinctly).
function stepperIndex(status: DeliveryStatus): number {
  if (status === 'RETURNED') return -1
  const folded: DeliveryStatus = status === 'DISPATCHED' ? 'IN_TRANSIT' : status
  return STEPPER.indexOf(folded)
}

export default function DeliveryTrackingPage() {
  const { search } = useRoute()
  const params = new URLSearchParams(search)
  const id = params.get('id')
  const invoiceId = params.get('invoiceId')

  const [delivery, setDelivery] = useState<DeliveryTracking | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Courier-details form state
  const [courierName, setCourierName] = useState('')
  const [trackingId, setTrackingId] = useState('')
  const [dispatchDate, setDispatchDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [checking, setChecking] = useState(false)
  const [clearing, setClearing] = useState(false)
  // Deep link to the courier's own tracking page — shown when live tracking
  // can't run (e.g. a CAPTCHA-gated courier the scraper can't read).
  const [manualTrackUrl, setManualTrackUrl] = useState<string | null>(null)

  // OCR state
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null)
  const [receiptName, setReceiptName] = useState<string | null>(null)
  const [ocrRunning, setOcrRunning] = useState(false)
  const [ocrProgress, setOcrProgress] = useState(0)
  const [ocrText, setOcrText] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const hydrate = useCallback((d: DeliveryTracking) => {
    setDelivery(d)
    setCourierName(d.courierName ?? '')
    setTrackingId(d.trackingId ?? '')
    setDispatchDate(d.dispatchDate ? d.dispatchDate.slice(0, 10) : '')
    setReceiptName(d.receiptName ?? null)
    setOcrText(d.ocrText ?? null)
  }, [])

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      if (id) {
        const res = await api.get(`/delivery/${id}`)
        hydrate(res.data)
      } else if (invoiceId) {
        // Reached from the invoice courier toggle. Fetch the record, creating
        // it on the fly if the toggle hasn't persisted one yet.
        let res = await api.get(`/delivery/invoice/${invoiceId}`)
        if (!res.data) {
          res = await api.post('/delivery', { invoiceId })
        }
        hydrate(res.data)
      } else {
        setError('No delivery specified')
      }
    } catch (err: any) {
      const msg = err.response?.data?.message ?? 'Failed to load delivery'
      setError(typeof msg === 'string' ? msg : 'Failed to load delivery')
    } finally {
      setIsLoading(false)
    }
  }, [id, invoiceId, hydrate])

  useEffect(() => { load() }, [load])

  const goBack = () => routerGoBack('/delivery')

  // ─── Receipt upload + OCR ──────────────────────────────────────────────────
  const handleFile = async (file: File) => {
    setReceiptName(file.name)
    if (file.type.startsWith('image/')) {
      setReceiptPreview(URL.createObjectURL(file))
    } else {
      setReceiptPreview(null)
      toast.info('PDF stored. For auto-extract, upload an image of the receipt.')
      return
    }
    setOcrRunning(true)
    setOcrProgress(0)
    try {
      const result = await extractCourierReceipt(file, (p) => setOcrProgress(p))
      setOcrText(result.rawText)
      // Auto-fill only the fields we confidently detected; never clobber a
      // value the user already typed with an empty detection.
      if (result.courierName) setCourierName(result.courierName)
      if (result.trackingId) setTrackingId(result.trackingId)
      if (result.dispatchDate) setDispatchDate(result.dispatchDate)

      const found = [
        result.courierName && 'courier',
        result.trackingId && 'tracking ID',
        result.dispatchDate && 'dispatch date',
      ].filter(Boolean)
      if (found.length) {
        toast.success(`Auto-filled ${found.join(', ')} from receipt`)
      } else {
        toast.info('OCR finished — couldn’t auto-detect fields. Please enter them manually.')
      }
    } catch {
      toast.error('Could not read the receipt. Please enter details manually.')
    } finally {
      setOcrRunning(false)
    }
  }

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  // ─── Save courier details ──────────────────────────────────────────────────
  const handleSave = async () => {
    if (!delivery) return
    setSaving(true)
    try {
      const res = await api.patch(`/delivery/${delivery.id}`, {
        courierName: courierName || undefined,
        trackingId: trackingId || undefined,
        dispatchDate: dispatchDate ? new Date(dispatchDate).toISOString() : undefined,
        receiptName: receiptName || undefined,
        ocrText: ocrText || undefined,
      })
      hydrate(res.data)
      toast.success('Courier details saved')
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  // ─── Check tracking status ─────────────────────────────────────────────────
  const handleCheckStatus = async () => {
    if (!delivery) return
    if (!trackingId.trim()) {
      toast.error('Add a tracking ID first')
      return
    }
    setChecking(true)
    try {
      // Persist any unsaved tracking id before checking.
      if (trackingId !== (delivery.trackingId ?? '')) await handleSave()
      const res = await api.post(`/delivery/${delivery.id}/check-status`)
      hydrate(res.data.delivery)
      // Remember the courier's own tracking link (if any) so we can offer a
      // manual fallback button below the form.
      setManualTrackUrl(res.data.trackingUrl ?? null)
      if (res.data.liveIntegration === false) {
        if (res.data.reason === 'courier_unsupported') {
          toast.warning(
            res.data.trackingUrl
              ? `${courierName || 'This courier'} blocks automated tracking, so we can’t sync it here. Use “Track on courier website” to check the latest status.`
              : `Automated tracking isn’t available for ${courierName || 'this courier'}.`,
          )
        } else if (res.data.reason === 'lookup_failed') {
          toast.warning(
            `Couldn’t fetch this tracking ID from ${courierName || 'the courier'}. Check the courier and number are correct${res.data.trackingUrl ? ', or track it on the courier’s website.' : '.'}`,
          )
        } else {
          toast.info('Live courier sync isn’t connected. Set TRACKINGMORE_API_KEY in the backend .env and restart the server.')
        }
      } else {
        const n = res.data.newCheckpoints ?? 0
        toast.success(n > 0 ? `Synced ${n} new update${n === 1 ? '' : 's'} from carrier` : 'Tracking is up to date')
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Failed to check status')
    } finally {
      setChecking(false)
    }
  }

  // ─── Clear timeline ─────────────────────────────────────────────────────────
  const handleClearTimeline = async () => {
    if (!delivery) return
    setClearing(true)
    try {
      const res = await api.post(`/delivery/${delivery.id}/clear-timeline`)
      hydrate(res.data)
      toast.success('Timeline cleared')
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Failed to clear timeline')
    } finally {
      setClearing(false)
    }
  }


  // ─── Render ─────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <p className="text-xs text-muted-foreground">Loading delivery…</p>
      </div>
    )
  }

  if (error || !delivery) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" className="gap-1.5 -ml-2" onClick={goBack}>
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </Button>
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/60">
              <FileX2 className="h-5 w-5 text-muted-foreground/50" />
            </div>
            <p className="text-sm font-medium">{error ?? 'Delivery unavailable'}</p>
            <Button size="sm" variant="outline" onClick={goBack}>Back to deliveries</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const isReturned = delivery.status === 'RETURNED'
  const currentStep = stepperIndex(delivery.status)
  // Order the timeline as a delivery flow — oldest → newest, top to bottom
  // (Booked → … → Delivered). The system "Booked" event is pinned to the
  // genesis even when the courier toggle was enabled after the carrier's real
  // pickup, so it never sorts below later checkpoints.
  const flowRank = (status: string, occurredAt: string) =>
    status === 'BOOKED' ? -Infinity : new Date(occurredAt).getTime()
  const events = [...delivery.events].sort(
    (a, b) => flowRank(a.status, a.occurredAt) - flowRank(b.status, b.occurredAt),
  )

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-5 pb-10"
    >
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" className="gap-1.5 -ml-2" onClick={goBack}>
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => navigate(`/customers/invoices/detail?id=${delivery.invoiceId}`)}
        >
          <Receipt className="h-3.5 w-3.5" /> View Invoice
        </Button>
      </div>

      {/* ── Hero header ───────────────────────────────────────────────────── */}
      <Card className="overflow-hidden border-border/60">
        <div className="relative bg-gradient-to-br from-primary/10 via-primary/5 to-transparent px-6 pt-6 pb-5">
          <div className="absolute -right-8 -top-8 opacity-[0.07]">
            <Truck className="h-40 w-40" />
          </div>
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary shadow-sm">
                <Truck className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => navigate(`/customers/invoices/detail?id=${delivery.invoiceId}`)}
                    className="group inline-flex items-center gap-1.5 font-mono text-lg font-bold tracking-tight hover:text-primary"
                    title="Open invoice"
                  >
                    {delivery.invoiceNumber}
                    <ExternalLink className="h-3.5 w-3.5 opacity-0 transition group-hover:opacity-100" />
                  </button>
                  <StatusBadge status={displayDeliveryStatus(delivery.status)} className="px-2.5 py-0.5" />
                </div>
                <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                  <User className="h-3.5 w-3.5" /> {delivery.customerName}
                </p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1 text-right">
              {delivery.courierName && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-background/80 px-3 py-1 text-xs font-medium shadow-sm ring-1 ring-border/50">
                  <Truck className="h-3 w-3" /> {delivery.courierName}
                </span>
              )}
              {delivery.trackingId && (
                <span className="font-mono text-xs text-muted-foreground">#{delivery.trackingId}</span>
              )}
              {delivery.deliveredAt && (
                <span className="text-xs text-emerald-600 dark:text-emerald-400">
                  Delivered {formatDateTime(delivery.deliveredAt)}
                </span>
              )}
            </div>
          </div>

          {/* Horizontal stepper */}
          {isReturned ? (
            <div className="relative mt-6 flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50/80 px-4 py-3 dark:border-rose-900/40 dark:bg-rose-950/20">
              <RotateCcw className="h-5 w-5 text-rose-500" />
              <div>
                <p className="text-sm font-semibold text-rose-700 dark:text-rose-400">Shipment Returned</p>
                <p className="text-xs text-rose-600/80 dark:text-rose-400/70">This parcel was returned to origin.</p>
              </div>
            </div>
          ) : (
            <div className="relative mt-7 flex items-center">
              {STEPPER.map((s, i) => {
                const cfg = STATUS_UI[s]
                const Icon = cfg.icon
                const done = i <= currentStep
                const isCurrent = i === currentStep
                return (
                  <div key={s} className="flex flex-1 items-center last:flex-none">
                    <div className="flex flex-col items-center gap-1.5">
                      <motion.div
                        initial={false}
                        animate={{ scale: isCurrent ? 1.1 : 1 }}
                        className={cn(
                          'flex h-9 w-9 items-center justify-center rounded-full ring-2 transition-colors',
                          done
                            ? `${cfg.ring} text-white ring-transparent shadow-sm`
                            : 'bg-background text-muted-foreground/40 ring-border',
                          isCurrent && 'ring-4 ring-primary/20',
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </motion.div>
                      <span className={cn(
                        'hidden text-[10px] font-medium sm:block',
                        done ? cfg.text : 'text-muted-foreground/50',
                      )}>
                        {STATUS_LABEL[s]}
                      </span>
                    </div>
                    {i < STEPPER.length - 1 && (
                      <div className="relative mx-1 h-0.5 flex-1 rounded bg-border">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: i < currentStep ? '100%' : '0%' }}
                          transition={{ duration: 0.4, delay: i * 0.05 }}
                          className="absolute inset-y-0 left-0 rounded bg-primary"
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* ── Left: customer + courier details ──────────────────────────────── */}
        <div className="space-y-5 lg:col-span-2">
          {/* Shipment & customer */}
          <Card>
            <CardHeader className="border-b border-border/40 py-3">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Package className="h-4 w-4 text-muted-foreground" /> Shipment & Customer
              </p>
            </CardHeader>
            <CardContent className="grid gap-4 pt-4 sm:grid-cols-2">
              <InfoRow icon={User} label="Customer" value={delivery.customerName} />
              <InfoRow icon={Phone} label="Mobile" value={delivery.mobileNumber ?? '—'} />
              <InfoRow icon={Receipt} label="Invoice" value={delivery.invoiceNumber} mono />
              <InfoRow icon={MapPin} label="Delivery Address" value={delivery.deliveryAddress ?? '—'} />
              {delivery.orderSummary && (
                <div className="sm:col-span-2">
                  <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Package className="h-3.5 w-3.5" /> Order Details
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {delivery.orderSummary.split(', ').map((item, idx) => (
                      <span key={idx} className="rounded-md bg-muted px-2 py-0.5 text-xs">{item}</span>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Courier details form */}
          <Card>
            <CardHeader className="border-b border-border/40 py-3">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Truck className="h-4 w-4 text-muted-foreground" /> Courier Details
              </p>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Courier Name</Label>
                  <Select value={courierName || undefined} onValueChange={setCourierName}>
                    <SelectTrigger><SelectValue placeholder="Select courier" /></SelectTrigger>
                    <SelectContent>
                      {COURIERS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      {courierName && !COURIERS.includes(courierName as any) && (
                        <SelectItem value={courierName}>{courierName}</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="trackingId">Tracking ID</Label>
                  <Input
                    id="trackingId"
                    value={trackingId}
                    onChange={(e) => setTrackingId(e.target.value.toUpperCase())}
                    placeholder="e.g. IXM510357808"
                    className="font-mono"
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button onClick={handleSave} disabled={saving} className="gap-1.5">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save Details
                </Button>
                <Button variant="outline" onClick={handleCheckStatus} disabled={checking} className="gap-1.5">
                  {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  Check Tracking Status
                </Button>
                {manualTrackUrl && (
                  <Button
                    variant="ghost"
                    onClick={() => window.open(manualTrackUrl, '_blank', 'noopener')}
                    className="gap-1.5 text-primary"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Track on courier website
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Timeline */}
          <Card>
            <CardHeader className="border-b border-border/40 py-3">
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <Clock className="h-4 w-4 text-muted-foreground" /> Delivery Timeline
                </p>
                {events.length > 0 && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-rose-600" disabled={clearing}>
                        {clearing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        Clear
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Clear delivery timeline?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This removes all tracking updates and resets the shipment to a fresh
                          “Booked” state. You can rebuild it with Check Tracking Status. This
                          can’t be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={handleClearTimeline}
                          className="bg-rose-600 text-white hover:bg-rose-700"
                        >
                          Clear timeline
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-5">

              {/* Events */}
              {events.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No tracking updates yet.</p>
              ) : (
                <ol className="relative space-y-0">
                  <AnimatePresence initial={false}>
                    {events.map((ev, idx) => {
                      // Timeline shows the actual carrier checkpoint status —
                      // including "Dispatched" — unfolded, for full detail.
                      const cfg = STATUS_UI[ev.status]
                      const Icon = cfg.icon
                      // Flow runs top→bottom, so the most recent update — the
                      // current status — is the last item.
                      const isLatest = idx === events.length - 1
                      return (
                        <motion.li
                          key={ev.id}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="relative flex gap-3.5 pb-5 last:pb-0"
                        >
                          {/* connector line */}
                          {idx < events.length - 1 && (
                            <span className="absolute left-[15px] top-8 h-full w-px bg-border" />
                          )}
                          <div className={cn(
                            'relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                            isLatest ? `${cfg.ring} text-white shadow-sm` : `${cfg.soft} ${cfg.text}`,
                          )}>
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1 pt-0.5">
                            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
                              <p className={cn('text-sm font-semibold', isLatest && cfg.text)}>
                                {STATUS_LABEL[ev.status]}
                              </p>
                              <time className="text-xs text-muted-foreground">{formatDateTime(ev.occurredAt)}</time>
                            </div>
                            {ev.location && (
                              <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                                <MapPin className="h-3 w-3" /> {ev.location}
                              </p>
                            )}
                            {ev.note && <p className="mt-0.5 text-xs text-muted-foreground/90">{ev.note}</p>}
                          </div>
                        </motion.li>
                      )
                    })}
                  </AnimatePresence>
                </ol>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Right: receipt upload + OCR ────────────────────────────────────── */}
        <div className="space-y-5">
          <Card className="lg:sticky lg:top-4">
            <CardHeader className="border-b border-border/40 py-3">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <ScanLine className="h-4 w-4 text-muted-foreground" /> Courier Receipt
                <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                  <Sparkles className="h-3 w-3" /> OCR
                </span>
              </p>
            </CardHeader>
            <CardContent className="space-y-3 pt-4">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={onFileInput}
              />

              {receiptPreview ? (
                <div className="group relative overflow-hidden rounded-xl border border-border/60">
                  <img src={receiptPreview} alt="receipt" className="max-h-64 w-full object-contain bg-muted/30" />
                  <button
                    onClick={() => { setReceiptPreview(null); setReceiptName(null) }}
                    className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-background/90 shadow ring-1 ring-border/50 transition hover:bg-background"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border/70 bg-muted/20 px-4 py-9 text-center transition hover:border-primary/50 hover:bg-primary/5"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                    {receiptName ? <ImageIcon className="h-5 w-5" /> : <Upload className="h-5 w-5" />}
                  </div>
                  <p className="text-sm font-medium">{receiptName ?? 'Upload courier receipt'}</p>
                  <p className="text-xs text-muted-foreground">ST / Professional Courier — image or PDF</p>
                </button>
              )}

              {receiptPreview && (
                <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="h-3.5 w-3.5" /> Replace
                </Button>
              )}

              {/* OCR progress */}
              {ocrRunning && (
                <div className="space-y-1.5 rounded-lg bg-primary/5 p-3">
                  <div className="flex items-center gap-2 text-xs font-medium text-primary">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Reading receipt… {Math.round(ocrProgress * 100)}%
                  </div>
                  <Progress value={ocrProgress * 100} className="h-1.5" />
                </div>
              )}

              <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
                We auto-extract Courier Name, Tracking ID & Dispatch Date. Review the
                fields on the left, then <span className="font-medium">Save</span>.
              </p>

              {ocrText && !ocrRunning && (
                <details className="rounded-lg bg-muted/30 p-2 text-xs">
                  <summary className="cursor-pointer font-medium text-muted-foreground">View raw OCR text</summary>
                  <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-[11px] text-muted-foreground/80">{ocrText}</pre>
                </details>
              )}
            </CardContent>
          </Card>

          {/* Booked meta */}
          <Card>
            <CardContent className="space-y-2 py-4 text-xs text-muted-foreground">
              <div className="flex justify-between"><span>Booked</span><span>{formatDate(delivery.createdAt)}</span></div>
              {delivery.dispatchDate && (
                <div className="flex justify-between"><span>Dispatched</span><span>{formatDate(delivery.dispatchDate)}</span></div>
              )}
              <div className="flex justify-between"><span>Last updated</span><span>{formatDateTime(delivery.updatedAt)}</span></div>
              {delivery.lastSyncedAt && (
                <div className="flex items-center justify-between border-t border-border/40 pt-2">
                  <span className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    </span>
                    Live carrier sync
                  </span>
                  <span>{formatDateTime(delivery.lastSyncedAt)}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </motion.div>
  )
}

// Small labelled info row used in the Shipment & Customer card.
function InfoRow({
  icon: Icon, label, value, mono,
}: { icon: typeof User; label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </p>
      <p className={cn('mt-0.5 text-sm', mono && 'font-mono')}>{value}</p>
    </div>
  )
}
