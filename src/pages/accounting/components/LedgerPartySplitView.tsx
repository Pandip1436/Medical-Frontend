import { useEffect, useRef, useState } from 'react'
import { Users } from 'lucide-react'
import { useRoute } from '@/lib/router'
import { SplitViewShell } from '@/components/shared/SplitViewShell'
import { usePaginatedSearch } from '@/hooks/usePaginatedSearch'
import { CustomerCompactCard } from '@/pages/customers/components/CustomerCompactCard'
import { SupplierCompactCard } from '@/pages/purchase/components/SupplierCompactCard'
import { LedgerPartyTypeTabs } from './LedgerPartyTypeTabs'
import { LedgerDetailContent } from './LedgerDetailContent'
import type { Customer, Supplier } from '@/types'

type PartyType = 'customer' | 'supplier'

interface LedgerPartySplitViewProps {
  selectedCustomerId: string | null
  selectedSupplierId: string | null
  onSelectParty: (id: string, type: PartyType) => void
  onClearSelection: () => void
}

export function LedgerPartySplitView({
  selectedCustomerId,
  selectedSupplierId,
  onSelectParty,
  onClearSelection,
}: LedgerPartySplitViewProps) {
  // Navigating away from /accounting/ledger (e.g. clicking another sidebar
  // item) briefly re-renders this still-mounted component with the new
  // route's empty search string — collapsing selectedPartyId to null exactly
  // like a fresh "nothing selected yet" load. Without checking the path, the
  // auto-select effect below "helpfully" re-picks a party and navigates back
  // to Ledger, making every other page unreachable from here.
  const { path } = useRoute()
  const onLedgerPage = path === '/accounting/ledger'

  const selectedPartyId = selectedCustomerId ?? selectedSupplierId ?? null
  const selectedPartyType: PartyType | null = selectedCustomerId ? 'customer' : selectedSupplierId ? 'supplier' : null

  // Which list the left pane is browsing — independent of which party is
  // actually selected, so you can browse the other type without losing the
  // ledger currently showing on the right (matches the old popover's
  // pickerType/partyType split, just permanently visible instead of
  // popover-scoped). Lazily seeded from whichever party is already selected.
  const [browseType, setBrowseType] = useState<PartyType>(selectedPartyType ?? 'customer')
  const [partySearch, setPartySearch] = useState('')

  // Both always enabled (not gated on browseType) — the inactive type's tab
  // still needs an accurate live count, and usePaginatedSearch resets total
  // to 0 the moment a hook goes disabled, which made the tab you weren't
  // browsing permanently show "0" regardless of how many actually existed.
  const customerResults = usePaginatedSearch<Customer>({
    endpoint: '/customers',
    pageSize: 20,
  })
  const supplierResults = usePaginatedSearch<Supplier>({
    endpoint: '/suppliers',
    pageSize: 20,
  })

  useEffect(() => {
    customerResults.setQuery(partySearch)
    supplierResults.setQuery(partySearch)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partySearch])

  const activeResults = browseType === 'customer' ? customerResults : supplierResults

  // Set the moment "Clear selection" is clicked, and only reset by a
  // deliberate row click — without this, clearing navigates to a URL with no
  // customerId/supplierId, which makes selectedPartyId fall to null, which
  // the auto-select effect below reads as "nothing selected yet" and
  // immediately re-selects the first already-loaded item, making Clear look
  // like it does nothing at all.
  const justClearedRef = useRef(false)

  // Auto-select on first load only (nothing selected yet, e.g. no ?customerId=/
  // ?supplierId= deep-link) — browsing or searching afterwards never overrides
  // an existing selection, matching the old popover's behavior where picking a
  // tab or typing a search never changed what the detail panel showed until
  // you actually clicked a row.
  useEffect(() => {
    if (!onLedgerPage) return
    if (justClearedRef.current) return
    if (selectedPartyId) return
    if (activeResults.items.length === 0) return
    onSelectParty(activeResults.items[0].id, browseType)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeResults.items, browseType, selectedPartyId, onLedgerPage])

  const handleClear = () => {
    justClearedRef.current = true
    onClearSelection()
  }
  const handleSelect = (id: string, type: PartyType) => {
    justClearedRef.current = false
    onSelectParty(id, type)
  }

  const sentinelRef = useRef<HTMLDivElement>(null)
  const pendingLoadRef = useRef(false)
  useEffect(() => {
    if (!activeResults.loading) pendingLoadRef.current = false
  }, [activeResults.loading])
  useEffect(() => {
    if (!activeResults.hasMore || !sentinelRef.current) return
    const el = sentinelRef.current
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !pendingLoadRef.current) {
          pendingLoadRef.current = true
          activeResults.loadMore()
        }
      },
      { threshold: 0 },
    )
    observer.observe(el)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeResults.hasMore, browseType])

  const rightContent = selectedPartyId && selectedPartyType ? (
    <LedgerDetailContent key={selectedPartyId} partyId={selectedPartyId} partyType={selectedPartyType} />
  ) : null

  return (
    <SplitViewShell
      searchValue={partySearch}
      onSearchChange={setPartySearch}
      searchPlaceholder={`Search ${browseType === 'customer' ? 'customers' : 'suppliers'}…`}
      resultCount={activeResults.total}
      resultLabel={browseType === 'customer' ? 'customer' : 'supplier'}
      loading={activeResults.loading && activeResults.items.length === 0}
      tabsNode={
        <LedgerPartyTypeTabs
          type={browseType}
          onChange={setBrowseType}
          counts={{ customer: customerResults.total, supplier: supplierResults.total }}
        />
      }
      cards={
        <>
          {browseType === 'customer'
            ? customerResults.items.map((c) => (
              <CustomerCompactCard
                key={c.id}
                customer={c}
                selected={selectedPartyType === 'customer' && c.id === selectedCustomerId}
                onClick={() => handleSelect(c.id, 'customer')}
              />
            ))
            : supplierResults.items.map((s) => (
              <SupplierCompactCard
                key={s.id}
                supplier={s}
                selected={selectedPartyType === 'supplier' && s.id === selectedSupplierId}
                onClick={() => handleSelect(s.id, 'supplier')}
              />
            ))}
          {/* Infinite scroll sentinel */}
          <div ref={sentinelRef} className="h-1" />
          {activeResults.loading && activeResults.items.length > 0 && (
            <div className="flex justify-center py-3">
              <span className="text-[11px] text-muted-foreground">Loading more…</span>
            </div>
          )}
        </>
      }
      onExitSplitView={() => {}}
      onBackToList={handleClear}
      selectedId={selectedPartyId}
      detailLoading={false}
      detailError={null}
      detailContent={rightContent}
      emptyIcon={<Users className="h-8 w-8 opacity-40" />}
      emptyLabel="Select a customer or supplier on the left to see their ledger"
    />
  )
}
