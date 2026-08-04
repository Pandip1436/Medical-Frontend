import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { Users } from 'lucide-react'
import { SplitViewShell } from '@/components/shared/SplitViewShell'
import { useInfiniteScrollSentinel } from '@/hooks/useInfiniteScrollSentinel'
import { CustomerCompactCard } from './CustomerCompactCard'
import { CustomerDetailContent } from './CustomerDetailContent'
import type { Customer } from '@/types'

interface CustomerSplitViewProps {
  customers: Customer[]
  loading: boolean
  loadingMore?: boolean
  hasMore?: boolean
  onLoadMore?: () => void
  selectedCustomerId: string | null
  onSelectCustomer: (id: string | null) => void
  onExitSplitView: () => void
  onRefresh: () => void
  tabsNode?: ReactNode
  isCardFieldVisible?: (id: string) => boolean
  isCardFieldRight?: (id: string) => boolean
  // Server-driven search (name / phone / GSTIN / address across ALL customers,
  // not just the loaded pages). Owned by the parent so it feeds the /customers
  // `q` query and paginates the matches.
  searchValue?: string
  onSearchChange?: (v: string) => void
  // Route the detail's Edit to the page's shared rich Add/Edit form (so add and
  // edit are identical). Bumping detailRefreshKey remounts the detail to pick up
  // edits saved through that form.
  onRequestEdit?: (customer: Customer) => void
  detailRefreshKey?: number
}

export function CustomerSplitView({
  customers,
  loading,
  loadingMore,
  hasMore,
  onLoadMore,
  selectedCustomerId,
  onSelectCustomer,
  onExitSplitView,
  onRefresh,
  tabsNode,
  isCardFieldVisible,
  isCardFieldRight,
  searchValue = '',
  onSearchChange,
  onRequestEdit,
  detailRefreshKey = 0,
}: CustomerSplitViewProps) {
  const sentinelRef = useRef<HTMLDivElement>(null)
  useInfiniteScrollSentinel(sentinelRef, { hasMore, onLoadMore, itemCount: customers.length })

  // When the list changes (filter/tab applied), keep the selection if it's
  // still visible; otherwise snap to the first item in the new list.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (customers.length === 0) return
    if (selectedCustomerId && customers.some(c => c.id === selectedCustomerId)) return
    onSelectCustomer(customers[0].id)
  }, [customers])

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === selectedCustomerId) ?? null,
    [customers, selectedCustomerId],
  )

  const rightContent = selectedCustomer ? (
    <CustomerDetailContent
      key={`${selectedCustomer.id}:${detailRefreshKey}`}
      customerId={selectedCustomer.id}
      onRequestEdit={onRequestEdit}
    />
  ) : null

  return (
    <SplitViewShell
      searchValue={searchValue}
      onSearchChange={onSearchChange ?? (() => {})}
      searchPlaceholder="Search name or phone…"
      resultCount={customers.length}
      resultLabel="customer"
      loading={loading}
      tabsNode={tabsNode}
      cards={
        <>
          {customers.map((c) => (
            <CustomerCompactCard
              key={c.id}
              customer={c}
              selected={c.id === selectedCustomerId}
              onClick={() => onSelectCustomer(c.id)}
              isFieldVisible={isCardFieldVisible}
              isFieldRight={isCardFieldRight}
            />
          ))}
          {/* Infinite scroll sentinel */}
          <div ref={sentinelRef} className="h-1" />
          {loadingMore && (
            <div className="flex justify-center py-3">
              <span className="text-[11px] text-muted-foreground">Loading more…</span>
            </div>
          )}
        </>
      }
      onExitSplitView={onExitSplitView}
      selectedId={selectedCustomerId}
      detailLoading={false}
      detailError={null}
      detailContent={rightContent}
      emptyIcon={<Users className="h-8 w-8 opacity-40" />}
      emptyLabel="Select a customer on the left to see their details"
    />
  )
}
