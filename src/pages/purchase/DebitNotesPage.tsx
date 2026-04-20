import { useState, useCallback, useEffect } from 'react'
import { useBranchRefresh } from '@/hooks/useBranchRefresh'
import api from '@/lib/api'
import {
  Search,
  ChevronRight,
  FileText,
  RotateCcw,
  Plus,
  ArrowLeft,
  Printer,
  Download,
  CheckCircle2,
  ChevronLeft,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatCurrency, formatDate } from '@/lib/utils'
import { navigate } from '@/lib/router'
import { toast } from 'sonner'
import { printDebitNotePdf, downloadDebitNotePdf } from '@/lib/pdf/notesPdf'

// ─────────────────────────────────────────────────────────────
// DEBIT NOTES HISTORY PAGE
// ─────────────────────────────────────────────────────────────

export default function DebitNotesPage() {
  const [pastReturns, setPastReturns] = useState<any[]>([])
  const [allReturns, setAllReturns] = useState<any[]>([])
  const [returnsLoading, setReturnsLoading] = useState(true)
  const [selectedReturnDetails, setSelectedReturnDetails] = useState<any | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const fetchReturns = useCallback(async () => {
    setReturnsLoading(true)
    try {
      const res = await api.get('/purchase-returns')
      const data = res.data.data || res.data || []
      setAllReturns(data)
      setPastReturns(data)
    } catch {
      toast.error('Failed to load debit notes history')
    } finally {
      setReturnsLoading(false)
    }
  }, [])

  useEffect(() => { fetchReturns() }, [fetchReturns])
  useBranchRefresh(fetchReturns)

  // Client-side search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setPastReturns(allReturns)
    } else {
      const q = searchQuery.toLowerCase()
      setPastReturns(allReturns.filter(p =>
        p.debitNoteNo?.toLowerCase().includes(q) ||
        p.supplierName?.toLowerCase().includes(q)
      ))
    }
  }, [searchQuery, allReturns])

  const handleStatusUpdate = async (newStatus: string) => {
    if (!selectedReturnDetails) return
    try {
      await api.patch(`/purchase-returns/${selectedReturnDetails.id}`, { status: newStatus })
      toast.success(`Debit Note marked as ${newStatus}`)
      setSelectedReturnDetails((prev: any) => ({ ...prev, status: newStatus }))
      fetchReturns()
    } catch {
      toast.error('Failed to update status')
    }
  }

  return (
    <div className="-m-3 md:-m-4 lg:-m-6 flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden">

      {/* ── Header ── */}
      <div className="flex shrink-0 items-center justify-between border-b border-border/40 bg-background px-6 py-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => {
              if (selectedReturnDetails) setSelectedReturnDetails(null)
              else navigate('/purchase/returns')
            }}
            className="text-muted-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-lg font-bold tracking-tight">
              {selectedReturnDetails ? `Debit Note — ${selectedReturnDetails.noteNo}` : 'Debit Notes'}
            </h1>
            <p className="text-[11px] text-muted-foreground">
              {selectedReturnDetails
                ? `Issued to ${selectedReturnDetails.partyName}`
                : 'Track and manage all purchase return debit notes'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!selectedReturnDetails && (
            <Button size="sm" onClick={() => navigate('/purchase/returns')}>
              <Plus className="mr-2 h-4 w-4" />
              New Return
            </Button>
          )}
          {selectedReturnDetails && (
            <Button variant="outline" size="sm" onClick={() => setSelectedReturnDetails(null)}>
              ← Back to List
            </Button>
          )}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-hidden bg-muted/20">
        {selectedReturnDetails ? (
          /* ── Detail View ── */
          <ScrollArea className="h-full p-6">
            <div className="mx-auto max-w-4xl space-y-6 pb-12">
              <DebitNoteDetail
                data={selectedReturnDetails}
                onStatusUpdate={handleStatusUpdate}
              />
            </div>
          </ScrollArea>
        ) : (
          /* ── List View ── */
          <div className="flex flex-col h-full">
            {/* Search bar */}
            <div className="border-b border-border/40 bg-background/60 px-6 py-3 backdrop-blur-sm">
              <div className="flex items-center justify-between gap-4">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search by note number or supplier..."
                    className="pl-9 h-9"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground shrink-0">
                  {pastReturns.length} record{pastReturns.length !== 1 ? 's' : ''} found
                </p>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-6">
              {returnsLoading ? (
                <div className="flex h-full items-center justify-center">
                  <div className="flex flex-col items-center gap-2">
                    <RotateCcw className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-xs text-muted-foreground">Loading debit notes...</p>
                  </div>
                </div>
              ) : pastReturns.length === 0 ? (
                <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed text-center bg-background/50">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                    <FileText className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <h3 className="mt-4 text-sm font-semibold">
                    {searchQuery ? 'No results found' : 'No debit notes yet'}
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {searchQuery
                      ? `No notes match "${searchQuery}"`
                      : "Create a purchase return to generate your first debit note."}
                  </p>
                  {!searchQuery && (
                    <Button variant="outline" size="sm" className="mt-4" onClick={() => navigate('/purchase/returns')}>
                      Create Purchase Return
                    </Button>
                  )}
                </div>
              ) : (
                <Card className="overflow-hidden border-border/40 shadow-sm">
                  <Table>
                    <TableHeader className="bg-muted/50">
                      <TableRow>
                        <TableHead className="w-[190px]">Note Number</TableHead>
                        <TableHead className="w-[130px]">Date</TableHead>
                        <TableHead>Supplier</TableHead>
                        <TableHead className="w-[150px]">GRN Reference</TableHead>
                        <TableHead className="text-right w-[140px]">Debit Amount</TableHead>
                        <TableHead className="w-[110px]">Status</TableHead>
                        <TableHead className="w-[60px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="bg-background">
                      {pastReturns.map((pr) => (
                        <TableRow
                          key={pr.id}
                          className="group cursor-pointer hover:bg-muted/40 transition-colors"
                          onClick={() => setSelectedReturnDetails({
                            id: pr.id,
                            noteNo: pr.debitNoteNo,
                            date: pr.date,
                            partyName: pr.supplierName,
                            referenceValue: pr.grn?.grnNumber ?? 'Direct',
                            reason: pr.reason,
                            items: pr.items,
                            subtotal: pr.subtotal,
                            cgst: pr.cgst,
                            sgst: pr.sgst,
                            totalAmount: pr.totalAmount,
                            status: pr.status,
                            notes: pr.notes,
                          })}
                        >
                          <TableCell className="font-mono text-xs font-bold text-primary">{pr.debitNoteNo}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{formatDate(pr.date)}</TableCell>
                          <TableCell className="font-medium text-sm">{pr.supplierName}</TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">{pr.grn?.grnNumber ?? '—'}</TableCell>
                          <TableCell className="text-right font-mono font-semibold text-rose-600 dark:text-rose-400">
                            {formatCurrency(pr.totalAmount)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                pr.status === 'SETTLED' ? 'success' :
                                pr.status === 'SENT' ? 'info' :
                                'secondary'
                              }
                              size="sm"
                              dot
                            >
                              {pr.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Card>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// DEBIT NOTE DETAIL COMPONENT
// ─────────────────────────────────────────────────────────────

function DebitNoteDetail({ data, onStatusUpdate }: { data: any; onStatusUpdate: (s: string) => void }) {
  
  const getDisplaySettlement = () => {
    let pref = 'ADJUST';
    if (data.notes && data.notes.includes('Settlement Preference:')) {
      pref = data.notes.replace('Settlement Preference: ', '').trim().toUpperCase();
    }
    
    if (data.status === 'SETTLED') {
      if (pref === 'REFUND') return 'Money Refunded';
      if (pref === 'REPLACEMENT') return 'Replacement Received';
      return 'Adjusted against Outstanding';
    }
    
    // Status is not settled, so it's pending
    if (pref === 'REFUND') return 'Pending Refund';
    if (pref === 'REPLACEMENT') return 'Pending Replacement';
    if (pref === 'ADJUST') return 'Pending Adjustment';
    
    return 'Pending';
  }

  const getPdfData = () => ({
    noteNo: data.noteNo,
    date: data.date,
    partyLabel: 'Supplier',
    partyName: data.partyName,
    referenceLabel: 'GRN No',
    referenceValue: data.referenceValue,
    reason: data.reason,
    items: (data.items || []).map((it: any) => ({
      productName: it.productName,
      batchNumber: it.batchNumber,
      expiryDate: it.expiryDate,
      returnedQty: it.returnedQty,
      rate: Number(it.purchaseRate || it.rate || 0),
      gstPercent: Number(it.gstPercent || 0),
      amount: Number(it.amount || 0)
    })),
    subtotal: data.subtotal,
    cgst: data.cgst,
    sgst: data.sgst,
    totalAmount: data.totalAmount,
    footerLine: `Settlement: ${getDisplaySettlement()}`,
  })

  return (
    <Card className="overflow-hidden border-border/40 shadow-xl flex flex-col md:flex-row min-h-[600px]">
      {/* Left: Note details */}
      <div className="flex-1 flex flex-col border-r border-border/30">
        <div className="shrink-0 bg-gradient-to-br from-primary/10 via-background to-background p-6 border-b border-border/30">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-primary">Debit Note</p>
              <h2 className="mt-1 font-mono text-2xl font-black tracking-tighter">{data.noteNo}</h2>
              <div className="mt-2 flex items-center gap-2">
                <p className="text-xs text-muted-foreground">{formatDate(data.date)}</p>
                <Badge
                  variant={data.status === 'SETTLED' ? 'success' : data.status === 'SENT' ? 'info' : 'secondary'}
                  size="sm"
                  dot
                >
                  {data.status}
                </Badge>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">GRN Reference</p>
              <p className="font-mono text-sm font-bold">{data.referenceValue}</p>
            </div>
          </div>
          <div className="mt-6 grid grid-cols-3 gap-6">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-1">Supplier / Payee</p>
              <p className="text-lg font-bold text-foreground/80">{data.partyName}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-1">Return Reason</p>
              <p className="text-sm font-medium">{data.reason}</p>
            </div>
            <div>
               <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-1">Settlement</p>
               <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                 {getDisplaySettlement()}
               </p>
             </div>
          </div>
        </div>

        <ScrollArea className="flex-1 max-h-[400px]">
          <div className="p-6">
            <div className="sticky top-0 z-10 grid grid-cols-12 gap-2 rounded-lg bg-muted/50 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80 backdrop-blur-sm">
              <div className="col-span-6">Product</div>
              <div className="col-span-2 text-center">Qty</div>
              <div className="col-span-4 text-right">Amount</div>
            </div>
            <div className="mt-2 space-y-1">
              {(data.items || []).map((it: any, idx: number) => (
                <div
                  key={idx}
                  className="grid grid-cols-12 gap-2 rounded-lg hover:bg-muted/30 px-4 py-3 items-center text-sm transition-colors border-b border-border/10 last:border-0"
                >
                  <div className="col-span-6">
                    <p className="font-bold text-foreground/80">{it.productName}</p>
                    <p className="text-[10px] text-muted-foreground font-mono opacity-60">Batch: {it.batchNumber}</p>
                  </div>
                  <div className="col-span-2 text-center font-mono font-black text-primary/80 bg-primary/5 rounded py-0.5">
                    {it.returnedQty}
                  </div>
                  <div className="col-span-4 text-right font-mono font-bold tracking-tight">
                    {formatCurrency(it.amount || (it.returnedQty * it.purchaseRate))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </ScrollArea>

        <div className="mt-auto p-6 bg-muted/10 border-t border-border/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="flex flex-col">
                <span className="text-[10px] font-bold uppercase text-muted-foreground">Subtotal</span>
                <span className="font-mono text-sm">{formatCurrency(data.subtotal)}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-bold uppercase text-muted-foreground">Taxes (CGST+SGST)</span>
                <span className="font-mono text-sm">{formatCurrency((data.cgst || 0) + (data.sgst || 0))}</span>
              </div>
            </div>
            <div className="flex flex-col items-end">
              <p className="text-[10px] font-black uppercase tracking-widest text-primary">Total Debit Amount</p>
              <p className="font-mono text-3xl font-black tracking-tighter text-primary">{formatCurrency(data.totalAmount)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Right: Actions Sidebar */}
      <div className="w-full md:w-[300px] bg-muted/20 p-6 flex flex-col gap-6">
        <div>
          <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-4">Document Actions</h4>
          <div className="grid gap-2">
            <Button className="w-full shadow-lg shadow-primary/20" onClick={() => downloadDebitNotePdf(getPdfData())}>
              <Download className="mr-2 h-4 w-4" />
              Download PDF
            </Button>
            <Button variant="outline" className="w-full bg-background" onClick={() => printDebitNotePdf(getPdfData())}>
              <Printer className="mr-2 h-4 w-4" />
              Print Copy
            </Button>
          </div>
        </div>

        <Separator className="bg-border/40" />

        {data.status !== 'SETTLED' && (
          <div>
            <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Status</h4>
            <p className="text-xs text-muted-foreground mb-4">
              Mark this debit note as settled once credit is received from the supplier.
            </p>
            <Button
              variant="outline"
              className="w-full bg-background hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 dark:hover:bg-emerald-950/30 dark:hover:text-emerald-400 dark:hover:border-emerald-800 transition-all"
              onClick={() => onStatusUpdate('SETTLED')}
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Mark as Settled
            </Button>
          </div>
        )}

        {data.status === 'SETTLED' && (
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Settled</p>
            <p className="text-xs text-muted-foreground">Credit received from supplier</p>
          </div>
        )}
      </div>
    </Card>
  )
}
