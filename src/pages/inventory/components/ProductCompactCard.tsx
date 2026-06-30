import { Package } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn, formatCurrency } from '@/lib/utils'
import type { Product, Category } from '@/types'

function getCategoryName(cat: Product['category']): string {
  if (!cat) return ''
  if (typeof cat === 'string') return cat
  return (cat as Category).name ?? ''
}

interface ProductCompactCardProps {
  product: Product
  selected: boolean
  onClick: () => void
  /** Returns true if a given field id should be rendered. Defaults to showing all. */
  isFieldVisible?: (id: string) => boolean
  isFieldRight?: (id: string) => boolean
}

export function ProductCompactCard({ product, selected, onClick, isFieldVisible, isFieldRight: _isFieldRight }: ProductCompactCardProps) {
  const initial = (product.name || 'P').charAt(0).toUpperCase()
  const isOutOfStock = product.totalStock <= 0
  const isLowStock = !isOutOfStock && product.totalStock <= product.minStock
  const stockColor = isOutOfStock
    ? 'text-rose-600 dark:text-rose-400'
    : isLowStock
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-emerald-600 dark:text-emerald-400'

  const iv = (id: string) => (isFieldVisible ? isFieldVisible(id) : true)

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative flex w-full gap-2.5 border-b border-border/40 px-3 py-3 text-left transition-colors',
        selected ? 'bg-primary/6 hover:bg-primary/8' : 'hover:bg-muted/40',
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
          selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
        )}
      >
        {initial}
      </div>

      {/* Body */}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {/* Row 1: name + MRP */}
        <div className="flex min-w-0 items-start justify-between gap-2">
          <span className="truncate text-sm font-semibold leading-tight text-foreground">
            {product.name}
          </span>
          {iv('mrp') && (
            <span className="shrink-0 font-mono text-[12px] font-semibold text-foreground">
              {formatCurrency(product.mrp)}
            </span>
          )}
        </div>

        {/* Row 2: generic name */}
        {iv('generic') && product.genericName && (
          <span className="truncate text-[11px] text-muted-foreground">{product.genericName}</span>
        )}

        {/* Row 3: category + manufacturer + stock */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {iv('category') && (getCategoryName(product.category) || product.manufacturer) && (
              <>
                <Package className="h-3 w-3 shrink-0 text-muted-foreground/50" />
                <span className="truncate text-[10px] text-muted-foreground">
                  {getCategoryName(product.category) || product.manufacturer}
                </span>
              </>
            )}
          </div>
          {iv('stock') && (
            <div className="flex shrink-0 items-center gap-1">
              {isOutOfStock && (
                <Badge variant="destructive" size="sm" className="text-[10px]">
                  Out of Stock
                </Badge>
              )}
              {isLowStock && (
                <Badge variant="warning" size="sm" className="text-[10px]">
                  Low Stock
                </Badge>
              )}
              <span className={cn('font-mono text-[11px] font-semibold', stockColor)}>
                {product.totalStock}
              </span>
            </div>
          )}
        </div>
      </div>
    </button>
  )
}
