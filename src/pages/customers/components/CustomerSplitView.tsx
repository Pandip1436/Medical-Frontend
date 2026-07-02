import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { Users } from 'lucide-react'
import { SplitViewShell } from '@/components/shared/SplitViewShell'
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
}: CustomerSplitViewProps) {
  const sentinelRef = useRef<HTMLDivElement>(null)
  const pendingLoadRef = useRef(false)

  // Reset the guard when the in-flight load finishes
  useEffect(() => {
    if (!loadingMore) pendingLoadRef.current = false
  }, [loadingMore])

  // Infinite scroll — trigger onLoadMore when sentinel enters viewport.
  // deps intentionally exclude customers.length: reconnecting on every page
  // load would fire the observer immediately and cascade-load all pages.
  useEffect(() => {
    if (!hasMore || !onLoadMore || !sentinelRef.current) return
    const el = sentinelRef.current
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !pendingLoadRef.current) {
          pendingLoadRef.current = true
          onLoadMore()
        }
      },
      { threshold: 0 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, onLoadMore])

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
    <CustomerDetailContent customerId={selectedCustomer.id} />
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
