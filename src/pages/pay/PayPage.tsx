import { useEffect, useState, useCallback } from 'react'
import { Loader2, CheckCircle2, AlertCircle, RefreshCw, Phone, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { API_BASE_URL } from '@/lib/api'

// Public customer-facing payment page. Linked from the WhatsApp template's
// "Pay Now" URL button. No auth — invoice id is the only credential.
// The backend endpoint returns a narrow view (no items, no other invoices)
// so this URL is safe to share even though invoice ids are cuids (~25 chars,
// effectively unguessable).

interface PaymentLinkView {
  qrImageUrl: string
  shortUrl: string
  status: string
  amount: number
  paidAmount: number
  paidAt: string | null
}

interface PublicPayView {
  invoiceId: string
  invoiceNumber: string
  invoiceDate: string
  customerFirstName: string
  pharmacyName: string
  branchPhone: string | null
  amount: number
  amountPaid: number
  outstanding: number
  status: string
  paymentLink: PaymentLinkView | null
}

const inr = (n: number) =>
  n.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 })

interface Props {
  invoiceId: string
}

export default function PayPage({ invoiceId }: Props) {
  const [data, setData] = useState<PublicPayView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      // Raw fetch — bypasses the authenticated axios client's 401 handler
      // and branchId injection (neither apply to this public route).
      const resp = await fetch(`${API_BASE_URL}/public/pay/${encodeURIComponent(invoiceId)}`)
      if (resp.status === 404) {
        setError('not_found')
        return
      }
      if (!resp.ok) {
        setError('server_error')
        return
      }
      const json: PublicPayView = await resp.json()
      setData(json)
      setError(null)
    } catch {
      setError('network')
    }
  }, [invoiceId])

  useEffect(() => {
    setLoading(true)
    fetchData().finally(() => setLoading(false))
  }, [fetchData])

  // Auto-refresh once a minute so a customer who just paid sees the PAID
  // state without needing to hit refresh. Webhook usually arrives in seconds
  // but networks can lag.
  useEffect(() => {
    if (!data || data.outstanding <= 0.01) return
    const id = window.setInterval(() => {
      fetchData()
    }, 60_000)
    return () => window.clearInterval(id)
  }, [data, fetchData])

  const onRefresh = async () => {
    setRefreshing(true)
    await fetchData()
    setRefreshing(false)
  }

  if (loading) {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-3 py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      </Shell>
    )
  }

  if (error === 'not_found') {
    return (
      <Shell>
        <ErrorCard
          icon={<AlertCircle className="h-10 w-10 text-destructive" />}
          title="Invoice not found"
          message="This payment link is invalid or has been removed. Please contact the pharmacy."
        />
      </Shell>
    )
  }

  if (error || !data) {
    return (
      <Shell>
        <ErrorCard
          icon={<AlertCircle className="h-10 w-10 text-destructive" />}
          title="Couldn't load payment details"
          message="Please check your internet connection and try again."
          action={
            <Button onClick={onRefresh} disabled={refreshing}>
              {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Retry'}
            </Button>
          }
        />
      </Shell>
    )
  }

  // Already fully paid — show success state.
  if (data.outstanding <= 0.01) {
    return (
      <Shell pharmacy={data.pharmacyName} phone={data.branchPhone}>
        <div className="flex flex-col items-center gap-4 py-8 text-center">
          <div className="rounded-full bg-emerald-100 p-4">
            <CheckCircle2 className="h-12 w-12 text-emerald-600" />
          </div>
          <h2 className="text-2xl font-semibold">Payment Received</h2>
          <p className="text-muted-foreground">
            Thank you, {data.customerFirstName}! Your invoice is fully paid.
          </p>
          <div className="mt-2 w-full rounded-lg border bg-card p-4 text-left">
            <Row label="Invoice" value={data.invoiceNumber} />
            <Row label="Amount Paid" value={inr(data.amountPaid)} bold />
            {data.paymentLink?.paidAt && (
              <Row
                label="Paid On"
                value={new Date(data.paymentLink.paidAt).toLocaleString('en-IN')}
              />
            )}
          </div>
        </div>
      </Shell>
    )
  }

  // No active payment link (e.g. cash invoice with outstanding — admin will
  // need to regenerate one). Show outstanding + contact pharmacy.
  if (!data.paymentLink || data.paymentLink.status === 'CLOSED' || data.paymentLink.status === 'EXPIRED') {
    return (
      <Shell pharmacy={data.pharmacyName} phone={data.branchPhone}>
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <h2 className="text-xl font-semibold">Payment link expired</h2>
          <p className="text-muted-foreground">
            Outstanding: <span className="font-semibold">{inr(data.outstanding)}</span>
          </p>
          <p className="text-sm text-muted-foreground">
            Please contact the pharmacy to receive a fresh payment link.
          </p>
          {data.branchPhone && (
            <a
              href={`tel:${data.branchPhone}`}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-primary-foreground hover:opacity-90"
            >
              <Phone className="h-4 w-4" /> Call {data.branchPhone}
            </a>
          )}
        </div>
      </Shell>
    )
  }

  // Live payment link — show QR + UPI button.
  return (
    <Shell pharmacy={data.pharmacyName} phone={data.branchPhone}>
      <div className="flex flex-col items-center gap-5">
        <div className="w-full rounded-lg border bg-card p-4">
          <Row label="Invoice" value={data.invoiceNumber} />
          <Row label="Customer" value={data.customerFirstName} />
          <Row
            label="Date"
            value={new Date(data.invoiceDate).toLocaleDateString('en-IN', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })}
          />
        </div>

        <div className="w-full rounded-lg border-2 border-primary/20 bg-primary/5 p-4 text-center">
          <p className="text-sm text-muted-foreground">Amount to Pay</p>
          <p className="mt-1 text-4xl font-bold tracking-tight">{inr(data.outstanding)}</p>
          {data.amountPaid > 0.01 && (
            <p className="mt-1 text-xs text-muted-foreground">
              Already paid: {inr(data.amountPaid)} of {inr(data.amount)}
            </p>
          )}
        </div>

        <div className="flex flex-col items-center gap-2">
          <img
            src={data.paymentLink.qrImageUrl}
            alt="UPI Payment QR"
            className="h-72 w-72 rounded-lg border bg-white p-2"
          />
          <p className="text-sm text-muted-foreground">
            Scan with any UPI app — GPay, PhonePe, Paytm, BHIM
          </p>
        </div>

        <a
          href={data.paymentLink.shortUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full rounded-lg bg-primary py-3 text-center font-semibold text-primary-foreground hover:opacity-90"
        >
          Pay {inr(data.outstanding)} Now
        </a>

        <Button variant="outline" onClick={onRefresh} disabled={refreshing} className="w-full">
          {refreshing ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Check Payment Status
        </Button>

        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" />
          Secure payment via Razorpay. We never see your card or UPI PIN.
        </div>
      </div>
    </Shell>
  )
}

// ─── Layout helpers ─────────────────────────────────────────────

function Shell({
  pharmacy,
  phone,
  children,
}: {
  pharmacy?: string
  phone?: string | null
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-muted/30 px-4 py-6">
      <div className="mx-auto max-w-md">
        <header className="mb-5 text-center">
          <h1 className="text-xl font-semibold">{pharmacy ?? 'Pharmacy'}</h1>
          {phone && <p className="text-xs text-muted-foreground">{phone}</p>}
        </header>
        <main className="rounded-xl bg-background p-5 shadow-sm">{children}</main>
        <footer className="mt-4 text-center text-xs text-muted-foreground">
          Powered by PBIMS
        </footer>
      </div>
    </div>
  )
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={bold ? 'font-semibold' : 'text-sm'}>{value}</span>
    </div>
  )
}

function ErrorCard({
  icon,
  title,
  message,
  action,
}: {
  icon: React.ReactNode
  title: string
  message: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      {icon}
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground">{message}</p>
      {action}
    </div>
  )
}
