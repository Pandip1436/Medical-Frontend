import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion, type Variants } from 'framer-motion'
import {
  ChevronLeft, User, Phone, Mail, MapPin, CreditCard, Star,
  IndianRupee, Receipt, FileText, Clock, CheckCircle2, AlertTriangle,
  Wallet, Printer, Download, Share2, Plus, Trash2, Upload, FileImage,
  Eye, X,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { DatePicker } from '@/components/ui/date-picker'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { useRoute, navigate } from '@/lib/router'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import { toast } from 'sonner'
import api, { API_SERVER_URL } from '@/lib/api'
import { printInvoicePdf, downloadInvoicePdf, shareInvoiceViaWhatsApp } from '@/lib/pdf/invoicePdf'

// ─────────────────────────────────────────────────────────────

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
}
const itemVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] as const } },
}

const typeColor: Record<string, string> = {
  RETAIL: 'bg-emerald-500',
  WHOLESALE: 'bg-purple-500',
  DOCTOR: 'bg-amber-500',
}
const typeBadge: Record<string, 'success' | 'purple' | 'warning'> = {
  RETAIL: 'success',
  WHOLESALE: 'purple',
  DOCTOR: 'warning',
}

// ─────────────────────────────────────────────────────────────

export default function CustomerDetailPage() {
  const { search } = useRoute()
  const customerId = new URLSearchParams(search).get('customerId') ?? ''

  const [customer, setCustomer] = useState<any>(null)
  const [invoices, setInvoices] = useState<any[]>([])
  const [payments, setPayments] = useState<any[]>([])
  const [prescriptions, setPrescriptions] = useState<any[]>([])
  const [creditNotes, setCreditNotes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Collect payment dialog
  const [collectOpen, setCollectOpen] = useState(false)
  const [collectAmount, setCollectAmount] = useState('')
  const [collectMode, setCollectMode] = useState('CASH')
  const [collectSubmitting, setCollectSubmitting] = useState(false)

  // Prescription upload dialog
  const [prescUploadOpen, setPrescUploadOpen] = useState(false)
  const [prescFile, setPrescFile] = useState<File | null>(null)
  const [prescDoctor, setPrescDoctor] = useState('')
  const [prescNotes, setPrescNotes] = useState('')
  const [prescValidUntil, setPrescValidUntil] = useState('')
  const [prescUploading, setPrescUploading] = useState(false)

  // Invoice detail dialog
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null)

  const fetchAll = useCallback(async () => {
    if (!customerId) return
    setLoading(true)
    try {
      const [custRes, invRes, payRes, prescRes, cnRes] = await Promise.allSettled([
        api.get(`/customers/${customerId}`),
        api.get(`/billing?customerId=${customerId}`),
        api.get(`/customers/${customerId}/payments`),
        api.get(`/prescriptions?customerId=${customerId}`),
        api.get(`/credit-notes?customerId=${customerId}`),
      ])
      if (custRes.status === 'fulfilled') setCustomer(custRes.value.data)
      if (invRes.status === 'fulfilled') setInvoices(Array.isArray(invRes.value.data) ? invRes.value.data : invRes.value.data?.data ?? [])
      if (payRes.status === 'fulfilled') setPayments(Array.isArray(payRes.value.data) ? payRes.value.data : [])
      if (prescRes.status === 'fulfilled') setPrescriptions(Array.isArray(prescRes.value.data) ? prescRes.value.data : [])
      if (cnRes.status === 'fulfilled') setCreditNotes(Array.isArray(cnRes.value.data) ? cnRes.value.data : [])
    } catch {
      toast.error('Failed to load customer details')
    } finally {
      setLoading(false)
    }
  }, [customerId])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ── Stats ──────────────────────────────────────────────────
  const stats = useMemo(() => {
    const totalBusiness = invoices.reduce((s, i) => s + Number(i.grandTotal), 0)
    const totalPaid = invoices.reduce((s, i) => s + Number(i.amountPaid), 0)
    const outstanding = totalBusiness - totalPaid
    const invoiceCount = invoices.length
    const paidCount = invoices.filter((i) => i.status === 'PAID').length
    return { totalBusiness, totalPaid, outstanding, invoiceCount, paidCount }
  }, [invoices])

  // ── Ledger ─────────────────────────────────────────────────
  // Build chronologically from two sources: invoice creates (debit) and
  // payment records (credit). The previous version also pushed a synthetic
  // "Payment – {invoiceNumber}" entry whenever inv.amountPaid > 0, which
  // double-counted any payment that also exists as a Payment row (the dedup
  // was matching receiptNumber, but the synthetic entry didn't carry one).
  // Payment rows are the source of truth — use them exclusively for credits.
  const ledger = useMemo(() => {
    type Entry = { date: string; particular: string; type: 'Invoice' | 'Payment'; debit: number; credit: number; balance: number; sortKey: number }
    const events: Omit<Entry, 'balance'>[] = []
    for (const inv of invoices) {
      events.push({
        date: inv.date,
        particular: `Invoice ${inv.invoiceNumber}`,
        type: 'Invoice',
        debit: Number(inv.grandTotal),
        credit: 0,
        sortKey: new Date(inv.date).getTime(),
      })
    }
    for (const pay of payments) {
      events.push({
        date: pay.createdAt ?? pay.date,
        particular: `Payment ${pay.receiptNumber}`,
        type: 'Payment',
        debit: 0,
        credit: Number(pay.amount),
        sortKey: new Date(pay.createdAt ?? pay.date).getTime(),
      })
    }
    events.sort((a, b) => a.sortKey - b.sortKey)

    let balance = 0
    return events.map((e) => {
      balance += e.debit - e.credit
      return { ...e, balance } as Entry
    })
  }, [invoices, payments])

  // ── Collect payment ────────────────────────────────────────
  const handleCollect = async () => {
    if (!collectAmount || !customerId) return
    setCollectSubmitting(true)
    try {
      const res = await api.post(`/customers/${customerId}/payment`, {
        amount: parseFloat(collectAmount),
        paymentMode: collectMode,
      })
      toast.success(`Payment recorded. Receipt: ${res.data.receiptNumber}`)
      setCollectOpen(false)
      setCollectAmount('')
      fetchAll()
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Failed to record payment')
    } finally {
      setCollectSubmitting(false)
    }
  }

  // ── Prescription upload ────────────────────────────────────
  const handlePrescUpload = async () => {
    if (!prescFile || !prescDoctor || !customerId) return
    setPrescUploading(true)
    try {
      const form = new FormData()
      form.append('file', prescFile)
      form.append('customerId', customerId)
      form.append('doctorName', prescDoctor)
      if (prescNotes) form.append('notes', prescNotes)
      if (prescValidUntil) form.append('validUntil', prescValidUntil)
      await api.post('/prescriptions/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } })
      toast.success('Prescription uploaded')
      setPrescUploadOpen(false)
      setPrescFile(null); setPrescDoctor(''); setPrescNotes(''); setPrescValidUntil('')
      fetchAll()
    } catch {
      toast.error('Failed to upload prescription')
    } finally {
      setPrescUploading(false)
    }
  }

  const handlePrescDelete = async (id: string) => {
    try {
      await api.delete(`/prescriptions/${id}`)
      toast.success('Prescription deleted')
      fetchAll()
    } catch {
      toast.error('Failed to delete prescription')
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Loading customer details…</p>
      </div>
    )
  }

  if (!customer) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
        <p className="text-sm text-muted-foreground">Customer not found.</p>
        <Button variant="outline" onClick={() => navigate('/customers')}>Back to Customers</Button>
      </div>
    )
  }

  const outstanding = stats.outstanding

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-5">

      {/* ── Header ── */}
      <motion.div variants={itemVariants} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon-sm" onClick={() => navigate('/customers')}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-base font-bold text-white', typeColor[customer.type] ?? 'bg-gray-400')}>
            {customer.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{customer.name}</h1>
              <Badge variant={typeBadge[customer.type] ?? 'secondary'} size="sm" dot>
                {customer.type.charAt(0) + customer.type.slice(1).toLowerCase()}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">{customer.phone}{customer.email ? ` · ${customer.email}` : ''}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {outstanding > 0 && (
            <Button size="sm" className="gap-1.5" onClick={() => setCollectOpen(true)}>
              <Wallet className="h-4 w-4" />
              Collect Payment
            </Button>
          )}
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate(`/billing/new?customerId=${customer.id}`)}>
            <Plus className="h-4 w-4" />
            New Sale
          </Button>
        </div>
      </motion.div>

      {/* ── Stats ── */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Total Business', value: formatCurrency(stats.totalBusiness), subtitle: `${stats.invoiceCount} invoices`, icon: Receipt, iconBg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400', accent: 'border-l-blue-500' },
          { label: 'Amount Paid', value: formatCurrency(stats.totalPaid), subtitle: `${stats.paidCount} settled`, icon: CheckCircle2, iconBg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', accent: 'border-l-emerald-500' },
          { label: 'Outstanding', value: formatCurrency(outstanding > 0 ? outstanding : 0), subtitle: outstanding > 0 ? 'pending payment' : 'fully settled', icon: outstanding > 0 ? AlertTriangle : CheckCircle2, iconBg: outstanding > 0 ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', accent: outstanding > 0 ? 'border-l-rose-500' : 'border-l-emerald-500' },
          { label: 'Loyalty Points', value: (customer.loyaltyPoints ?? 0).toLocaleString('en-IN'), subtitle: 'earned total', icon: Star, iconBg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400', accent: 'border-l-amber-500' },
        ].map((s) => (
          <Card key={s.label} hover className={cn('border-l-[3px]', s.accent)}>
            <CardContent className="flex items-center gap-4 p-4">
              <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', s.iconBg)}>
                <s.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{s.label}</p>
                <p className="text-lg font-bold font-mono leading-tight">{s.value}</p>
                <p className="text-[11px] text-muted-foreground">{s.subtitle}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </motion.div>

      {/* ── Tabs ── */}
      <motion.div variants={itemVariants}>
        <Tabs defaultValue="overview">
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="invoices">
              Invoices
              {invoices.length > 0 && <Badge variant="secondary" size="sm" className="ml-1.5">{invoices.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="ledger">Ledger</TabsTrigger>
            <TabsTrigger value="payments">
              Payments
              {payments.length > 0 && <Badge variant="secondary" size="sm" className="ml-1.5">{payments.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="credit-notes">
              Credit Notes
              {creditNotes.length > 0 && <Badge variant="secondary" size="sm" className="ml-1.5">{creditNotes.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="prescriptions">
              Rx
              {prescriptions.length > 0 && <Badge variant="secondary" size="sm" className="ml-1.5">{prescriptions.length}</Badge>}
            </TabsTrigger>
          </TabsList>

          {/* ── Overview ── */}
          <TabsContent value="overview" className="mt-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {/* Contact info */}
              <Card>
                <CardContent className="p-4 space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Contact Information</p>
                  {[
                    { icon: Phone, label: 'Phone', value: customer.phone },
                    customer.alternatePhone && { icon: Phone, label: 'Alternate', value: customer.alternatePhone },
                    customer.email && { icon: Mail, label: 'Email', value: customer.email },
                    customer.address && { icon: MapPin, label: 'Address', value: customer.address },
                  ].filter(Boolean).map((item: any) => (
                    <div key={item.label} className="flex items-start gap-2.5">
                      <item.icon className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" />
                      <div>
                        <p className="text-[10px] text-muted-foreground">{item.label}</p>
                        <p className="text-sm font-medium">{item.value}</p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Business info */}
              <Card>
                <CardContent className="p-4 space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Business Details</p>
                  {[
                    customer.gstin && { label: 'GSTIN', value: customer.gstin, mono: true },
                    customer.dlNumber && { label: 'DL Number', value: customer.dlNumber, mono: true },
                    customer.referredBy && { label: 'Referred By', value: customer.referredBy },
                    customer.doctorRef && { label: 'Doctor Ref', value: customer.doctorRef },
                    { label: 'Member Since', value: formatDate(customer.createdAt) },
                    { label: 'Credit Limit', value: formatCurrency(Number(customer.creditLimit ?? 0)) },
                  ].filter(Boolean).map((item: any) => (
                    <div key={item.label} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{item.label}</span>
                      <span className={cn('font-medium', item.mono && 'font-mono')}>{item.value}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            {/* Recent invoices */}
            {invoices.length > 0 && (
              <Card>
                <CardContent className="p-0">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
                    <p className="text-sm font-semibold">Recent Invoices</p>
                    <Button variant="ghost" size="sm" onClick={() => {}}>View All</Button>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invoice #</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoices.slice(0, 5).map((inv) => (
                        <TableRow key={inv.id} className="cursor-pointer hover:bg-muted/30" onClick={() => setSelectedInvoice(inv)}>
                          <TableCell className="font-mono text-sm">{inv.invoiceNumber}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">{formatDate(inv.date)}</TableCell>
                          <TableCell className="text-right font-mono text-sm font-semibold">{formatCurrency(Number(inv.grandTotal))}</TableCell>
                          <TableCell><StatusBadge status={inv.status} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {customer.notes && (
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Notes</p>
                  <p className="text-sm text-foreground/80">{customer.notes}</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── Invoices ── */}
          <TabsContent value="invoices" className="mt-4">
            <Card>
              <CardContent className="p-0">
                {invoices.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-14 text-muted-foreground">
                    <Receipt className="h-8 w-8 opacity-30" />
                    <p className="text-sm">No invoices found</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invoice #</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Items</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Paid</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Payment</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoices.map((inv) => (
                        <TableRow key={inv.id} className="cursor-pointer hover:bg-muted/30" onClick={() => setSelectedInvoice(inv)}>
                          <TableCell className="font-mono text-sm font-semibold">{inv.invoiceNumber}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">{formatDate(inv.date)}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {inv.items?.length ?? 0} item{(inv.items?.length ?? 0) !== 1 ? 's' : ''}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm font-semibold">{formatCurrency(Number(inv.grandTotal))}</TableCell>
                          <TableCell className="text-right font-mono text-sm text-emerald-600 dark:text-emerald-400">{formatCurrency(Number(inv.amountPaid))}</TableCell>
                          <TableCell><StatusBadge status={inv.status} /></TableCell>
                          <TableCell className="text-sm text-muted-foreground capitalize">{inv.paymentMode?.toLowerCase()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Ledger ── */}
          <TabsContent value="ledger" className="mt-4">
            <Card>
              <CardContent className="p-0">
                {ledger.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-14 text-muted-foreground">
                    <FileText className="h-8 w-8 opacity-30" />
                    <p className="text-sm">No ledger entries</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Particular</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Debit</TableHead>
                        <TableHead className="text-right">Credit</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ledger.map((entry, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="text-muted-foreground text-sm">{formatDate(entry.date)}</TableCell>
                          <TableCell className="text-sm">{entry.particular}</TableCell>
                          <TableCell>
                            <Badge size="sm" dot variant={entry.type === 'Invoice' ? 'warning' : 'success'}>
                              {entry.type}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">{entry.debit > 0 ? formatCurrency(entry.debit) : '—'}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{entry.credit > 0 ? formatCurrency(entry.credit) : '—'}</TableCell>
                          <TableCell className={cn('text-right font-mono text-sm font-semibold', entry.balance > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400')}>
                            {formatCurrency(entry.balance)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Payments ── */}
          <TabsContent value="payments" className="mt-4">
            <Card>
              <CardContent className="p-0">
                {payments.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-14 text-muted-foreground">
                    <Wallet className="h-8 w-8 opacity-30" />
                    <p className="text-sm">No payments recorded</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Receipt #</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Mode</TableHead>
                        <TableHead>Reference</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payments.map((pay) => (
                        <TableRow key={pay.id}>
                          <TableCell className="font-mono text-sm">{pay.receiptNumber}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">{formatDate(pay.createdAt)}</TableCell>
                          <TableCell className="text-sm capitalize">{pay.paymentMode?.toLowerCase()}</TableCell>
                          <TableCell className="text-sm text-muted-foreground font-mono">{pay.referenceNumber ?? '—'}</TableCell>
                          <TableCell className="text-right font-mono text-sm font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrency(Number(pay.amount))}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Credit Notes ── */}
          <TabsContent value="credit-notes" className="mt-4">
            <Card>
              <CardContent className="p-0">
                {creditNotes.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-14 text-muted-foreground">
                    <CreditCard className="h-8 w-8 opacity-30" />
                    <p className="text-sm">No credit notes found</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>CN #</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Invoice Ref</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {creditNotes.map((cn) => (
                        <TableRow key={cn.id}>
                          <TableCell className="font-mono text-sm">{cn.creditNoteNo}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">{formatDate(cn.date)}</TableCell>
                          <TableCell className="font-mono text-sm">{cn.invoiceNumber ?? '—'}</TableCell>
                          <TableCell className="text-sm">{cn.reason ?? '—'}</TableCell>
                          <TableCell className="text-right font-mono text-sm font-semibold">{formatCurrency(Number(cn.totalAmount))}</TableCell>
                          <TableCell>
                            <Badge size="sm" dot variant={cn.settlementMode === 'CREDIT' ? 'success' : 'warning'}>
                              {cn.settlementMode ?? 'Refund'}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Prescriptions ── */}
          <TabsContent value="prescriptions" className="mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{prescriptions.length} on file</p>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setPrescUploadOpen(true)}>
                <Upload className="h-3.5 w-3.5" />
                Upload Rx
              </Button>
            </div>
            {prescriptions.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-14 text-muted-foreground">
                <FileImage className="h-8 w-8 opacity-30" />
                <p className="text-sm">No prescriptions on file</p>
              </div>
            ) : (
              <div className="space-y-2">
                {prescriptions.map((rx) => (
                  <Card key={rx.id}>
                    <CardContent className="flex items-center gap-3 p-3">
                      <FileImage className="h-8 w-8 shrink-0 text-muted-foreground/50" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">Dr. {rx.doctorName}</p>
                        {rx.notes && <p className="text-[11px] text-muted-foreground">{rx.notes}</p>}
                        <p className="text-[10px] text-muted-foreground/60">
                          {formatDate(rx.createdAt)}{rx.validUntil ? ` · Valid until ${formatDate(rx.validUntil)}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {rx.imageUrl && (
                          <Button size="icon-sm" variant="ghost" onClick={() => window.open(`${API_SERVER_URL}${rx.imageUrl}`, '_blank')}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button size="icon-sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => handlePrescDelete(rx.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </motion.div>

      {/* ── Collect Payment Dialog ── */}
      <Dialog open={collectOpen} onOpenChange={setCollectOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Collect Payment</DialogTitle>
            <DialogDescription>Record a payment from {customer.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-xl border border-border/40 bg-muted/30 p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Customer</span>
                <span className="font-medium">{customer.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Outstanding</span>
                <span className="font-mono font-bold text-rose-600">{formatCurrency(outstanding)}</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Payment Mode</Label>
              <Select value={collectMode} onValueChange={setCollectMode}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['CASH', 'CARD', 'UPI', 'CHEQUE'].map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Amount *</Label>
              <Input type="number" className="font-mono" placeholder="Enter amount" value={collectAmount} onChange={(e) => setCollectAmount(e.target.value)} max={outstanding} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCollectOpen(false)}>Cancel</Button>
            <Button disabled={collectSubmitting || !collectAmount} onClick={handleCollect}>
              <Wallet className="h-4 w-4 mr-1.5" />
              {collectSubmitting ? 'Processing…' : 'Collect'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Prescription Upload Dialog ── */}
      <Dialog open={prescUploadOpen} onOpenChange={setPrescUploadOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Upload Prescription</DialogTitle>
            <DialogDescription>Upload an Rx for {customer.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Doctor Name *</Label>
              <Input placeholder="Dr. Ramesh Kumar" value={prescDoctor} onChange={(e) => setPrescDoctor(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>File *</Label>
              <Input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setPrescFile(e.target.files?.[0] ?? null)} />
            </div>
            <div className="space-y-1.5">
              <Label>Valid Until</Label>
              <DatePicker value={prescValidUntil} onChange={setPrescValidUntil} />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea placeholder="Optional notes…" rows={2} value={prescNotes} onChange={(e) => setPrescNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPrescUploadOpen(false)}>Cancel</Button>
            <Button disabled={prescUploading || !prescFile || !prescDoctor} onClick={handlePrescUpload}>
              {prescUploading ? 'Uploading…' : 'Upload'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Invoice Detail Dialog ── */}
      <Dialog open={!!selectedInvoice} onOpenChange={(open) => { if (!open) setSelectedInvoice(null) }}>
        <DialogContent className="p-0 gap-0 w-full h-dvh max-w-none rounded-none md:rounded-xl md:max-w-3xl md:h-auto md:max-h-[90vh] md:overflow-y-auto overflow-y-auto">
          {selectedInvoice && (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <DialogTitle className="flex items-center gap-2 font-mono text-base">
                      <Receipt className="h-4 w-4 text-muted-foreground shrink-0" />
                      {selectedInvoice.invoiceNumber}
                    </DialogTitle>
                    <p className="mt-0.5 text-xs text-muted-foreground">{formatDate(selectedInvoice.date)}</p>
                  </div>
                  <StatusBadge status={selectedInvoice.status} />
                </div>
              </DialogHeader>

              {/* Items table */}
              <div className="overflow-hidden rounded-xl border border-border/40 mx-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Batch</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Rate</TableHead>
                      <TableHead className="text-right">GST%</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(selectedInvoice.items ?? []).map((item: any, idx: number) => (
                      <TableRow key={item.id ?? idx}>
                        <TableCell className="text-muted-foreground text-xs">{idx + 1}</TableCell>
                        <TableCell className="text-sm font-medium">{item.productName}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{item.batchNumber}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{item.quantity}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{formatCurrency(item.rate)}</TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">{Number(item.gstPercent).toFixed(1)}%</TableCell>
                        <TableCell className="text-right font-mono text-sm font-medium">{formatCurrency(item.amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Totals */}
              <div className="space-y-1.5 rounded-xl border border-border/40 bg-muted/20 p-4 text-sm mx-4">
                {[
                  { label: 'Subtotal', value: selectedInvoice.subtotal },
                  { label: 'CGST', value: selectedInvoice.cgst },
                  { label: 'SGST', value: selectedInvoice.sgst },
                ].map((row) => (
                  <div key={row.label} className="flex justify-between text-muted-foreground">
                    <span>{row.label}</span>
                    <span className="font-mono">{formatCurrency(row.value)}</span>
                  </div>
                ))}
                <div className="flex justify-between border-t border-border/40 pt-2 font-bold">
                  <span>Grand Total</span>
                  <span className="font-mono text-base text-emerald-600 dark:text-emerald-400">{formatCurrency(selectedInvoice.grandTotal)}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2 px-4 pb-4">
                <Button className="flex-1 gap-2 min-w-24" onClick={() => printInvoicePdf(selectedInvoice)}>
                  <Printer className="h-4 w-4" /> Print
                </Button>
                <Button variant="outline" className="flex-1 gap-2 min-w-24" onClick={() => downloadInvoicePdf(selectedInvoice)}>
                  <Download className="h-4 w-4" /> Download
                </Button>
                <Button variant="outline" className="gap-2" onClick={() => shareInvoiceViaWhatsApp(selectedInvoice)}>
                  <Share2 className="h-4 w-4" /> Share
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

    </motion.div>
  )
}
