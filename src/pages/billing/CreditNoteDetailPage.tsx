import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, RotateCcw, FileX2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import api from '@/lib/api'
import { goBack as routerGoBack, useRoute } from '@/lib/router'
import { formatDate } from '@/lib/utils'
import { toast } from 'sonner'
import type { CreditNote } from './CreditNotesPage'
import { CreditNoteDetailContent } from './CreditNoteDetailContent'

const STATUS_BADGE: Record<string, { label: string; variant: 'warning' | 'success' | 'destructive' }> = {
  PENDING_REVIEW: { label: 'Pending Review', variant: 'warning' },
  APPROVED:       { label: 'Approved',       variant: 'success' },
  REJECTED:       { label: 'Rejected',       variant: 'destructive' },
}

// Standalone credit-note detail page — reached from the Credit Notes list,
// the customer detail page, notifications, or the Approvals page. Same scaffold
// as the invoice / Purchase-Entry detail pages.
export default function CreditNoteDetailPage() {
  const { path, search } = useRoute()
  const id = new URLSearchParams(search).get('id')

  const [cn, setCn] = useState<CreditNote | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchCn = useCallback(async (cnId: string) => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await api.get(`/credit-notes/${cnId}`)
      setCn(res.data)
    } catch (err: any) {
      const msg = err.response?.status === 404 ? 'Credit note not found' : 'Failed to load credit note'
      setError(msg)
      toast.error(msg)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    // `id` comes from the global route's search params, which can briefly hold
    // the NEXT page's id during a navigation transition (e.g. clicking through
    // to an invoice detail) before this page unmounts. Only fetch while this
    // route is actually active so we don't fire GET /credit-notes/<invoiceId>
    // and surface a spurious "Credit note not found" toast.
    if (path !== '/billing/credit-notes/detail') return
    if (id) fetchCn(id)
    else { setIsLoading(false); setError('No credit note id provided') }
  }, [id, path, fetchCn])

  const goBack = () => routerGoBack('/billing/credit-notes')

  const badge = cn ? STATUS_BADGE[cn.status] : undefined

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex h-full min-h-0 flex-col gap-4">
      <Button variant="ghost" size="sm" className="gap-1.5 -ml-2 shrink-0 self-start" onClick={goBack}>
        <ArrowLeft className="h-3.5 w-3.5" /> Back
      </Button>

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {isLoading ? (
          <CardContent className="flex flex-1 flex-col items-center justify-center gap-3 py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-xs text-muted-foreground">Loading credit note…</p>
          </CardContent>
        ) : error || !cn ? (
          <CardContent className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/60">
              <FileX2 className="h-5 w-5 text-muted-foreground/50" />
            </div>
            <div>
              <p className="text-sm font-medium">{error ?? 'Credit note unavailable'}</p>
              <p className="mt-1 text-xs text-muted-foreground">It may have been deleted or you don&apos;t have access.</p>
            </div>
            <Button size="sm" variant="outline" onClick={goBack}>Back to credit notes</Button>
          </CardContent>
        ) : (
          <>
            <CardHeader className="shrink-0 border-b border-border/40">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400">
                    <RotateCcw className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-mono text-base font-semibold">{cn.creditNoteNo}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{formatDate(cn.date)}</p>
                  </div>
                </div>
                <Badge variant={badge?.variant ?? 'secondary'} size="lg" dot>
                  {badge?.label ?? cn.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col p-0">
              <CreditNoteDetailContent creditNote={cn} onUpdated={(updated) => setCn(updated)} />
            </CardContent>
          </>
        )}
      </Card>
    </motion.div>
  )
}
