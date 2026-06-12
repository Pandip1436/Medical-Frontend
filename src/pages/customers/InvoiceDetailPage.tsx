import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, Receipt, FileX2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
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
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <Button variant="ghost" size="sm" className="gap-1.5 -ml-2" onClick={goBack}>
        <ArrowLeft className="h-3.5 w-3.5" /> Back
      </Button>

      <Card>
        {isLoading ? (
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-xs text-muted-foreground">Loading invoice…</p>
          </CardContent>
        ) : error || !invoice ? (
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
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
            <CardHeader className="border-b border-border/40">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                    <Receipt className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-mono text-base font-semibold">{invoice.invoiceNumber}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{formatDate(invoice.date)}</p>
                  </div>
                </div>
                <StatusBadge status={invoice.status} className="px-3 py-1 text-sm" />
              </div>
            </CardHeader>
            <CardContent className="pt-4">
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
