import { useState, type ReactNode } from 'react'
import {
  Calendar,
  CheckCircle2,
  ChevronDown,
  Tag,
  User,
  Check,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { DatePicker } from '@/components/ui/date-picker'
import { cn } from '@/lib/utils'
import { SOURCES, STAGES } from '../types'
import type {
  LeadSource,
  LeadStage,
} from '../types'
import { SalesPersonPicker } from './SalesPersonPicker'

interface LeadsFilterChipsProps {
  stage: LeadStage[]
  onStageChange: (next: LeadStage[]) => void
  source: LeadSource[]
  onSourceChange: (next: LeadSource[]) => void
  createdFrom?: string
  createdTo?: string
  onCreatedChange: (from?: string, to?: string) => void
  updatedFrom?: string
  updatedTo?: string
  onUpdatedChange: (from?: string, to?: string) => void
  assignedToUserId?: string
  assignedToUserName?: string
  onAssigneeChange: (next: { id: string; name: string } | null) => void
  /**
   * Optional Columns toggle rendered as the 6th equal-width slot. We accept
   * it as a node (rather than wiring the props through) so the parent owns
   * the visible-columns state and we just place the trigger.
   */
  columnsSlot?: ReactNode
}

export function LeadsFilterChips({
  stage,
  onStageChange,
  source,
  onSourceChange,
  createdFrom,
  createdTo,
  onCreatedChange,
  updatedFrom,
  updatedTo,
  onUpdatedChange,
  assignedToUserId,
  assignedToUserName,
  onAssigneeChange,
  columnsSlot,
}: LeadsFilterChipsProps) {
  // Equal-width grid: 6 slots split evenly across the panel width.
  // Falls back to 2 cols on narrow screens, 3 on tablet, 6 on desktop.
  return (
    <div className="grid grid-cols-1 gap-2 min-[480px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
      {/* Source filter chip */}
      <SourceChip selected={source} onChange={onSourceChange} />

      {/* Stage filter chip */}
      <StageChip selected={stage} onChange={onStageChange} />

      {/* Sales-person chip — server-side searchable picker. The list of
          salespeople is potentially large (tenants with hundreds of reps),
          so the dropdown hits /salespersons?q=… on every keystroke instead
          of loading everything up front. */}
      <SalesPersonChip
        value={assignedToUserId}
        label={assignedToUserName}
        onChange={onAssigneeChange}
      />

      {/* Created date range chip */}
      <DateRangeChip
        label="Created…"
        from={createdFrom}
        to={createdTo}
        onChange={onCreatedChange}
      />

      {/* Updated date range chip */}
      <DateRangeChip
        label="Update…"
        from={updatedFrom}
        to={updatedTo}
        onChange={onUpdatedChange}
      />

      {/* Columns toggle — sixth equal-width slot. Parent owns the state and
          just passes the trigger here so layout stays unified. */}
      {columnsSlot && <div className="*:w-full">{columnsSlot}</div>}
    </div>
  )
}

// ── Source chip + popover ────────────────────────────────────
function SourceChip({
  selected,
  onChange,
}: {
  selected: LeadSource[]
  onChange: (next: LeadSource[]) => void
}) {
  const active = selected.length > 0
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex h-9 w-full items-center justify-between gap-2 rounded-lg border bg-background px-3 text-xs font-medium transition-colors hover:border-border/80',
            active
              ? 'border-primary/30 text-foreground'
              : 'border-border text-muted-foreground hover:text-foreground',
          )}
        >
          <span className="flex items-center gap-2">
            <Tag className="h-3.5 w-3.5" />
            <span>Source</span>
          </span>
          <span className="flex items-center gap-1">
            {active && (
              <Badge variant="info" size="sm" className="h-4 px-1 text-[10px]">
                {selected.length}
              </Badge>
            )}
            <ChevronDown className="h-3 w-3 opacity-60" />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="p-1"
        style={{ width: 'var(--radix-popover-trigger-width)' }}
      >
        <ToggleRow
          label="All Sources"
          checked={selected.length === 0}
          onClick={() => onChange([])}
        />
        {SOURCES.map((s) => {
          const isOn = selected.includes(s.value)
          return (
            <ToggleRow
              key={s.value}
              label={s.label}
              checked={isOn}
              onClick={() => {
                onChange(
                  isOn
                    ? selected.filter((x) => x !== s.value)
                    : [...selected, s.value],
                )
              }}
            />
          )
        })}
      </PopoverContent>
    </Popover>
  )
}

// ── Stage chip + popover (matches screenshot 3) ──────────────
function StageChip({
  selected,
  onChange,
}: {
  selected: LeadStage[]
  onChange: (next: LeadStage[]) => void
}) {
  const active = selected.length > 0
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex h-9 w-full items-center justify-between gap-2 rounded-lg border bg-background px-3 text-xs font-medium transition-colors hover:border-border/80',
            active
              ? 'border-primary/30 text-foreground'
              : 'border-border text-muted-foreground hover:text-foreground',
          )}
        >
          <span className="flex items-center gap-2">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>Stage</span>
          </span>
          <span className="flex items-center gap-1">
            {active && (
              <Badge variant="info" size="sm" className="h-4 px-1 text-[10px]">
                {selected.length}
              </Badge>
            )}
            <ChevronDown className="h-3 w-3 opacity-60" />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="p-1"
        style={{ width: 'var(--radix-popover-trigger-width)' }}
      >
        <ToggleRow
          label="All Stages"
          checked={selected.length === 0}
          onClick={() => onChange([])}
        />
        {STAGES.map((s) => {
          const isOn = selected.includes(s.value)
          return (
            <ToggleRow
              key={s.value}
              label={s.label}
              checked={isOn}
              onClick={() => {
                onChange(
                  isOn
                    ? selected.filter((x) => x !== s.value)
                    : [...selected, s.value],
                )
              }}
            />
          )
        })}
      </PopoverContent>
    </Popover>
  )
}

// ── Date range chip + popover (used for Created… and Update…) ─
function DateRangeChip({
  label,
  from,
  to,
  onChange,
}: {
  label: string
  from?: string
  to?: string
  onChange: (from?: string, to?: string) => void
}) {
  const [localFrom, setLocalFrom] = useState(from ?? '')
  const [localTo, setLocalTo] = useState(to ?? '')
  const active = !!(from || to)
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex h-9 w-full items-center justify-between gap-2 rounded-lg border bg-background px-3 text-xs font-medium transition-colors hover:border-border/80',
            active
              ? 'border-primary/30 text-foreground'
              : 'border-border text-muted-foreground hover:text-foreground',
          )}
        >
          <span className="flex items-center gap-2">
            <Calendar className="h-3.5 w-3.5" />
            <span>{label}</span>
          </span>
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="space-y-2 p-3"
        style={{ width: 'var(--radix-popover-trigger-width)' }}
      >
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            From
          </label>
          <DatePicker value={localFrom} onChange={setLocalFrom} max={localTo || undefined} />
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            To
          </label>
          <DatePicker value={localTo} onChange={setLocalTo} min={localFrom || undefined} />
        </div>
        <div className="flex items-center justify-end gap-1.5 pt-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setLocalFrom('')
              setLocalTo('')
              onChange(undefined, undefined)
            }}
          >
            Clear
          </Button>
          <Button
            size="sm"
            onClick={() =>
              onChange(localFrom || undefined, localTo || undefined)
            }
          >
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ── Sales-person chip (server-side searchable picker) ───────
function SalesPersonChip({
  value,
  label,
  onChange,
}: {
  value?: string
  label?: string
  onChange: (next: { id: string; name: string } | null) => void
}) {
  const active = !!value
  return (
    <SalesPersonPicker
      value={value ?? null}
      onChange={(opt) => onChange(opt ? { id: opt.id, name: opt.name } : null)}
      trigger={
        <button
          type="button"
          className={cn(
            'inline-flex h-9 w-full items-center justify-between gap-2 rounded-lg border bg-background px-3 text-xs font-medium transition-colors hover:border-border/80',
            active
              ? 'border-primary/30 text-foreground'
              : 'border-border text-muted-foreground hover:text-foreground',
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            <User className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {active ? (label ?? 'Sales Person') : 'Sales Person'}
            </span>
          </span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
        </button>
      }
    />
  )
}

function ToggleRow({
  label,
  checked,
  onClick,
}: {
  label: string
  checked: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-accent',
        checked && 'font-semibold text-foreground',
      )}
    >
      <span>{label}</span>
      {checked && <Check className="h-3.5 w-3.5 text-primary" />}
    </button>
  )
}
