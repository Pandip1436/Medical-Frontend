import { useState, type ReactNode } from 'react'
import { Trash2, AlertTriangle, type LucideIcon } from 'lucide-react'
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter,
  AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: ReactNode
  // Confirm button label (defaults to "Delete" for destructive, else "Confirm").
  confirmLabel?: string
  // Label shown on the confirm button while the action runs.
  busyLabel?: string
  cancelLabel?: string
  // Destructive styling: rose icon + red confirm button. Defaults to true since
  // the common case is delete confirmations.
  destructive?: boolean
  // Override the header icon (defaults to Trash2 destructive / AlertTriangle not).
  icon?: LucideIcon
  // The action to run on confirm. May be async — the dialog shows a busy state
  // until it resolves, and blocks closing while it's in flight. The handler is
  // responsible for closing the dialog (onOpenChange(false)) on success.
  onConfirm: () => void | Promise<void>
}

// Reusable premium confirmation dialog — replaces native window.confirm().
// Manages its own in-flight ("busy") state so callers just pass an onConfirm.
//
//   <ConfirmDialog
//     open={!!target}
//     onOpenChange={(o) => { if (!o) setTarget(null) }}
//     title="Delete product?"
//     description={<>Permanently delete <b>“{target?.name}”</b>.</>}
//     confirmLabel="Delete"
//     onConfirm={handleDelete}
//   />
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  busyLabel,
  cancelLabel = 'Cancel',
  destructive = true,
  icon,
  onConfirm,
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false)
  const Icon = icon ?? (destructive ? Trash2 : AlertTriangle)
  const label = confirmLabel ?? (destructive ? 'Delete' : 'Confirm')

  const handleConfirm = async () => {
    setBusy(true)
    try {
      await onConfirm()
    } finally {
      setBusy(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o) }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div
            className={cn(
              'mx-auto mb-1 flex h-12 w-12 items-center justify-center rounded-full',
              destructive ? 'bg-rose-500/10' : 'bg-amber-500/10',
            )}
          >
            <Icon className={cn('h-6 w-6', destructive ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400')} />
          </div>
          <AlertDialogTitle className="text-center">{title}</AlertDialogTitle>
          {description && (
            <AlertDialogDescription className="text-center">{description}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); handleConfirm() }}
            disabled={busy}
            className={cn(
              destructive && 'bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-rose-600',
            )}
          >
            {busy ? (busyLabel ?? `${label}…`) : label}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
