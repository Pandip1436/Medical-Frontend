import { useCallback, useMemo } from 'react'
import { useColumnPrefsStore } from '@/stores/useColumnPrefsStore'
import type { ColumnDef } from '@/types/table'

export type { ColumnDef }

/**
 * Per-table column show/hide + left/right card positioning, backed by the
 * synced column-prefs store.
 *
 * @param tableKey stable key for this table, e.g. 'billing.sales'
 * @param columns  the table's full column set
 */
export function useColumnVisibility(tableKey: string, columns: ColumnDef[]) {
  const stored = useColumnPrefsStore((s) => s.prefs[tableKey])
  const storedPositions = useColumnPrefsStore((s) => s.positions[tableKey])
  const setTable = useColumnPrefsStore((s) => s.setTable)
  const setPositionStore = useColumnPrefsStore((s) => s.setPosition)

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
      if (!col || col.required) return
      const next = visible.includes(id)
        ? visible.filter((x) => x !== id)
        : [...visible, id]
      setTable(tableKey, next)
    },
    [columns, visible, setTable, tableKey],
  )

  const reset = useCallback(() => setTable(tableKey, defaultIds), [setTable, tableKey, defaultIds])

  // --- positioning ---

  const isRight = useCallback(
    (id: string) => {
      const stored = storedPositions?.[id]
      if (stored !== undefined) return stored === 'right'
      // fall back to column definition default
      const col = columns.find((c) => c.id === id)
      return col?.defaultPosition === 'right'
    },
    [storedPositions, columns],
  )

  const togglePosition = useCallback(
    (id: string) => {
      const col = columns.find((c) => c.id === id)
      if (!col?.positionable) return
      const next = isRight(id) ? 'left' : 'right'
      setPositionStore(tableKey, id, next)
    },
    [columns, isRight, setPositionStore, tableKey],
  )

  return { visible, isVisible, toggle, reset, isRight, togglePosition }
}
