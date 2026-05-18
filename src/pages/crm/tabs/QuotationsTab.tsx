import { useCallback, useEffect, useState } from 'react'
import { FileText, Plus } from 'lucide-react'
import { toast } from 'sonner'

import api from '@/lib/api'
import { USE_MOCK_DATA, mockQuotationsForLead } from '../mockData'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn, formatCurrency, formatDate } from '@/lib/utils'

import type { Lead } from '../types'

interface QuotationsTabProps {
  lead: Lead
  onCreateQuote: () => void
}

interface QuotationRow {
  id: string
  quotationNumber: string
  date: string
  customerName: string
  status: 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'CONVERTED'
  total: number | string
  validUntil?: string | null
  items?: { id: string; productName: string; quantity: number; rate: number; amount: number }[]
}

const statusTone: Record<QuotationRow['status'], string> = {
  DRAFT: 'bg-muted text-muted-foreground',
  SENT: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  ACCEPTED: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  REJECTED: 'bg-rose-500/15 text-rose-700 dark:text-rose-400',
  CONVERTED: 'bg-violet-500/15 text-violet-700 dark:text-violet-400',
}

/**
 * Quotations tab — lists all quotations linked to this lead via
 * Quotation.leadId. Backend endpoint: GET /leads/:id/quotations.
 *
 * Rows: quote # · status pill · created · valid until · amount · view actions.
 * "+ Create Quote" navigates to NewSalePage with ?type=quotation&leadId=...
 * so the resulting quotation is auto-linked back to this lead.
 */
export function QuotationsTab({ lead, onCreateQuote }: QuotationsTabProps) {
  const [items, setItems] = useState<QuotationRow[]>([])
  const [loading, setLoading] = useState(false)

  const fetchItems = useCallback(async () => {
    setLoading(true)
    try {
      if (USE_MOCK_DATA) {
        setItems(mockQuotationsForLead(lead.id) as QuotationRow[])
        return
      }
      const res = await api.get(`/leads/${lead.id}/quotations`)
      setItems(Array.isArray(res.data) ? res.data : [])
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      toast.error(e?.response?.data?.message ?? 'Failed to load quotations')
    } finally {
      setLoading(false)
    }
  }, [lead.id])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  // Auto-refresh when a quotation was just created for this lead from the
  // billing page. Two triggers:
  //   1. sessionStorage signal — set by NewSalePage on save with ?leadId=.
  //      We consume + clear on mount and on every focus so multi-tab flows
  //      reflect the new row without a manual reload.
  //   2. Window focus — covers the "user creates in another browser tab and
  //      switches back to CRM" case where the signal alone isn't enough.
  useEffect(() => {
    const key = `crm:lead-refresh:${lead.id}`
    const consume = () => {
      const stamp = sessionStorage.getItem(key)
      if (stamp) {
        sessionStorage.removeItem(key)
        fetchItems()
      }
    }
    // Consume any pending signal on mount.
    consume()
    // Also refetch whenever the page regains focus.
    const onFocus = () => fetchItems()
    consume()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [lead.id, fetchItems])

  return (
    <div className="space-y-4 p-5">
      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b border-border/40 px-5 py-3">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">
                Quotations
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  ({items.length})
                </span>
              </h3>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={onCreateQuote}
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Create Quote</span>
            </Button>
          </div>

          {loading && items.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-muted-foreground">
              Loading…
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-5 py-12 text-center text-sm text-muted-foreground">
              <FileText className="h-8 w-8 opacity-40" />
              <p>No quotes found</p>
            </div>
          ) : (
            <ul className="divide-y divide-border/40">
              {items.map((q) => (
                <li
                  key={q.id}
                  className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-muted/30"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold">
                        #{q.quotationNumber}
                      </span>
                      <Badge size="sm" className={cn('text-[10px]', statusTone[q.status])}>
                        {q.status}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Created {formatDate(q.date)}
                      {q.validUntil && (
                        <>
                          {' · '}Valid until {formatDate(q.validUntil)}
                        </>
                      )}
                      {q.items && q.items.length > 0 && (
                        <>
                          {' · '}
                          {q.items.length} item{q.items.length === 1 ? '' : 's'}
                        </>
                      )}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-mono text-sm font-bold tabular-nums">
                      {formatCurrency(Number(q.total))}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
