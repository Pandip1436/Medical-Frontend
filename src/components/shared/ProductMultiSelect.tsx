import { useState } from 'react'
import { Search, X, Package } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { usePaginatedSearch } from '@/hooks/usePaginatedSearch'
import type { Product } from '@/types'

interface SelectedProduct {
  id: string
  name: string
}

interface ProductMultiSelectProps {
  value: string[]
  onChange: (ids: string[]) => void
  /** Names for already-selected products, so badges render before/without the
   *  paginated list having loaded them (e.g. pre-filled edit mode). */
  selectedNames?: Record<string, string>
}

// Search-and-pick multiple products (medicines). Used by the Reminders page
// and the New Sale page's "Set reminder" dialog to link specific products to
// a customer reminder, so the auto-WhatsApp message can name them.
export function ProductMultiSelect({ value, onChange, selectedNames = {} }: ProductMultiSelectProps) {
  const [open, setOpen] = useState(false)
  const search = usePaginatedSearch<Product>({ endpoint: '/products', pageSize: 20, enabled: open })
  const [knownNames, setKnownNames] = useState<Record<string, string>>({})

  const toggle = (product: Product) => {
    setKnownNames((prev) => ({ ...prev, [product.id]: product.name }))
    if (value.includes(product.id)) {
      onChange(value.filter((id) => id !== product.id))
    } else {
      onChange([...value, product.id])
    }
  }

  const remove = (id: string) => onChange(value.filter((v) => v !== id))

  const nameFor = (id: string) => knownNames[id] ?? selectedNames[id] ?? id

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-xl border border-border/60">
        <div className="flex items-center gap-2 border-b border-border/40 bg-muted/20 px-3 py-2">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
          <input
            placeholder="Search medicines to link..."
            value={search.query}
            onChange={(e) => {
              search.setQuery(e.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/40"
            autoComplete="off"
          />
        </div>
        {open && (
          <div className="max-h-40 overflow-y-auto">
            {search.loading && search.items.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-muted-foreground">Searching...</p>
            ) : search.items.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-muted-foreground">No products found</p>
            ) : (
              search.items.map((p) => (
                <div
                  key={p.id}
                  className="flex cursor-pointer items-center gap-2.5 border-b border-border/5 px-3 py-2 transition-colors last:border-0 hover:bg-accent/60 active:bg-accent"
                  onClick={() => toggle(p)}
                >
                  <div onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={value.includes(p.id)} onCheckedChange={() => toggle(p)} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold">{p.name}</p>
                    <p className="truncate text-[10px] text-muted-foreground">{p.genericName || p.manufacturer}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {value.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {value.map((id) => (
            <Badge key={id} variant="secondary" size="sm" className="gap-1 pr-1">
              <Package className="h-2.5 w-2.5" />
              {nameFor(id)}
              <button
                type="button"
                onClick={() => remove(id)}
                className="ml-0.5 rounded-full hover:bg-black/10"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </Badge>
          ))}
        </div>
      ) : (
        <p className="text-[10px] text-muted-foreground">
          No medicines linked — the reminder will use its title text only.
        </p>
      )}
    </div>
  )
}
