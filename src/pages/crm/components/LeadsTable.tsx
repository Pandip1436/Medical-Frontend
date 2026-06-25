import { useState } from 'react'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import {
  Calendar,
  Check,
  ChevronDown,
  Edit2,
  Mail,
  MessageCircle,
  MoreVertical,
  Phone,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'

import api from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import type { Lead, LeadStage, LeadSource } from '../types'
import { STAGES, SOURCES } from '../types'
import {
  USE_MOCK_DATA,
  mockSetLeadStage,
  mockSetLeadSource,
  mockSetLeadAssignee,
  mockDeleteLead,
} from '../mockData'
import { SalesPersonPicker, type SalesPersonOption } from './SalesPersonPicker'

interface LeadsTableProps {
  data: Lead[]
  loading: boolean
  visibleColumns: string[]
  selectedIds: string[]
  onSelectionChange: (next: string[]) => void
  onRowClick: (lead: Lead) => void
  onSelectAll: (allSelected: boolean) => void
  /** Called after a successful inline edit / delete so the parent can refetch. */
  onChanged?: () => void
}

const stageStyles: Record<LeadStage, string> = {
  LEAD: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  QUALIFIED: 'bg-purple-500/15 text-purple-700 dark:text-purple-400',
  PROPOSAL: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  NEGOTIATION: 'bg-rose-500/15 text-rose-700 dark:text-rose-400',
  WON: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  LOST: 'bg-rose-500/15 text-rose-700 dark:text-rose-400',
}

export function LeadsTable({
  data,
  loading,
  visibleColumns,
  selectedIds,
  onSelectionChange,
  onRowClick,
  onSelectAll,
  onChanged,
}: LeadsTableProps) {
  const show = (id: string) => visibleColumns.includes(id)
  const allSelected = data.length > 0 && data.every((d) => selectedIds.includes(d.id))
  const someSelected = !allSelected && data.some((d) => selectedIds.includes(d.id))

  const [deleteLeadTarget, setDeleteLeadTarget] = useState<Lead | null>(null)

  const confirmDeleteLead = async () => {
    if (!deleteLeadTarget) return
    const lead = deleteLeadTarget
    try {
      if (USE_MOCK_DATA) {
        mockDeleteLead(lead.id)
      } else {
        await api.delete(`/leads/${lead.id}`)
      }
      toast.success('Lead deleted')
      onChanged?.()
    } catch (err: unknown) {
      const e2 = err as { response?: { data?: { message?: string } } }
      toast.error(e2?.response?.data?.message ?? 'Failed to delete lead')
    } finally {
      setDeleteLeadTarget(null)
    }
  }

  return (
    // The shadcn <Table> primitive has its OWN inner div with `overflow-auto`.
    // We let it scroll natively (so users can see all columns) but apply
    // overscroll-x-none to prevent trackpad rubber-banding/browser swipe
    // navigations which users perceive as "the page shaking".
    //
    // flex flex-col + [&>div]:flex-1 makes the inner shadcn scroll wrapper
    // fill the parent's available height — so only the table body scrolls
    // vertically, while the page's top bar / search / filters / pagination
    // stay pinned above and below.
    <div className="flex h-full min-w-0 max-w-full flex-col rounded-lg border border-border/40 bg-background [&>div]:rounded-none! [&>div]:border-0! [&>div]:flex-1! [&>div]:min-h-0! [&>div]:overscroll-x-none">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30 hover:bg-muted/30">
            <TableHead className="w-10">
              <Checkbox
                checked={allSelected || (someSelected && 'indeterminate')}
                onCheckedChange={(v) => onSelectAll(!!v)}
                aria-label="Select all"
              />
            </TableHead>
            {show('customerInfo') && <TableHead>Customer Info</TableHead>}
            {/* Action icons column — always present alongside Customer Info */}
            <TableHead className="w-32" aria-label="Quick actions" />
            {show('contact') && <TableHead>Contact</TableHead>}
            {show('email') && <TableHead>Email</TableHead>}
            {show('phone') && <TableHead>Phone</TableHead>}
            {show('company') && <TableHead>Company</TableHead>}
            {show('stage') && <TableHead>Stage</TableHead>}
            {show('pipeline') && <TableHead>Pipeline</TableHead>}
            {show('source') && <TableHead>Source</TableHead>}
            {show('salesPerson') && <TableHead>Owner</TableHead>}
            {show('score') && <TableHead>Score</TableHead>}
            {show('value') && <TableHead>Value</TableHead>}
            {show('created') && <TableHead>Created</TableHead>}
            {show('updated') && <TableHead>Updated</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading && data.length === 0 ? (
            <TableRow>
              <TableCell colSpan={visibleColumns.length + 2} className="py-12 text-center text-sm text-muted-foreground">
                Loading leads…
              </TableCell>
            </TableRow>
          ) : data.length === 0 ? (
            <TableRow>
              <TableCell colSpan={visibleColumns.length + 2} className="py-12 text-center text-sm text-muted-foreground">
                No leads found
              </TableCell>
            </TableRow>
          ) : (
            data.map((lead) => (
              <LeadRow
                key={lead.id}
                lead={lead}
                show={show}
                selected={selectedIds.includes(lead.id)}
                onToggleSelected={() => {
                  onSelectionChange(
                    selectedIds.includes(lead.id)
                      ? selectedIds.filter((x) => x !== lead.id)
                      : [...selectedIds, lead.id],
                  )
                }}
                onClick={() => onRowClick(lead)}
                onChanged={onChanged}
                onDelete={() => setDeleteLeadTarget(lead)}
              />
            ))
          )}
        </TableBody>
      </Table>

      <ConfirmDialog
        open={!!deleteLeadTarget}
        onOpenChange={(open) => { if (!open) setDeleteLeadTarget(null) }}
        title={`Delete lead ${deleteLeadTarget?.leadNumber}?`}
        description={`Delete lead ${deleteLeadTarget?.leadNumber} (${deleteLeadTarget?.title})? This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={confirmDeleteLead}
      />
    </div>
  )
}

function LeadRow({
  lead,
  show,
  selected,
  onToggleSelected,
  onClick,
  onChanged,
  onDelete,
}: {
  lead: Lead
  show: (id: string) => boolean
  selected: boolean
  onToggleSelected: () => void
  onClick: () => void
  onChanged?: () => void
  onDelete: () => void
}) {
  const fullName =
    `${lead.contact.firstName ?? ''} ${lead.contact.lastName ?? ''}`.trim() ||
    'IndiaMART Buyer'
  const phone = lead.contact.phone
    ? `${lead.contact.phoneCountryCode ?? ''}${lead.contact.phone}`
    : '—'

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    onDelete()
  }

  return (
    <TableRow
      data-state={selected ? 'selected' : undefined}
      onClick={onClick}
      className="cursor-pointer"
    >
      <TableCell onClick={(e) => e.stopPropagation()}>
        <Checkbox
          checked={selected}
          onCheckedChange={onToggleSelected}
          aria-label={`Select ${lead.leadNumber}`}
        />
      </TableCell>

      {show('customerInfo') && (
        <TableCell>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">{fullName}</span>
              <Badge
                variant="secondary"
                size="sm"
                className="font-mono text-[10px] text-muted-foreground"
              >
                {lead.leadNumber}
              </Badge>
            </div>
            <span className="text-xs text-muted-foreground">{phone}</span>
          </div>
        </TableCell>
      )}

      {/* Quick-action icons */}
      <TableCell onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon-sm"
            asChild
            title="WhatsApp"
            className="h-7 w-7 text-emerald-600 hover:bg-emerald-500/10"
          >
            <a
              href={`https://wa.me/${lead.contact.phoneCountryCode?.replace('+', '') ?? ''}${lead.contact.phone}`}
              target="_blank"
              rel="noreferrer"
            >
              <MessageCircle className="h-3.5 w-3.5" />
            </a>
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            asChild
            title="Call"
            className="h-7 w-7 text-emerald-600 hover:bg-emerald-500/10"
          >
            <a href={`tel:${lead.contact.phoneCountryCode ?? ''}${lead.contact.phone}`}>
              <Phone className="h-3.5 w-3.5" />
            </a>
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            asChild
            title="Email"
            className="h-7 w-7 text-violet-600 hover:bg-violet-500/10"
            disabled={!lead.contact.email}
          >
            <a href={lead.contact.email ? `mailto:${lead.contact.email}` : undefined}>
              <Mail className="h-3.5 w-3.5" />
            </a>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="h-7 w-7"
                title="More"
                aria-label="More"
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-36">
              <DropdownMenuItem
                onSelect={onClick}
                className="cursor-pointer gap-2 text-xs"
              >
                <Edit2 className="h-3.5 w-3.5" />
                <span>Open detail</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={(e) =>
                  handleDelete(e as unknown as React.MouseEvent)
                }
                className="cursor-pointer gap-2 text-xs text-rose-600 focus:text-rose-700"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Delete</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TableCell>

      {show('contact') && (
        <TableCell className="text-sm">{fullName}</TableCell>
      )}

      {show('email') && (
        <TableCell>
          {lead.contact.email ? (
            <a
              href={`mailto:${lead.contact.email}`}
              onClick={(e) => e.stopPropagation()}
              className="text-sm text-primary hover:underline"
            >
              {lead.contact.email}
            </a>
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          )}
        </TableCell>
      )}

      {show('phone') && (
        <TableCell className="text-sm text-muted-foreground">{phone}</TableCell>
      )}

      {show('company') && (
        <TableCell className="text-sm text-muted-foreground">
          {lead.company?.name ?? '—'}
        </TableCell>
      )}

      {show('stage') && (
        <TableCell onClick={(e) => e.stopPropagation()}>
          <InlineStagePill lead={lead} onChanged={onChanged} />
        </TableCell>
      )}

      {show('pipeline') && (
        <TableCell className="text-sm text-muted-foreground">
          {capitalize(lead.pipeline)}
        </TableCell>
      )}

      {show('source') && (
        <TableCell onClick={(e) => e.stopPropagation()}>
          <InlineSourcePill lead={lead} onChanged={onChanged} />
        </TableCell>
      )}

      {show('salesPerson') && (
        <TableCell onClick={(e) => e.stopPropagation()}>
          <InlineSalesPersonPill lead={lead} onChanged={onChanged} />
        </TableCell>
      )}

      {show('score') && (
        <TableCell>
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                'inline-block h-1.5 w-1.5 rounded-full',
                lead.score >= 70
                  ? 'bg-emerald-500'
                  : lead.score >= 40
                    ? 'bg-amber-500'
                    : 'bg-rose-500',
              )}
            />
            <span className="text-xs font-bold tabular-nums">{lead.score}</span>
          </div>
        </TableCell>
      )}

      {show('value') && (
        <TableCell className="font-mono text-xs tabular-nums">
          {Number(lead.value) > 0 ? formatCurrency(Number(lead.value)) : '—'}
        </TableCell>
      )}

      {show('created') && (
        <TableCell>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3" />
            {formatDate(lead.createdAt)}
          </div>
        </TableCell>
      )}

      {show('updated') && (
        <TableCell>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3" />
            {formatDate(lead.updatedAt)}
          </div>
        </TableCell>
      )}
    </TableRow>
  )
}

// ── Inline stage editor ──────────────────────────────────────
function InlineStagePill({
  lead,
  onChanged,
}: {
  lead: Lead
  onChanged?: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const handle = async (next: LeadStage) => {
    if (next === lead.stage) {
      setOpen(false)
      return
    }
    setBusy(true)
    try {
      // Mock mode mutates the in-memory list so the parent refetch picks
      // up the new stage — otherwise the pill snaps back on re-render.
      if (USE_MOCK_DATA) {
        mockSetLeadStage(lead.id, next)
      } else {
        await api.patch(`/leads/${lead.id}`, { stage: next })
      }
      toast.success(`Moved to ${capitalize(next)}`)
      onChanged?.()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      toast.error(e?.response?.data?.message ?? 'Failed to update stage')
    } finally {
      setBusy(false)
      setOpen(false)
    }
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={busy}
          className={cn(
            'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-opacity',
            stageStyles[lead.stage],
            busy && 'opacity-60',
          )}
        >
          {capitalize(lead.stage)}
          <ChevronDown className="h-3 w-3 opacity-70" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-44 p-1 rounded-lg border border-border/60 bg-popover shadow-lg ring-1 ring-black/2"
      >
        <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
          Change stage
        </div>
        <div className="h-px bg-border/60 mb-0.5" />
        {STAGES.map((s) => {
          const isActive = s.value === lead.stage
          return (
            <button
              key={s.value}
              type="button"
              onClick={() => handle(s.value)}
              className={cn(
                'group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors',
                isActive ? 'bg-accent/60 text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              <span className={cn(
                'inline-block h-2 w-2 rounded-full shrink-0',
                stageStyles[s.value].split(' ')[0].replace('/15', ''),
              )} />
              <span className={cn('flex-1 text-left', isActive && 'font-semibold')}>{s.label}</span>
              {isActive && <Check className="h-3 w-3 text-primary shrink-0" />}
            </button>
          )
        })}
      </PopoverContent>
    </Popover>
  )
}

function InlineSourcePill({
  lead,
  onChanged,
}: {
  lead: Lead
  onChanged?: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const handle = async (next: LeadSource) => {
    if (next === lead.source) {
      setOpen(false)
      return
    }
    setBusy(true)
    try {
      if (USE_MOCK_DATA) {
        mockSetLeadSource(lead.id, next)
      } else {
        await api.patch(`/leads/${lead.id}`, { source: next })
      }
      toast.success(`Source set to ${next}`)
      onChanged?.()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      toast.error(e?.response?.data?.message ?? 'Failed to update source')
    } finally {
      setBusy(false)
      setOpen(false)
    }
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={busy}
          className={cn(
            'inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 font-mono text-[10px] transition-opacity hover:bg-muted',
            busy && 'opacity-60',
          )}
        >
          {lead.source}
          <ChevronDown className="h-2.5 w-2.5 opacity-70" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-40 p-1 rounded-lg border border-border/60 bg-popover shadow-lg ring-1 ring-black/2"
      >
        <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
          Lead source
        </div>
        <div className="h-px bg-border/60 mb-0.5" />
        {SOURCES.map((s) => {
          const isActive = s.value === lead.source
          return (
            <button
              key={s.value}
              type="button"
              onClick={() => handle(s.value)}
              className={cn(
                'group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors',
                isActive ? 'bg-accent/60 text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              <span className={cn('flex-1 text-left', isActive && 'font-semibold')}>{s.label}</span>
              {isActive && <Check className="h-3 w-3 text-primary shrink-0" />}
            </button>
          )
        })}
      </PopoverContent>
    </Popover>
  )
}

// ── Inline sales-person editor ────────────────────────────────
// Uses the shared SalesPersonPicker (server-side searchable) so the dropdown
// stays performant when the tenant has many salespeople. Optimistic toast on
// success — the parent refetch refreshes the cell.
function InlineSalesPersonPill({
  lead,
  onChanged,
}: {
  lead: Lead
  onChanged?: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)

  const current = lead.assignedToUser
  const handle = async (next: SalesPersonOption | null) => {
    if (!next || next.id === lead.assignedToUserId) {
      setOpen(false)
      return
    }
    setBusy(true)
    try {
      if (USE_MOCK_DATA) {
        mockSetLeadAssignee(lead.id, next)
      } else {
        await api.patch(`/leads/${lead.id}`, { assignedToUserId: next.id })
      }
      toast.success(`Assigned to ${next.name}`)
      onChanged?.()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      toast.error(e?.response?.data?.message ?? 'Failed to update sales person')
    } finally {
      setBusy(false)
      setOpen(false)
    }
  }

  return (
    <SalesPersonPicker
      open={open}
      onOpenChange={setOpen}
      value={lead.assignedToUserId}
      onChange={handle}
      allowClear={false}
      contentClassName="w-64"
      trigger={
        <button
          type="button"
          disabled={busy}
          className={cn(
            'inline-flex max-w-full items-center gap-1.5 rounded-md border border-border px-1.5 py-0.5 text-xs transition-colors hover:bg-muted',
            busy && 'opacity-60',
          )}
        >
          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[9px] font-bold text-primary">
            {current.name.charAt(0).toUpperCase()}
          </span>
          <span className="truncate">{current.name}</span>
          <ChevronDown className="h-2.5 w-2.5 shrink-0 opacity-70" />
        </button>
      }
    />
  )
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}
