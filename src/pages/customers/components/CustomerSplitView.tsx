import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
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
}: CustomerSplitViewProps) {
  const [localSearch, setLocalSearch] = useState('')
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

  // Auto-select first customer when list loads and nothing selected.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!selectedCustomerId && customers.length > 0) {
      onSelectCustomer(customers[0].id)
    }
  }, [customers.length, selectedCustomerId])

  const displayed = useMemo(() => {
    const q = localSearch.trim().toLowerCase()
    if (!q) return customers
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        (c.email ?? '').toLowerCase().includes(q),
    )
  }, [customers, localSearch])

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === selectedCustomerId) ?? null,
    [customers, selectedCustomerId],
  )

  const rightContent = selectedCustomer ? (
    <CustomerDetailContent customerId={selectedCustomer.id} />
  ) : null

  return (
    <SplitViewShell
      searchValue={localSearch}
      onSearchChange={setLocalSearch}
      searchPlaceholder="Search customers…"
      resultCount={displayed.length}
      resultLabel="customer"
      loading={loading}
      tabsNode={tabsNode}
      cards={
        <>
          {displayed.map((c) => (
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
