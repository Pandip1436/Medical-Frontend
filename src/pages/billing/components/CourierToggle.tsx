import { useEffect, useState } from 'react'
import { Truck, Loader2, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { navigate } from '@/lib/router'
import api from '@/lib/api'
import { Switch } from '@/components/ui/switch'
import type { Invoice } from '@/types'

// Self-contained courier-tracking toggle for an invoice. Owns its own delivery
// state / fetch / toggle logic so it can be dropped into a panel header next to
// the status badge (rather than living inside the invoice detail body). Renders
// nothing for non-invoice documents (e.g. quotations), which can't be shipped.
export function CourierToggle({ invoice }: { invoice: Invoice }) {
  const [delivery, setDelivery] = useState<{ id: string } | null>(null)
  const [toggling, setToggling] = useState(false)

  const isCourierApplicable = invoice.type === 'INVOICE'

  useEffect(() => {
    if (!isCourierApplicable) return
    let active = true
    api
      // Optional feature + not every role can read delivery (e.g. SALESPERSON),
      // so suppress the global error toast — a 403/empty here is non-fatal.
      .get(`/delivery/invoice/${invoice.id}`, { suppressGlobalToast: true } as any)
      .then((r) => { if (active) setDelivery(r.data ?? null) })
      .catch(() => { /* tracking is optional — ignore */ })
    return () => { active = false }
  }, [invoice.id, isCourierApplicable])

  const handleToggle = async (on: boolean) => {
    setToggling(true)
    try {
      if (on) {
        const res = await api.post('/delivery', { invoiceId: invoice.id })
        setDelivery(res.data)
        toast.success('Courier tracking enabled')
        navigate(`/delivery/tracking?id=${res.data.id}`)
      } else if (delivery) {
        await api.delete(`/delivery/${delivery.id}`)
        setDelivery(null)
        toast.success('Courier tracking disabled')
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Failed to update courier tracking')
    } finally {
      setToggling(false)
    }
  }

  if (!isCourierApplicable) return null

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-2.5 py-1.5">
      <Truck className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-xs font-medium">Courier</span>
      {toggling ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
      ) : (
        <Switch
          checked={!!delivery}
          onCheckedChange={handleToggle}
          aria-label="Enable courier tracking"
        />
      )}
      {delivery && !toggling && (
        <button
          onClick={() => navigate(`/delivery/tracking?id=${delivery.id}`)}
          className="ml-0.5 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          Track <ExternalLink className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}
