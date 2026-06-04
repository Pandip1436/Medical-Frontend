import { useCallback, useMemo } from 'react'
import { useColumnPrefsStore } from '@/stores/useColumnPrefsStore'
import type { ColumnDef } from '@/types/table'

export type { ColumnDef }

/**
 * Per-table column show/hide, backed by the synced column-prefs store.
 *
 * @param tableKey stable key for this table, e.g. 'billing.sales'
 * @param columns  the table's full column set
 *
 * Returns `{ visible, isVisible, toggle, reset }`. Required columns are always
 * forced on; stale stored ids (columns removed from the config) are dropped.
 */
export function useColumnVisibility(tableKey: string, columns: ColumnDef[]) {
  const stored = useColumnPrefsStore((s) => s.prefs[tableKey])
  const setTable = useColumnPrefsStore((s) => s.setTable)

  const requiredIds = useMemo(
    () => columns.filter((c) => c.required).map((c) => c.id),
    [columns],
  )
  const defaultIds = useMemo(
    () => columns.filter((c) => c.required || c.defaultVisible).map((c) => c.id),
    [columns],
  )

  // Resolve the visible set: stored choice (intersected with valid ids + always
  // including required), or the defaults when the user hasn't customized yet.
  const visible = useMemo(() => {
    if (!stored) return defaultIds
    const valid = new Set(columns.map((c) => c.id))
    const fromStored = stored.filter((id) => valid.has(id))
    return Array.from(new Set([...requiredIds, ...fromStored]))
  }, [stored, columns, requiredIds, defaultIds])

  const isVisible = useCallback((id: string) => visible.includes(id), [visible])

  const toggle = useCallback(
    (id: string) => {
      const col = columns.find((c) => c.id === id)
      if (!col || col.required) return // required columns can't be hidden
      const next = visible.includes(id)
        ? visible.filter((x) => x !== id)
        : [...visible, id]
      setTable(tableKey, next)
    },
    [columns, visible, setTable, tableKey],
  )

  const reset = useCallback(() => setTable(tableKey, defaultIds), [setTable, tableKey, defaultIds])

  return { visible, isVisible, toggle, reset }
}
