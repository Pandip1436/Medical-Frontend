import { useCallback, useMemo } from 'react'
import { navigate, useRoute } from '@/lib/router'
import { LedgerPartySplitView } from './components/LedgerPartySplitView'

// Split view (party list left, ledger detail right) — the URL is the single
// source of truth for which party is selected, mirroring CustomersPage.tsx/
// SuppliersPage.tsx's ?customerId=/?supplierId= convention. This also fixes a
// pre-existing gap: picking a party used to never update the URL (so a
// refresh lost the selection unless it arrived via a mount-only ?customerId=
// read), and ?supplierId= wasn't supported at all.
export default function LedgerPage() {
  const { search: routeSearch } = useRoute()
  const urlParams = useMemo(() => new URLSearchParams(routeSearch), [routeSearch])
  const selectedCustomerId = urlParams.get('customerId')
  const selectedSupplierId = urlParams.get('supplierId')

  const selectParty = useCallback((id: string, type: 'customer' | 'supplier') => {
    const params = new URLSearchParams()
    params.set(type === 'customer' ? 'customerId' : 'supplierId', id)
    navigate(`/accounting/ledger?${params.toString()}`)
  }, [])

  const clearSelection = useCallback(() => {
    navigate('/accounting/ledger')
  }, [])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <LedgerPartySplitView
        selectedCustomerId={selectedCustomerId}
        selectedSupplierId={selectedSupplierId}
        onSelectParty={selectParty}
        onClearSelection={clearSelection}
      />
    </div>
  )
}
