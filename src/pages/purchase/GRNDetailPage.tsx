import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, PackageCheck, FileX2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { StatusBadge } from '@/components/shared/StatusBadge'
import api from '@/lib/api'
import { goBack as routerGoBack, useRoute } from '@/lib/router'
import { formatDate } from '@/lib/utils'
import { toast } from 'sonner'
import type { GRN } from '@/types'
import { GRNDetailContent } from './GRNDetailContent'

// Standalone Purchase Entry detail page — replaces the old list-page drawer.
// Reached from the PE list (row click) and notification deep-links. Renders the
// shared GRNDetailContent body as a full page with a back button.

export default function GRNDetailPage() {
  const { search } = useRoute()
  // Accept either `?id=` (new) or `?grnId=` (legacy / list redirect).
  const params = new URLSearchParams(search)
  const id = params.get('id') ?? params.get('grnId')

  const [grn, setGrn] = useState<GRN | null>(null)
  const [allGrns, setAllGrns] = useState<GRN[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchGrn = useCallback(async (grnId: string) => {
    setIsLoading(true)
    setError(null)
    try {
      // The detail + the full list (the list feeds sibling-PO / debit-note
      // shortage resolution, same as the old drawer's `allGrns`).
      const [detail, list] = await Promise.all([
        api.get(`/grn/${grnId}`),
        api.get('/grn').catch(() => ({ data: [] })),
      ])
      setGrn(detail.data)
      const rows = Array.isArray(list.data) ? list.data : (list.data?.data ?? [])
      setAllGrns(rows)
    } catch (err: any) {
      const msg = err.response?.status === 404 ? 'Purchase Entry not found' : 'Failed to load Purchase Entry'
      setError(msg)
      toast.error(msg)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (id) fetchGrn(id)
    else { setIsLoading(false); setError('No Purchase Entry id provided') }
  }, [id, fetchGrn])

  const goBack = () => routerGoBack('/purchase/grn-list')

  // Derive display status from the live balance so a settled PE never shows
  // "Unpaid" on legacy rows that pre-date the paymentStatus column.
  const balance = grn
    ? Math.max(0, Number(grn.supplierInvoiceAmount || 0) - Number(grn.amountPaid || 0))
    : 0
  const paymentStatus = grn
    ? (balance <= 0.01 ? 'PAID' : Number(grn.amountPaid || 0) > 0 ? 'PARTIAL' : 'UNPAID')
    : 'UNPAID'

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <Button variant="ghost" size="sm" className="gap-1.5 -ml-2" onClick={goBack}>
        <ArrowLeft className="h-3.5 w-3.5" /> Back
      </Button>

      <Card>
        {isLoading ? (
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-xs text-muted-foreground">Loading Purchase Entry…</p>
          </CardContent>
        ) : error || !grn ? (
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/60">
              <FileX2 className="h-5 w-5 text-muted-foreground/50" />
            </div>
            <div>
              <p className="text-sm font-medium">{error ?? 'Purchase Entry unavailable'}</p>
              <p className="mt-1 text-xs text-muted-foreground">It may have been deleted or you don&apos;t have access.</p>
            </div>
            <Button size="sm" variant="outline" onClick={goBack}>Back to Purchase Entry</Button>
          </CardContent>
        ) : (
          <>
            <CardHeader className="border-b border-border/40">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                    <PackageCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-mono text-base font-semibold">{grn.grnNumber}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{formatDate(grn.date)}</p>
                  </div>
                </div>
                {!grn.isReplacement && <StatusBadge status={paymentStatus} />}
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <GRNDetailContent
                grn={grn}
                allGrns={allGrns}
                onRefresh={() => { if (id) fetchGrn(id) }}
              />
            </CardContent>
          </>
        )}
      </Card>
    </motion.div>
  )
}
