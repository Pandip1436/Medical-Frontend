import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, Receipt, FileX2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/shared/StatusBadge'
import api from '@/lib/api'
import { goBack as routerGoBack, useRoute, navigate } from '@/lib/router'
import { formatDate } from '@/lib/utils'
import { toast } from 'sonner'
import type { Invoice } from '@/types'
import { InvoiceDetailContent } from './InvoiceDetailContent'

// Standalone invoice detail page — reached from notification deep-links
// (/customers/invoices/detail?id=…) or any "Open Invoice" navigation. Renders
// the same body the list-page modal does, but as a full page with a back button.

export default function InvoiceDetailPage() {
  const { search } = useRoute()
  // Accept either `?id=` (new) or `?invoiceId=` (legacy from older notifications).
  const params = new URLSearchParams(search)
  const id = params.get('id') ?? params.get('invoiceId')

  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchInvoice = useCallback(async (invoiceId: string) => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await api.get(`/billing/${invoiceId}`)
      setInvoice(res.data)
    } catch (err: any) {
      // Self-heal: the id might actually be a Delivery Tracking id (both routes
      // share `?id=`, so a stale/auto-completed link from older history can land
      // here). A delivery id belongs on the tracking page, so redirect there
      // rather than bouncing onto the invoice — that keeps Back working and
      // avoids a double-load on the invoice route.
      if (err.response?.status === 404) {
        try {
          const d = await api.get(`/delivery/${invoiceId}`)
          if (d.data?.id) {
            navigate(`/delivery/tracking?id=${d.data.id}`, { replace: true })
            return
          }
        } catch { /* not a delivery either — fall through to the error state */ }
      }
      const msg = err.response?.status === 404 ? 'Invoice not found' : 'Failed to load invoice'
      setError(msg)
      toast.error(msg)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (id) fetchInvoice(id)
    else { setIsLoading(false); setError('No invoice id provided') }
  }, [id, fetchInvoice])

  // One step back — returns to wherever the user came from (notification,
  // sales list, customer detail…). Falls back to the invoices list only when
  // there's no in-app history (a direct deep-link / refresh).
  const goBack = () => routerGoBack('/customers/invoices')

  return (
    // Bounded "compact shell" so the invoice body scrolls inside the card and
    // its totals + action footer stay pinned at the bottom (matches the split
    // view). `h-full` fills the compact main AppLayout gives this route (see
    // ALWAYS_COMPACT_PAGES) — using h-content-viewport here instead would
    // overflow by the page padding and push the footer below the fold.
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex h-full min-h-0 flex-col gap-4">
      <Button variant="ghost" size="sm" className="gap-1.5 -ml-2 shrink-0 self-start" onClick={goBack}>
        <ArrowLeft className="h-3.5 w-3.5" /> Back
      </Button>

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {isLoading ? (
          <CardContent className="flex flex-1 flex-col items-center justify-center gap-3 py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-xs text-muted-foreground">Loading invoice…</p>
          </CardContent>
        ) : error || !invoice ? (
          <CardContent className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/60">
              <FileX2 className="h-5 w-5 text-muted-foreground/50" />
            </div>
            <div>
              <p className="text-sm font-medium">{error ?? 'Invoice unavailable'}</p>
              <p className="mt-1 text-xs text-muted-foreground">It may have been deleted or you don&apos;t have access.</p>
            </div>
            <Button size="sm" variant="outline" onClick={goBack}>Back to invoices</Button>
          </CardContent>
        ) : (
          <>
            <CardHeader className="shrink-0 border-b border-border/40 px-4 sm:px-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                    <Receipt className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-mono text-base font-semibold">{invoice.invoiceNumber}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatDate(invoice.date)}
                      {invoice.isReplacement && invoice.replacementForCreditNote && (
                        <> · No-charge replacement for {invoice.replacementForCreditNote}</>
                      )}
                    </p>
                  </div>
                </div>
                {/* Replacement invoices are no-charge, so the PAID status is
                    meaningless — show a "Replacement" badge in its place. */}
                {invoice.isReplacement ? (
                  <Badge
                    variant="outline"
                    className="border-sky-200 bg-sky-50 px-3 py-1 text-sm font-medium text-sky-700 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-400"
                  >
                    Replacement
                  </Badge>
                ) : (
                  <StatusBadge status={invoice.status} className="px-3 py-1 text-sm" />
                )}
              </div>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col p-0">
              <InvoiceDetailContent
                invoice={invoice}
                onClose={goBack}
                onUpdated={(updated) => setInvoice(updated)}
              />
            </CardContent>
          </>
        )}
      </Card>
    </motion.div>
  )
}
