import { Package, Pencil, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import { navigate } from '@/lib/router'
import type { Product, Batch, Category } from '@/types'

function getCategoryName(cat: Product['category']): string {
  if (!cat) return ''
  if (typeof cat === 'string') return cat
  return (cat as Category).name ?? ''
}

interface MetricProps {
  label: string
  value: React.ReactNode
  className?: string
}

function Metric({ label, value, className }: MetricProps) {
  return (
    <div className={cn('flex flex-col gap-0.5', className)}>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="text-sm font-semibold text-foreground">{value}</span>
    </div>
  )
}

interface ProductDetailPanelProps {
  product: Product
  batches: Batch[]
  onEdit: () => void
}

export function ProductDetailPanel({ product, batches, onEdit }: ProductDetailPanelProps) {
  const isOutOfStock = product.totalStock <= 0
  const isLowStock = !isOutOfStock && product.totalStock <= product.minStock

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-start gap-3 border-b border-border/40 px-4 py-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Package className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">{product.name}</p>
          {product.genericName && (
            <p className="mt-0.5 text-[11px] text-muted-foreground">{product.genericName}</p>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {getCategoryName(product.category) && (
              <Badge variant="secondary" size="sm" className="text-[10px]">
                {getCategoryName(product.category)}
              </Badge>
            )}
            {product.schedule !== 'NONE' && (
              <Badge variant="warning" size="sm" className="text-[10px]">
                Schedule {product.schedule}
              </Badge>
            )}
            {product.hsnCode && (
              <span className="font-mono text-[10px] text-muted-foreground">
                HSN {product.hsnCode}
              </span>
            )}
          </div>
        </div>
        <Button size="sm" variant="outline" className="shrink-0 gap-1.5" onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Edit</span>
        </Button>
      </div>

      {/* Scrollable body */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-5 p-4">
          {/* Key metrics grid */}
          <div className="grid grid-cols-2 gap-3 rounded-lg border border-border/40 bg-muted/20 p-3 sm:grid-cols-3">
            <Metric
              label="MRP"
              value={
                <span className="font-mono text-[15px]">{formatCurrency(product.mrp)}</span>
              }
            />
            <Metric
              label="Purchase Rate"
              value={
                <span className="font-mono text-[15px]">{formatCurrency(product.purchaseRate)}</span>
              }
            />
            <Metric
              label="Selling Rate"
              value={
                <span className="font-mono text-[15px]">{formatCurrency(product.sellingRate)}</span>
              }
            />
            <Metric
              label="Stock"
              value={
                <span
                  className={cn(
                    'font-mono text-[15px] font-bold',
                    isOutOfStock
                      ? 'text-rose-600 dark:text-rose-400'
                      : isLowStock
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-emerald-600 dark:text-emerald-400',
                  )}
                >
                  {product.totalStock}
                </span>
              }
            />
            <Metric label="Min Stock" value={product.minStock} />
            {product.rackLocation && (
              <Metric label="Rack" value={<span className="font-mono">{product.rackLocation}</span>} />
            )}
          </div>

          {/* Manufacturer */}
          {product.manufacturer && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Manufacturer
              </p>
              <p className="mt-1 text-sm">{product.manufacturer}</p>
            </div>
          )}

          {/* Active batches */}
          {batches.length > 0 && (
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Active Batches
              </p>
              <div className="overflow-hidden rounded-md border border-border/40">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/20">
                      <TableHead className="text-[10px]">Batch</TableHead>
                      <TableHead className="text-right text-[10px]">Qty</TableHead>
                      <TableHead className="text-right text-[10px]">MRP</TableHead>
                      <TableHead className="text-right text-[10px]">Expiry</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {batches.slice(0, 8).map((b) => {
                      const daysLeft = Math.floor(
                        (new Date(b.expiryDate).getTime() - Date.now()) / 86400000,
                      )
                      const expirySoon = daysLeft <= 90
                      return (
                        <TableRow key={b.id}>
                          <TableCell className="font-mono text-[11px]">{b.batchNumber}</TableCell>
                          <TableCell className="text-right text-[11px]">{b.quantity}</TableCell>
                          <TableCell className="text-right font-mono text-[11px]">
                            {formatCurrency(b.mrp)}
                          </TableCell>
                          <TableCell
                            className={cn(
                              'text-right text-[11px]',
                              expirySoon ? 'font-semibold text-amber-600 dark:text-amber-400' : '',
                            )}
                          >
                            {formatDate(b.expiryDate)}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* Open full product detail link */}
          <Button
            variant="ghost"
            size="sm"
            className="w-full gap-1.5 text-muted-foreground hover:text-foreground"
            onClick={() => navigate(`/inventory/products/detail?id=${product.id}`)}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            View Full Product Details
          </Button>
        </div>
      </div>
    </div>
  )
}
