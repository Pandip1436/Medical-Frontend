import { Package, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { navigate } from '@/lib/router'
import type { Lead } from '../types'

interface ProductsTabProps {
  lead: Lead
}

/**
 * Products this lead is interested in. For IndiaMART-sourced leads we
 * already have `externalProductName` / `externalCategory` parsed from the
 * inquiry message — render those here. The "+ Add Product" button
 * navigates to /inventory/products so the user can create the product in
 * the catalog (and the Add Product dialog there opens automatically via
 * the ?add=1 hint).
 */
export function ProductsTab({ lead }: ProductsTabProps) {
  const hasExternal = Boolean(lead.externalProductName || lead.externalCategory)

  return (
    <div className="space-y-4 p-5">
      <Card>
        <CardContent className="p-0">
          {/* In-card header — matches the pattern used in Quotations /
              Invoices / Follow Ups / Activity tabs. */}
          <div className="flex items-center justify-between border-b border-border/40 px-5 py-3">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Products of Interest</h3>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => navigate('/inventory/products?add=1')}
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Product</span>
            </Button>
          </div>

          {hasExternal ? (
            <div className="space-y-3 p-5">
              {lead.externalProductName && (
                <div className="rounded-md border border-border/40 bg-muted/15 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Product
                  </p>
                  <p className="mt-1 text-sm font-medium">
                    {lead.externalProductName}
                  </p>
                </div>
              )}
              {lead.externalCategory && (
                <div className="rounded-md border border-border/40 bg-muted/15 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Category
                  </p>
                  <p className="mt-1 text-sm font-medium">
                    {lead.externalCategory}
                  </p>
                </div>
              )}
              {(lead.externalCity || lead.externalState) && (
                <div className="rounded-md border border-border/40 bg-muted/15 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Location
                  </p>
                  <p className="mt-1 text-sm font-medium">
                    {[lead.externalCity, lead.externalState]
                      .filter(Boolean)
                      .join(', ')}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-sm text-muted-foreground">
              <Package className="h-8 w-8 opacity-40" />
              <p>No products linked yet</p>
              <p className="text-xs">
                Use <span className="font-medium text-foreground">+ Add Product</span>{' '}
                above to create one in the catalog.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
