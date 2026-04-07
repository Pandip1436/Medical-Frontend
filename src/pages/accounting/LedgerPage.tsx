import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  Search,
  FileDown,
  FileSpreadsheet,
  Printer,
  BookOpen,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  mockCustomers,
  mockSuppliers,
  mockInvoices,
  mockPurchaseOrders,
} from '@/data/mock'
import { cn, formatCurrency, formatDate } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────
// Ledger entry type
// ─────────────────────────────────────────────────────────────

interface LedgerEntry {
  date: string
  particular: string
  debit: number
  credit: number
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export default function LedgerPage() {
  const [partyType, setPartyType] = useState<'customer' | 'supplier'>('customer')
  const [selectedPartyId, setSelectedPartyId] = useState<string>('')
  const [dateFrom, setDateFrom] = useState('2026-03-01')
  const [dateTo, setDateTo] = useState('2026-03-31')
  const [partySearch, setPartySearch] = useState('')

  // Party list based on type
  const parties = useMemo(() => {
    if (partyType === 'customer') {
      return mockCustomers.map((c) => ({ id: c.id, name: c.name }))
    }
    return mockSuppliers.map((s) => ({ id: s.id, name: s.name }))
  }, [partyType])

  // Filtered party list for searchable select
  const filteredParties = useMemo(() => {
    if (!partySearch.trim()) return parties
    const q = partySearch.toLowerCase()
    return parties.filter((p) => p.name.toLowerCase().includes(q))
  }, [parties, partySearch])

  // Build ledger entries
  const ledgerEntries = useMemo((): LedgerEntry[] => {
    if (!selectedPartyId) return []

    const entries: LedgerEntry[] = []
    const from = new Date(dateFrom)
    const to = new Date(dateTo)
    to.setHours(23, 59, 59)

    if (partyType === 'customer') {
      // Customer ledger from invoices
      const customerInvoices = mockInvoices
        .filter((inv) => {
          if (inv.customerId !== selectedPartyId) return false
          const d = new Date(inv.date)
          return d >= from && d <= to
        })
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

      for (const inv of customerInvoices) {
        // Sale entry (debit = customer owes us)
        entries.push({
          date: inv.date,
          particular: `Invoice ${inv.invoiceNumber}`,
          debit: inv.grandTotal,
          credit: 0,
        })
        // Payment entry if paid
        if (inv.amountPaid > 0) {
          entries.push({
            date: inv.date,
            particular: `Payment received - ${inv.paymentMode.toUpperCase()}`,
            debit: 0,
            credit: inv.amountPaid,
          })
        }
      }
    } else {
      // Supplier ledger from purchase orders
      const supplierPOs = mockPurchaseOrders
        .filter((po) => {
          if (po.supplierId !== selectedPartyId) return false
          const d = new Date(po.date)
          return d >= from && d <= to
        })
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

      for (const po of supplierPOs) {
        // Purchase entry (credit = we owe supplier)
        entries.push({
          date: po.date,
          particular: `Purchase Order ${po.poNumber}`,
          debit: 0,
          credit: po.totalAmount,
        })
        // Mock partial payment for received POs
        if (po.status === 'fully_received' || po.status === 'closed') {
          entries.push({
            date: po.date,
            particular: `Payment made for ${po.poNumber}`,
            debit: po.totalAmount,
            credit: 0,
          })
        }
      }
    }

    return entries
  }, [selectedPartyId, partyType, dateFrom, dateTo])

  // Compute running balance
  const ledgerWithBalance = useMemo(() => {
    let balance = 0
    return ledgerEntries.map((entry) => {
      balance += entry.debit - entry.credit
      return { ...entry, balance }
    })
  }, [ledgerEntries])

  const openingBalance = 0
  const closingBalance =
    ledgerWithBalance.length > 0
      ? ledgerWithBalance[ledgerWithBalance.length - 1].balance
      : 0

  const handleExport = (format: string) => {
    toast.info(`${format} export - coming soon`)
  }

  // Find the selected party name for display
  const selectedPartyName = useMemo(() => {
    const party = parties.find((p) => p.id === selectedPartyId)
    return party?.name || ''
  }, [parties, selectedPartyId])

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="space-y-6"
    >
      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Party Ledger</h1>
          <p className="text-sm text-muted-foreground">
            View detailed account ledger for customers and suppliers
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => handleExport('PDF')} className="rounded-xl">
            <FileDown className="mr-1 h-4 w-4" />
            PDF
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport('Excel')} className="rounded-xl">
            <FileSpreadsheet className="mr-1 h-4 w-4" />
            Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport('Print')} className="rounded-xl">
            <Printer className="mr-1 h-4 w-4" />
            Print
          </Button>
        </div>
      </div>

      {/* ── Controls ── */}
      <Card className="rounded-2xl border-border/60">
        <CardContent className="pt-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Party Type */}
            <div className="space-y-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Party Type
              </span>
              <div className="flex rounded-xl border border-border/60 overflow-hidden">
                <button
                  type="button"
                  className={cn(
                    'flex-1 px-4 py-2 text-sm font-medium transition-colors',
                    partyType === 'customer'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-background hover:bg-muted dark:hover:bg-muted/50'
                  )}
                  onClick={() => {
                    setPartyType('customer')
                    setSelectedPartyId('')
                  }}
                >
                  Customer
                </button>
                <button
                  type="button"
                  className={cn(
                    'flex-1 px-4 py-2 text-sm font-medium transition-colors',
                    partyType === 'supplier'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-background hover:bg-muted dark:hover:bg-muted/50'
                  )}
                  onClick={() => {
                    setPartyType('supplier')
                    setSelectedPartyId('')
                  }}
                >
                  Supplier
                </button>
              </div>
            </div>

            {/* Party Name Select */}
            <div className="space-y-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Party Name
              </span>
              <Select value={selectedPartyId} onValueChange={setSelectedPartyId}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Select party" />
                </SelectTrigger>
                <SelectContent>
                  <div className="px-2 pb-2">
                    <Input
                      placeholder="Search..."
                      icon={<Search className="h-4 w-4" />}
                      className="h-8 rounded-lg"
                      value={partySearch}
                      onChange={(e) => setPartySearch(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                  {filteredParties.map((party) => (
                    <SelectItem key={party.id} value={party.id}>
                      {party.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date From */}
            <div className="space-y-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                From Date
              </span>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="rounded-xl"
              />
            </div>

            {/* Date To */}
            <div className="space-y-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                To Date
              </span>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="rounded-xl"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Ledger Table ── */}
      {selectedPartyId ? (
        <>
          {/* Party Info Badge */}
          <div className="flex items-center gap-2">
            <Badge variant="info" dot size="sm">
              {partyType === 'customer' ? 'Customer' : 'Supplier'}
            </Badge>
            <span className="text-sm font-medium">{selectedPartyName}</span>
          </div>

          <Card className="overflow-hidden rounded-2xl border-border/60">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Date
                      </span>
                    </TableHead>
                    <TableHead>
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Particular
                      </span>
                    </TableHead>
                    <TableHead className="text-right">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Debit
                      </span>
                    </TableHead>
                    <TableHead className="text-right">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Credit
                      </span>
                    </TableHead>
                    <TableHead className="text-right">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Running Balance
                      </span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* Opening Balance Row */}
                  <TableRow className="bg-muted/30 dark:bg-muted/10 font-semibold">
                    <TableCell className="text-sm">{formatDate(dateFrom)}</TableCell>
                    <TableCell className="text-sm">Opening Balance</TableCell>
                    <TableCell className="text-right font-mono text-sm">-</TableCell>
                    <TableCell className="text-right font-mono text-sm">-</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatCurrency(openingBalance)}
                    </TableCell>
                  </TableRow>

                  {/* Ledger entries */}
                  {ledgerWithBalance.map((entry, idx) => (
                    <TableRow
                      key={idx}
                      className={idx % 2 === 0 ? 'bg-background' : 'bg-muted/20 dark:bg-muted/10'}
                    >
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {formatDate(entry.date)}
                      </TableCell>
                      <TableCell className="text-sm font-medium">{entry.particular}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-rose-600 dark:text-rose-400">
                        {entry.debit > 0 ? formatCurrency(entry.debit) : '-'}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-emerald-600 dark:text-emerald-400">
                        {entry.credit > 0 ? formatCurrency(entry.credit) : '-'}
                      </TableCell>
                      <TableCell
                        className={cn(
                          'text-right font-mono text-sm font-semibold',
                          entry.balance > 0
                            ? 'text-rose-600 dark:text-rose-400'
                            : entry.balance < 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : ''
                        )}
                      >
                        {formatCurrency(Math.abs(entry.balance))}
                        {entry.balance > 0 ? ' Dr' : entry.balance < 0 ? ' Cr' : ''}
                      </TableCell>
                    </TableRow>
                  ))}

                  {/* Closing Balance Row */}
                  <TableRow className="bg-muted/30 dark:bg-muted/10 font-semibold border-t-2 border-border/60">
                    <TableCell className="text-sm">{formatDate(dateTo)}</TableCell>
                    <TableCell className="text-sm">Closing Balance</TableCell>
                    <TableCell className="text-right font-mono text-sm">-</TableCell>
                    <TableCell className="text-right font-mono text-sm">-</TableCell>
                    <TableCell
                      className={cn(
                        'text-right font-mono text-sm font-bold',
                        closingBalance > 0
                          ? 'text-rose-600 dark:text-rose-400'
                          : closingBalance < 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : ''
                      )}
                    >
                      {formatCurrency(Math.abs(closingBalance))}
                      {closingBalance > 0 ? ' Dr' : closingBalance < 0 ? ' Cr' : ''}
                    </TableCell>
                  </TableRow>

                  {ledgerWithBalance.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        No transactions found for the selected period
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* ── Receipt-tape Summary ── */}
          <Card className="rounded-2xl border-border/60 max-w-sm">
            <CardContent className="p-4 space-y-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Ledger Summary
              </span>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total Debit</span>
                <span className="font-mono text-rose-600 dark:text-rose-400">
                  {formatCurrency(ledgerEntries.reduce((s, e) => s + e.debit, 0))}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total Credit</span>
                <span className="font-mono text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(ledgerEntries.reduce((s, e) => s + e.credit, 0))}
                </span>
              </div>
              <div className="border-t border-dashed border-border/60 pt-2 flex justify-between text-sm font-bold">
                <span>Balance</span>
                <span
                  className={cn(
                    'font-mono',
                    closingBalance > 0
                      ? 'text-rose-600 dark:text-rose-400'
                      : closingBalance < 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : ''
                  )}
                >
                  {formatCurrency(Math.abs(closingBalance))}
                  {closingBalance > 0 ? ' Dr' : closingBalance < 0 ? ' Cr' : ''}
                </span>
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        <Card className="rounded-2xl border-border/60">
          <CardContent className="py-16 text-center text-muted-foreground">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/60 dark:bg-muted/30">
              <BookOpen className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-lg font-medium">Select a party to view their ledger</p>
            <p className="text-sm mt-1">Choose a customer or supplier from the controls above</p>
          </CardContent>
        </Card>
      )}
    </motion.div>
  )
}
