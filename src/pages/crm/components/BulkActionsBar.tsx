import { useState } from 'react'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import {
  CheckCircle2,
  ChevronDown,
  Trash2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'

import api from '@/lib/api'
import {
  USE_MOCK_DATA,
  mockBulkUpdateLeads,
  mockBulkDeleteLeads,
} from '../mockData'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

import type { LeadStage } from '../types'
import { STAGES } from '../types'

interface BulkActionsBarProps {
  selectedIds: string[]
  onClear: () => void
  onChanged: () => void
}

/**
 * Floating action bar pinned to the bottom of the page whenever at least one
 * row is selected. Currently supports:
 *   - Change stage (POST /leads/bulk-update with { stage })
 *   - Delete (POST /leads/bulk-delete)
 *
 * The bar mounts at the page level so it sits above pagination and won't
 * scroll with the table.
 */
export function BulkActionsBar({
  selectedIds,
  onClear,
  onChanged,
}: BulkActionsBarProps) {
  const [busy, setBusy] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  if (selectedIds.length === 0) return null

  const bulkStage = async (stage: LeadStage) => {
    setBusy(true)
    try {
      let count: number
      if (USE_MOCK_DATA) {
        count = mockBulkUpdateLeads(selectedIds, { stage })
      } else {
        const res = await api.post('/leads/bulk-update', {
          ids: selectedIds,
          patch: { stage },
        })
        count = res.data?.count ?? selectedIds.length
      }
      toast.success(`Updated ${count} leads`)
      onChanged()
      onClear()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      toast.error(e?.response?.data?.message ?? 'Bulk update failed')
    } finally {
      setBusy(false)
    }
  }

  const bulkDelete = () => {
    setDeleteConfirmOpen(true)
  }

  const confirmBulkDelete = async () => {
    setBusy(true)
    try {
      let count: number
      if (USE_MOCK_DATA) {
        count = mockBulkDeleteLeads(selectedIds)
      } else {
        const res = await api.post('/leads/bulk-delete', { ids: selectedIds })
        count = res.data?.count ?? selectedIds.length
      }
      toast.success(`Deleted ${count} leads`)
      onChanged()
      onClear()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      toast.error(e?.response?.data?.message ?? 'Bulk delete failed')
    } finally {
      setBusy(false)
      setDeleteConfirmOpen(false)
    }
  }

  return (
    <>
      <div className="fixed inset-x-0 z-40 flex justify-center px-4 pointer-events-none bottom-[max(1.25rem,calc(env(safe-area-inset-bottom)+0.25rem))]">
        <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-border bg-background/95 px-3 py-2 shadow-lg backdrop-blur [-webkit-backdrop-filter:blur(8px)]">
          <span className="px-2 text-xs font-semibold">
            {selectedIds.length} selected
          </span>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={busy} className="gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Change Stage</span>
                <ChevronDown className="h-3 w-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-44">
              {STAGES.map((s) => (
                <DropdownMenuItem
                  key={s.value}
                  onSelect={() => bulkStage(s.value)}
                  className="cursor-pointer text-xs"
                >
                  {s.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            className="gap-1.5 border-rose-300 text-rose-700 hover:bg-rose-500/10 hover:text-rose-800 dark:border-rose-800/60 dark:text-rose-400"
            onClick={bulkDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Delete</span>
          </Button>

          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClear}
            className="h-8 w-8"
            aria-label="Clear selection"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title={`Delete ${selectedIds.length} selected leads?`}
        description={`Delete ${selectedIds.length} selected lead${selectedIds.length === 1 ? '' : 's'}? This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={confirmBulkDelete}
      />
    </>
  )
}
