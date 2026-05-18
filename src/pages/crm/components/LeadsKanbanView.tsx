import { useMemo, useState } from 'react'
import { Mail, MessageCircle, Phone } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { cn, formatCurrencyCompact, formatDate } from '@/lib/utils'
import api from '@/lib/api'

import type { Lead, LeadStage } from '../types'
import { STAGES } from '../types'
import { USE_MOCK_DATA, mockSetLeadStage } from '../mockData'

interface LeadsKanbanViewProps {
  data: Lead[]
  loading: boolean
  onCardClick: (lead: Lead) => void
  onChanged: () => void
}

// Stage colour tokens — one source of truth for column headers, card
// left-accents and the drop-zone highlights. The shade names match the
// `color` field on STAGES (blue, purple, amber, orange, emerald, rose) so a
// future stage addition stays consistent without touching component code.
const stageTone: Record<
  LeadStage,
  {
    dot: string
    accent: string // left border on card
    softBg: string // column body background tint
    headerBg: string // column header background tint
    pill: string // count pill background
    pillText: string
    dropRing: string // outline shown while dragging over column
  }
> = {
  LEAD: {
    dot: 'bg-blue-500',
    accent: 'border-l-blue-500',
    softBg: 'bg-blue-500/[0.03]',
    headerBg: 'bg-blue-500/10',
    pill: 'bg-blue-500/15',
    pillText: 'text-blue-700 dark:text-blue-400',
    dropRing: 'ring-blue-500/50',
  },
  QUALIFIED: {
    dot: 'bg-purple-500',
    accent: 'border-l-purple-500',
    softBg: 'bg-purple-500/[0.03]',
    headerBg: 'bg-purple-500/10',
    pill: 'bg-purple-500/15',
    pillText: 'text-purple-700 dark:text-purple-400',
    dropRing: 'ring-purple-500/50',
  },
  PROPOSAL: {
    dot: 'bg-amber-500',
    accent: 'border-l-amber-500',
    softBg: 'bg-amber-500/[0.03]',
    headerBg: 'bg-amber-500/10',
    pill: 'bg-amber-500/15',
    pillText: 'text-amber-700 dark:text-amber-400',
    dropRing: 'ring-amber-500/50',
  },
  NEGOTIATION: {
    dot: 'bg-orange-500',
    accent: 'border-l-orange-500',
    softBg: 'bg-orange-500/[0.03]',
    headerBg: 'bg-orange-500/10',
    pill: 'bg-orange-500/15',
    pillText: 'text-orange-700 dark:text-orange-400',
    dropRing: 'ring-orange-500/50',
  },
  WON: {
    dot: 'bg-emerald-500',
    accent: 'border-l-emerald-500',
    softBg: 'bg-emerald-500/[0.03]',
    headerBg: 'bg-emerald-500/10',
    pill: 'bg-emerald-500/15',
    pillText: 'text-emerald-700 dark:text-emerald-400',
    dropRing: 'ring-emerald-500/50',
  },
  LOST: {
    dot: 'bg-rose-500',
    accent: 'border-l-rose-500',
    softBg: 'bg-rose-500/[0.03]',
    headerBg: 'bg-rose-500/10',
    pill: 'bg-rose-500/15',
    pillText: 'text-rose-700 dark:text-rose-400',
    dropRing: 'ring-rose-500/50',
  },
}

const DRAG_MIME = 'application/x-lead-id'

export function LeadsKanbanView({
  data,
  loading,
  onCardClick,
  onChanged,
}: LeadsKanbanViewProps) {
  // Optimistic local mirror — drop a card and it appears in the new column
  // instantly. The mirror is rebuilt whenever the upstream `data` changes,
  // so a successful refetch flushes any temporary view.
  const [optimistic, setOptimistic] = useState<Record<string, LeadStage>>({})

  // Lead-id of the card currently being dragged. Used to dim its source
  // card and to suppress redundant drops onto the same column.
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [hoverStage, setHoverStage] = useState<LeadStage | null>(null)

  const grouped = useMemo(() => {
    const map: Record<LeadStage, Lead[]> = {
      LEAD: [],
      QUALIFIED: [],
      PROPOSAL: [],
      NEGOTIATION: [],
      WON: [],
      LOST: [],
    }
    for (const lead of data) {
      const stage = optimistic[lead.id] ?? lead.stage
      map[stage].push(lead)
    }
    return map
  }, [data, optimistic])

  const handleDrop = async (lead: Lead, nextStage: LeadStage) => {
    if (lead.stage === nextStage && !optimistic[lead.id]) return
    if (optimistic[lead.id] === nextStage) return

    // Optimistic update — show the move immediately.
    setOptimistic((prev) => ({ ...prev, [lead.id]: nextStage }))

    if (USE_MOCK_DATA) {
      // Mutate the in-memory mock list so the refetch result matches the
      // optimistic view (otherwise the card snaps back when data reloads).
      mockSetLeadStage(lead.id, nextStage)
      toast.success(`Moved to ${capitalize(nextStage)}`)
      onChanged()
      return
    }

    try {
      await api.patch(`/leads/${lead.id}`, { stage: nextStage })
      toast.success(`Moved to ${capitalize(nextStage)}`)
      onChanged()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      toast.error(e?.response?.data?.message ?? 'Failed to update stage')
      // Revert by dropping the optimistic entry for this lead.
      setOptimistic((prev) => {
        const { [lead.id]: _drop, ...rest } = prev
        void _drop
        return rest
      })
    }
  }

  return (
    // Horizontal scroll wrapper. min-h-0 + flex-1 lets the columns own
    // their own vertical scroll while the page chrome stays pinned.
    <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-1">
      {STAGES.map((s) => {
        const tone = stageTone[s.value]
        const column = grouped[s.value]
        const totalValue = column.reduce((sum, l) => sum + Number(l.value || 0), 0)
        const isHover = hoverStage === s.value && draggingId

        return (
          <div
            key={s.value}
            className={cn(
              // Each column is a fixed-width vertical flex container that
              // owns its own scroll. Header stays pinned; body scrolls.
              'flex h-full w-72 shrink-0 flex-col overflow-hidden rounded-xl border border-border/50 bg-background transition-shadow',
              isHover && `ring-2 ring-offset-1 ring-offset-background ${tone.dropRing}`,
            )}
            onDragOver={(e) => {
              // Allow drop only when a lead-id payload is present. Calling
              // preventDefault is what actually enables the drop.
              if (!e.dataTransfer.types.includes(DRAG_MIME)) return
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              if (hoverStage !== s.value) setHoverStage(s.value)
            }}
            onDragLeave={(e) => {
              // Only clear hover when leaving the column entirely, not
              // when dragging over a child element.
              const next = e.relatedTarget as Node | null
              if (next && (e.currentTarget as Node).contains(next)) return
              setHoverStage((prev) => (prev === s.value ? null : prev))
            }}
            onDrop={(e) => {
              e.preventDefault()
              const id = e.dataTransfer.getData(DRAG_MIME)
              setHoverStage(null)
              setDraggingId(null)
              if (!id) return
              const lead = data.find((l) => l.id === id)
              if (!lead) return
              handleDrop(lead, s.value)
            }}
          >
            {/* ── Column header ─────────────────────────────────────── */}
            <div className={cn('shrink-0 border-b border-border/40 px-3 py-2.5', tone.headerBg)}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className={cn('h-2 w-2 shrink-0 rounded-full', tone.dot)} />
                  <span className="truncate text-xs font-semibold uppercase tracking-wide text-foreground">
                    {s.label}
                  </span>
                  <Badge
                    size="sm"
                    className={cn(
                      'h-4 shrink-0 px-1.5 text-[10px] font-bold',
                      tone.pill,
                      tone.pillText,
                    )}
                    variant="secondary"
                  >
                    {column.length}
                  </Badge>
                </div>
                <span className="shrink-0 font-mono text-[11px] font-semibold text-muted-foreground">
                  {formatCurrencyCompact(totalValue)}
                </span>
              </div>
            </div>

            {/* ── Column body ───────────────────────────────────────── */}
            <div
              className={cn(
                'flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2',
                tone.softBg,
              )}
            >
              {loading && column.length === 0 ? (
                <>
                  {[0, 1].map((i) => (
                    <div
                      key={i}
                      className="h-24 animate-pulse rounded-lg border border-border/40 bg-muted/40"
                    />
                  ))}
                </>
              ) : column.length === 0 ? (
                // Dashed drop-zone hint. Becomes the entire column body
                // height so it's a forgiving drop target even when empty.
                <div
                  className={cn(
                    'flex min-h-[140px] flex-1 flex-col items-center justify-center rounded-lg border border-dashed text-center text-[11px] text-muted-foreground/70 transition-colors',
                    isHover
                      ? `border-2 ${tone.accent.replace('border-l-', 'border-')} bg-background`
                      : 'border-border/50',
                  )}
                >
                  <span>No leads</span>
                  <span className="text-muted-foreground/50">Drop a card here</span>
                </div>
              ) : (
                column.map((lead) => (
                  <KanbanCard
                    key={lead.id}
                    lead={lead}
                    accent={tone.accent}
                    isDragging={draggingId === lead.id}
                    onClick={() => onCardClick(lead)}
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = 'move'
                      e.dataTransfer.setData(DRAG_MIME, lead.id)
                      setDraggingId(lead.id)
                    }}
                    onDragEnd={() => {
                      setDraggingId(null)
                      setHoverStage(null)
                    }}
                  />
                ))
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Card
// ─────────────────────────────────────────────────────────────

interface KanbanCardProps {
  lead: Lead
  accent: string
  isDragging: boolean
  onClick: () => void
  onDragStart: (e: React.DragEvent<HTMLButtonElement>) => void
  onDragEnd: () => void
}

function KanbanCard({
  lead,
  accent,
  isDragging,
  onClick,
  onDragStart,
  onDragEnd,
}: KanbanCardProps) {
  const fullName =
    `${lead.contact.firstName ?? ''} ${lead.contact.lastName ?? ''}`.trim() ||
    'Lead'
  const initial = fullName.charAt(0).toUpperCase()
  const phone = lead.contact.phone
    ? `${lead.contact.phoneCountryCode ?? ''}${lead.contact.phone}`
    : ''
  const waNumber = `${lead.contact.phoneCountryCode?.replace('+', '') ?? ''}${lead.contact.phone}`
  const assigneeInitial = (lead.assignedToUser?.name ?? '?').charAt(0).toUpperCase()

  return (
    <button
      type="button"
      draggable
      onClick={onClick}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        // The button itself is the draggable + clickable surface. cursor-grab
        // signals draggability; the activestate flips to grabbing.
        'group relative flex w-full flex-col gap-2 rounded-lg border border-border/60 border-l-[3px] bg-background p-2.5 text-left shadow-sm transition-all hover:border-border hover:shadow-md active:cursor-grabbing',
        accent,
        isDragging && 'opacity-40',
      )}
    >
      {/* Top row — avatar + name + lead-id */}
      <div className="flex items-start gap-2">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
          {initial}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-w-0 items-baseline gap-1.5">
            <span className="truncate text-sm font-semibold leading-tight text-foreground">
              {fullName}
            </span>
          </div>
          <span className="truncate font-mono text-[10px] text-muted-foreground">
            {lead.leadNumber}
          </span>
        </div>
        <span className="shrink-0 font-mono text-xs font-semibold text-foreground">
          {formatCurrencyCompact(lead.value)}
        </span>
      </div>

      {/* Title (requirement) — clamp to 2 lines */}
      {lead.title && (
        <p className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">
          {lead.title}
        </p>
      )}

      {/* Footer row — source pill + contact icons + assignee + date */}
      <div className="mt-auto flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <Badge
            size="sm"
            variant="secondary"
            className="h-4 px-1.5 text-[9px] font-bold uppercase tracking-wide"
          >
            {lead.source}
          </Badge>
          {phone && (
            <>
              <ContactIconLink
                href={`tel:${phone}`}
                tone="emerald"
                ariaLabel="Call"
              >
                <Phone className="h-3 w-3" />
              </ContactIconLink>
              <ContactIconLink
                href={`https://wa.me/${waNumber}`}
                tone="emerald"
                ariaLabel="WhatsApp"
                external
              >
                <MessageCircle className="h-3 w-3" />
              </ContactIconLink>
            </>
          )}
          {lead.contact.email && (
            <ContactIconLink
              href={`mailto:${lead.contact.email}`}
              tone="violet"
              ariaLabel="Email"
            >
              <Mail className="h-3 w-3" />
            </ContactIconLink>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span
            title={lead.assignedToUser?.name ?? 'Unassigned'}
            className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground"
          >
            {assigneeInitial}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {formatDate(lead.createdAt)}
          </span>
        </div>
      </div>
    </button>
  )
}

function ContactIconLink({
  href,
  tone,
  ariaLabel,
  external,
  children,
}: {
  href: string
  tone: 'emerald' | 'violet'
  ariaLabel: string
  external?: boolean
  children: React.ReactNode
}) {
  const toneClass =
    tone === 'emerald'
      ? 'text-emerald-600 hover:bg-emerald-500/10'
      : 'text-violet-600 hover:bg-violet-500/10'
  return (
    <a
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noreferrer' : undefined}
      aria-label={ariaLabel}
      // stopPropagation so the card's onClick doesn't fire when the user
      // taps a contact icon. The button's draggable handler is unaffected.
      onClick={(e) => e.stopPropagation()}
      // Inline-block <a> inside a <button> is technically invalid HTML, but
      // browsers tolerate it and React doesn't warn. Acceptable for the
      // pragmatic gain: one click target per icon, no nested button.
      className={cn(
        'inline-flex h-5 w-5 items-center justify-center rounded transition-colors',
        toneClass,
      )}
    >
      {children}
    </a>
  )
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}
