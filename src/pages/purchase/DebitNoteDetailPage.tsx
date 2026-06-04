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
import type { ReturnDetail } from './DebitNotesPage'
import { DebitNoteDetailContent } from './DebitNoteDetailContent'

// Map the API purchase-return into the ReturnDetail shape the content expects.
function toReturnDetail(pr: any): ReturnDetail {
  return {
    id: pr.id,
    noteNo: pr.debitNoteNo,
    date: pr.date,
    partyName: pr.supplierName,
    supplierId: pr.supplierId,
    supplierPhone: pr.supplier?.phone ?? null,
    supplierAddress: pr.supplier?.address ?? null,
    referenceValue: pr.grn?.grnNumber ?? 'Direct',
    reason: pr.reason,
    items: pr.items ?? [],
    grnItems: pr.grn?.items ?? [],
    subtotal: pr.subtotal,
    cgst: pr.cgst,
    sgst: pr.sgst,
    totalAmount: pr.totalAmount,
    status: pr.status,
    settlementMode: pr.settlementMode ?? 'REFUND',
    replacementGrnId: pr.replacementGrnId ?? null,
    notes: pr.notes,
  }
}

// Standalone debit-note detail page — reached from the Debit Notes list, the
// supplier detail page, or notifications. Same scaffold as the Purchase-Entry
// and invoice detail pages.
export default function DebitNoteDetailPage() {
  const { search } = useRoute()
  const id = new URLSearchParams(search).get('id')

  const [dn, setDn] = useState<ReturnDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchDn = useCallback(async (dnId: string) => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await api.get(`/purchase-returns/${dnId}`)
      setDn(toReturnDetail(res.data))
    } catch (err: any) {
      const msg = err.response?.status === 404 ? 'Debit note not found' : 'Failed to load debit note'
      setError(msg)
      toast.error(msg)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (id) fetchDn(id)
    else { setIsLoading(false); setError('No debit note id provided') }
  }, [id, fetchDn])

  const goBack = () => routerGoBack('/purchase/debit-notes')

  const badgeVariant = dn
    ? (dn.status === 'SETTLED' ? 'success' : dn.status === 'SENT' ? 'info' : 'secondary')
    : 'secondary'

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <Button variant="ghost" size="sm" className="gap-1.5 -ml-2" onClick={goBack}>
        <ArrowLeft className="h-3.5 w-3.5" /> Back
      </Button>

      <Card>
        {isLoading ? (
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-xs text-muted-foreground">Loading debit note…</p>
          </CardContent>
        ) : error || !dn ? (
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/60">
              <FileX2 className="h-5 w-5 text-muted-foreground/50" />
            </div>
            <div>
              <p className="text-sm font-medium">{error ?? 'Debit note unavailable'}</p>
              <p className="mt-1 text-xs text-muted-foreground">It may have been deleted or you don&apos;t have access.</p>
            </div>
            <Button size="sm" variant="outline" onClick={goBack}>Back to debit notes</Button>
          </CardContent>
        ) : (
          <>
            <CardHeader className="border-b border-border/40">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400">
                    <RotateCcw className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-mono text-base font-semibold">{dn.noteNo}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{formatDate(dn.date)}</p>
                  </div>
                </div>
                <Badge variant={badgeVariant} size="lg" dot>{dn.status}</Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <DebitNoteDetailContent debitNote={dn} onUpdated={() => { if (id) fetchDn(id) }} />
            </CardContent>
          </>
        )}
      </Card>
    </motion.div>
  )
}
