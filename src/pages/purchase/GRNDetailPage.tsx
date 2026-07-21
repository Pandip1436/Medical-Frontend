import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, FileX2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import api from '@/lib/api'
import { goBack as routerGoBack, useRoute } from '@/lib/router'
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

  // On phones this is a normal, fully-scrolling page; from md+ it becomes the
  // bounded "compact shell" whose body scrolls inside the card with the totals
  // footer pinned (see ALWAYS_COMPACT_PAGES in AppLayout).
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4 md:h-full md:min-h-0">
      <Button variant="ghost" size="sm" className="gap-1.5 -ml-2 shrink-0 self-start" onClick={goBack}>
        <ArrowLeft className="h-3.5 w-3.5" /> Back
      </Button>

      <Card className="flex flex-col md:min-h-0 md:flex-1 md:overflow-hidden">
        {isLoading ? (
          <CardContent className="flex flex-1 flex-col items-center justify-center gap-3 py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-xs text-muted-foreground">Loading Purchase Entry…</p>
          </CardContent>
        ) : error || !grn ? (
          <CardContent className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
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
          // GRNDetailContent renders its own header (PE number + status +
          // actions), so the page just hosts it inside the card.
          <CardContent className="flex flex-col p-0 md:min-h-0 md:flex-1">
            <GRNDetailContent
              grn={grn}
              allGrns={allGrns}
              onRefresh={() => { if (id) fetchGrn(id) }}
            />
          </CardContent>
        )}
      </Card>
    </motion.div>
  )
}
