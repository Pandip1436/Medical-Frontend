import { useCallback, useEffect, useState } from 'react'
import { IndianRupee, Plus } from 'lucide-react'
import { toast } from 'sonner'

import api from '@/lib/api'
import { USE_MOCK_DATA, mockInvoicesForLead } from '../mockData'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { navigate } from '@/lib/router'
import { cn, formatCurrency, formatDate } from '@/lib/utils'

import type { Lead } from '../types'

interface InvoicesTabProps {
  lead: Lead
  onCreateInvoice: () => void
}

interface InvoiceRow {
  id: string
  invoiceNumber: string
  date: string
  customerName: string
  grandTotal: number | string
  amountPaid: number | string
  status: 'DRAFT' | 'UNPAID' | 'PARTIAL' | 'PAID' | 'CANCELLED'
  type: string
}

const statusTone: Record<string, string> = {
  DRAFT: 'bg-muted text-muted-foreground',
  UNPAID: 'bg-rose-500/15 text-rose-700 dark:text-rose-400',
  PARTIAL: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  PAID: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  CANCELLED: 'bg-muted text-muted-foreground line-through',
}

/**
 * Invoices tab — lists all invoices linked to this lead via Invoice.leadId.
 * Backend endpoint: GET /leads/:id/invoices.
 *
 * Rows: #INV-… bold · status pill · created · amount on the right.
 * Clicking a row navigates to the existing invoice detail page.
 */
export function InvoicesTab({ lead, onCreateInvoice }: InvoicesTabProps) {
  const [items, setItems] = useState<InvoiceRow[]>([])
  const [loading, setLoading] = useState(false)

  const fetchItems = useCallback(async () => {
    setLoading(true)
    try {
      if (USE_MOCK_DATA) {
        setItems(mockInvoicesForLead(lead.id) as InvoiceRow[])
        return
      }
      const res = await api.get(`/leads/${lead.id}/invoices`)
      setItems(Array.isArray(res.data) ? res.data : [])
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      toast.error(e?.response?.data?.message ?? 'Failed to load invoices')
    } finally {
      setLoading(false)
    }
  }, [lead.id])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  // Auto-refresh when an invoice was just created for this lead from the
  // billing page. Mirror of the same effect in QuotationsTab — see comment
  // there for the signal + focus trigger rationale.
  useEffect(() => {
    const key = `crm:lead-refresh:${lead.id}`
    const consume = () => {
      const stamp = sessionStorage.getItem(key)
      if (stamp) {
        sessionStorage.removeItem(key)
        fetchItems()
      }
    }
    consume()
    const onFocus = () => fetchItems()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [lead.id, fetchItems])

  return (
    <div className="space-y-4 p-5">
      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b border-border/40 px-5 py-3">
            <div className="flex items-center gap-2">
              <IndianRupee className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">
                Invoices
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  ({items.length})
                </span>
              </h3>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={onCreateInvoice}
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Create Invoice</span>
            </Button>
          </div>

          {loading && items.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-muted-foreground">
              Loading…
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-5 py-12 text-center text-sm text-muted-foreground">
              <IndianRupee className="h-8 w-8 opacity-40" />
              <p>No invoices linked to this lead yet</p>
            </div>
          ) : (
            <ul className="divide-y divide-border/40">
              {items.map((inv) => (
                <li
                  key={inv.id}
                  className="flex cursor-pointer items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-muted/30"
                  onClick={() => navigate(`/customers/invoices/detail?id=${inv.id}`)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold">
                        #{inv.invoiceNumber}
                      </span>
                      <Badge
                        size="sm"
                        className={cn(
                          'text-[10px]',
                          statusTone[inv.status] ?? 'bg-muted text-muted-foreground',
                        )}
                      >
                        {inv.status}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatDate(inv.date)} · {inv.customerName}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-mono text-sm font-bold tabular-nums">
                      {formatCurrency(Number(inv.grandTotal))}
                    </p>
                    {Number(inv.amountPaid) > 0 &&
                      Number(inv.amountPaid) < Number(inv.grandTotal) && (
                        <p className="text-[10px] text-muted-foreground">
                          Paid {formatCurrency(Number(inv.amountPaid))}
                        </p>
                      )}
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
