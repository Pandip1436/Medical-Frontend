import { useMemo, useState } from 'react'
import { Layers, Search, Pencil } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { DataTableRowActions } from '@/components/shared/DataTableRowActions'
import { BatchDetailView } from '../BatchDetailView'
import { isExpired, isNearExpiry } from '@/lib/inventory'
import { navigate } from '@/lib/router'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import type { Batch } from '@/types'

// Shared "Batches" tab — the in-stock batches for one product, with a
// batch/supplier search, an expiry-status folder, and per-row actions (open
// the batch side-panel, quick-adjust). Used by both the product detail split
// panel (ProductDetailContent) and the full-page Product History view so the
// two stay identical. Data (in-stock batches) is passed in by the host, which
// already fetches it; onAfterAction refreshes it after a stock adjustment.
export function ProductBatchesTab({
  batches,
  loading,
  onAfterAction,
}: {
  batches: Batch[]
  loading: boolean
  onAfterAction: () => void
}) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'near_expiry' | 'expired'>('all')
  const [detailBatchId, setDetailBatchId] = useState<string | null>(null)

  // In-stock batches, nearest expiry first (FEFO — the batch the next sale
  // draws from sits on top).
  const rows = useMemo(
    () =>
      [...batches].sort(
        (a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime(),
      ),
    [batches],
  )
  const counts = useMemo(() => {
    let near = 0
    let expired = 0
    for (const b of rows) {
      if (isExpired(b.expiryDate)) expired++
      else if (isNearExpiry(b.expiryDate, 90)) near++
    }
    return { all: rows.length, near_expiry: near, expired }
  }, [rows])
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((b) => {
      if (statusFilter === 'expired' && !isExpired(b.expiryDate)) return false
      if (statusFilter === 'near_expiry' && (isExpired(b.expiryDate) || !isNearExpiry(b.expiryDate, 90))) return false
      if (!q) return true
      return (
        b.batchNumber?.toLowerCase().includes(q) ||
        (b as any).supplierName?.toLowerCase().includes(q)
      )
    })
  }, [rows, search, statusFilter])

  // Rendered inside the host's own scroll container (both hosts wrap their tab
  // content in one), so this is a plain fragment: a filter row that scrolls
  // with the list, then the table whose header sticks to the scroll top.
  return (
    <>
      {/* Filter row — search (batch # / supplier) + status folder + count. */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border/40 px-4 py-2.5">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search batch number or supplier..."
            className="h-9 pl-8"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="h-9 w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Batches ({counts.all})</SelectItem>
            <SelectItem value="near_expiry">Near Expiry ({counts.near_expiry})</SelectItem>
            <SelectItem value="expired">Expired ({counts.expired})</SelectItem>
          </SelectContent>
        </Select>
        <span className="ml-auto shrink-0 text-xs text-muted-foreground">{filtered.length} found</span>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <div className="h-8 w-8 rounded-full border-b-2 border-primary animate-spin" />
          <p className="text-sm text-muted-foreground animate-pulse">Loading batches…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/50">
            <Layers className="h-7 w-7 text-muted-foreground/50" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">
            {rows.length === 0 ? 'No batches in stock' : 'No batches match your filters'}
          </p>
          <p className="text-xs text-muted-foreground">
            {rows.length === 0
              ? 'Batches appear here once stock is received via a Purchase Entry.'
              : 'Try a different search or status.'}
          </p>
        </div>
      ) : (
        <Table className="text-xs [&_th]:h-9 [&_th]:px-2 [&_th]:text-[10px] [&_td]:px-2 [&_td]:py-2 [&_td]:text-xs">
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow>
                <TableHead>Batch #</TableHead>
                <TableHead>Expiry Date</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Purchase Qty</TableHead>
                <TableHead className="text-right">Sales Qty</TableHead>
                <TableHead className="text-right">MRP</TableHead>
                <TableHead className="text-right">Purchase Rate</TableHead>
                <TableHead className="text-right">Selling Price</TableHead>
                <TableHead className="text-right">Stock Value</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((b) => {
                const expired = isExpired(b.expiryDate)
                const nearExpiry = !expired && isNearExpiry(b.expiryDate, 90)
                const daysLeft = Math.ceil((new Date(b.expiryDate).getTime() - Date.now()) / 86400000)
                const supplierName = (b as any).supplierName as string | undefined
                const stockValue = (b.quantity ?? 0) * Number(b.mrp ?? 0)
                return (
                  <TableRow
                    key={b.id}
                    className="cursor-pointer transition-colors hover:bg-muted/30"
                    onClick={() => setDetailBatchId(b.id)}
                  >
                    <TableCell className="font-mono text-xs font-medium">{b.batchNumber}</TableCell>
                    <TableCell>
                      <div className={cn(
                        'text-xs font-medium',
                        expired ? 'text-rose-600 dark:text-rose-400'
                          : nearExpiry ? 'text-amber-600 dark:text-amber-400' : 'text-foreground',
                      )}>
                        {formatDate(b.expiryDate)}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {expired ? 'expired' : `${daysLeft}d left`}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">{b.quantity}</TableCell>
                    <TableCell className="text-right font-mono text-sm text-muted-foreground">{(b as any).purchaseQty ?? '—'}</TableCell>
                    <TableCell className="text-right font-mono text-sm text-muted-foreground">{(b as any).salesQty ?? '—'}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatCurrency(b.mrp)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatCurrency(b.purchaseRate)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatCurrency((b as any).sellingPrice ?? b.mrp)}</TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold">{formatCurrency(stockValue)}</TableCell>
                    <TableCell className="max-w-[110px]">
                      {b.supplierId && supplierName ? (
                        <button
                          className="block max-w-full truncate text-left text-xs font-medium text-primary hover:underline"
                          title={supplierName}
                          onClick={(e) => { e.stopPropagation(); navigate(`/purchase/suppliers/detail?supplierId=${b.supplierId}`) }}
                        >
                          {supplierName}
                        </button>
                      ) : (
                        <span className="block max-w-full truncate text-xs text-muted-foreground" title={supplierName || undefined}>{supplierName || '—'}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <DataTableRowActions
                        onView={() => setDetailBatchId(b.id)}
                        customActions={[
                          {
                            label: 'Quick Adjust',
                            icon: <Pencil className="h-4 w-4" />,
                            onClick: () => navigate(`/inventory/adjustment?batchId=${b.id}`),
                          },
                        ]}
                      />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
      )}

      {/* Batch detail side-panel — same component Stock Overview uses. */}
      <Sheet open={!!detailBatchId} onOpenChange={(o) => { if (!o) setDetailBatchId(null) }}>
        <SheetContent side="right" className="w-full sm:max-w-190 p-0 gap-0 flex flex-col">
          <SheetTitle className="sr-only">Batch detail</SheetTitle>
          <BatchDetailView
            batchId={detailBatchId}
            onAfterAction={() => {
              setDetailBatchId(null)
              onAfterAction()
            }}
          />
        </SheetContent>
      </Sheet>
    </>
  )
}
