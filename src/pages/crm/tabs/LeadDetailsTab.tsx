import { useState } from 'react'
import {
  ArrowRight,
  Check,
  ChevronDown,
  Mail,
  MessageCircle,
  Phone,
} from 'lucide-react'
import { toast } from 'sonner'
import api from '@/lib/api'
import { USE_MOCK_DATA, mockSetLeadStage } from '../mockData'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn, formatCurrency, formatDate } from '@/lib/utils'

import type { Lead, LeadStage } from '../types'
import { STAGES } from '../types'

interface LeadDetailsTabProps {
  lead: Lead
  onViewContact: () => void
  /** Called after a stage-dropdown commit so the parent panel can refetch. */
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

/**
 * The "Lead Details" tab — three stacked cards covering the structured
 * info shown in screenshots 8 and 9. Field labels are uppercase muted;
 * values render below in primary text. Empty values render as `-`.
 *
 * Stage is editable inline via a popover dropdown; the rest are read-only
 * here (full edit flow lives in F8's Add/Edit drawer).
 */
export function LeadDetailsTab({
  lead,
  onViewContact,
  onChanged,
}: LeadDetailsTabProps) {
  const phone = lead.contact.phone
    ? `${lead.contact.phoneCountryCode ?? ''}${lead.contact.phone}`
    : ''
  const waNumber = `${lead.contact.phoneCountryCode?.replace('+', '') ?? ''}${lead.contact.phone}`

  return (
    <div className="space-y-4 p-5">
      {/* ── Card 1: Lead Details ── */}
      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b border-border/40 px-5 py-3">
            <h3 className="text-sm font-semibold">Lead Details</h3>
            <span className="font-mono text-[10px] text-muted-foreground">
              #{lead.id.slice(0, 8)}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 p-5 sm:grid-cols-4">
            <Field label="Title">{lead.title}</Field>
            <Field label="Score">
              <ScoreInline score={lead.score} />
            </Field>
            <Field label="Stage">
              <StagePill
                lead={lead}
                onChanged={onChanged}
              />
            </Field>
            <Field label="Pipeline">{capitalize(lead.pipeline)} Pipeline</Field>

            <Field label="Source">
              <Badge variant="outline" size="sm" className="font-mono text-[10px]">
                {lead.source}
              </Badge>
            </Field>
            <Field label="Assigned To">
              <div className="flex items-center gap-1.5">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
                  {lead.assignedToUser.name.charAt(0).toUpperCase()}
                </div>
                <span className="truncate text-sm">
                  {lead.assignedToUser.name}
                </span>
              </div>
            </Field>
            <Field label="Value">
              {Number(lead.value) > 0
                ? formatCurrency(Number(lead.value))
                : '-'}
            </Field>
            <Field label="Currency">{lead.currency || '-'}</Field>

            <Field label="Expected Close Date">
              {lead.expectedCloseDate ? formatDate(lead.expectedCloseDate) : '-'}
            </Field>
            <Field label="Valid Until">
              {lead.validUntil ? formatDate(lead.validUntil) : '-'}
            </Field>
            <Field label="Linked Company">
              {lead.company?.name ?? '-'}
            </Field>
          </div>
        </CardContent>
      </Card>

      {/* ── Card 2: Contact Information ── */}
      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b border-border/40 px-5 py-3">
            <h3 className="text-sm font-semibold">Contact Information</h3>
            <Button
              variant="ghost"
              size="sm"
              className="h-auto gap-1 text-xs text-primary hover:bg-primary/5"
              onClick={onViewContact}
            >
              <span>View Full Profile</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 p-5 sm:grid-cols-4">
            <Field label="First Name">{lead.contact.firstName || '-'}</Field>
            <Field label="Last Name">{lead.contact.lastName || '-'}</Field>
            <Field label="Email">
              {lead.contact.email ? (
                <a
                  href={`mailto:${lead.contact.email}`}
                  className="flex min-w-0 items-center gap-1.5 text-sm text-primary hover:underline"
                >
                  <span className="min-w-0 truncate">{lead.contact.email}</span>
                  <Mail className="h-3.5 w-3.5 shrink-0 text-primary/70" />
                </a>
              ) : (
                <span>-</span>
              )}
            </Field>
            <Field label="Phone">
              {phone ? (
                <div className="flex items-center gap-2">
                  <a
                    href={`tel:${phone}`}
                    className="text-sm text-primary hover:underline"
                  >
                    {phone}
                  </a>
                  <a
                    href={`tel:${phone}`}
                    className="text-emerald-600 hover:text-emerald-700"
                    aria-label="Call"
                  >
                    <Phone className="h-3.5 w-3.5" />
                  </a>
                  <a
                    href={`https://wa.me/${waNumber}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-emerald-600 hover:text-emerald-700"
                    aria-label="WhatsApp"
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                  </a>
                </div>
              ) : (
                <span>-</span>
              )}
            </Field>

            <Field label="Title/Role">{lead.contact.jobTitle || '-'}</Field>
            <Field label="Company">{lead.company?.name ?? '-'}</Field>
            <Field label="Country">{lead.contact.country || '-'}</Field>
            <Field label="State">{lead.contact.state || '-'}</Field>

            <Field label="City">{lead.contact.city || '-'}</Field>
          </div>
        </CardContent>
      </Card>

      {/* ── Card 3: Requirements (IndiaMART payload) ── */}
      {(lead.externalMessage ||
        lead.externalQueryId ||
        lead.externalProductName) && (
        <Card>
          <CardContent className="p-0">
            <div className="flex items-center justify-between border-b border-border/40 px-5 py-3">
              <div className="flex items-center gap-2">
                <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Requirements</h3>
              </div>
              {lead.externalQueryId && (
                <span className="font-mono text-[10px] text-muted-foreground">
                  IndiaMART · #{lead.externalQueryId}
                </span>
              )}
            </div>

            <div className="space-y-4 p-5">
              {/* Structured fields — same grid pattern as the Lead Details
                  card above so the layout reads consistently. */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
                {lead.externalProductName && (
                  <Field label="Product">{lead.externalProductName}</Field>
                )}
                {lead.externalCategory && (
                  <Field label="Category">{lead.externalCategory}</Field>
                )}
                {(lead.externalCity || lead.externalState) && (
                  <Field label="Location">
                    {[lead.externalCity, lead.externalState]
                      .filter(Boolean)
                      .join(', ')}
                  </Field>
                )}
                <Field label="Type">
                  <Badge variant="outline" size="sm" className="font-mono text-[10px]">
                    Buy Lead
                  </Badge>
                </Field>
              </div>

              {/* Buyer's raw message — narrative portion only. We strip the
                  trailing structured lines (Product:/Category:/Location:/Type:)
                  because they're already shown above as structured Fields. */}
              {lead.externalMessage && (
                <div className="rounded-lg border border-border/40 bg-muted/15 p-4">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Buyer's Message
                  </p>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                    {stripStructuredTrailer(lead.externalMessage)}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// Removes the trailing "Product: …\nCategory: …\nLocation: …\nType: …" block
// from an IndiaMART inquiry message — we already render those as structured
// Field cells above the message, so leaving them in would duplicate the data.
function stripStructuredTrailer(msg: string): string {
  // Walk from the end and drop consecutive lines that look like `Label: value`
  // for one of the known keys. Stop at the first line that doesn't match.
  const known = /^\s*(Product|Category|Location|Type)\s*:/i
  const lines = msg.split('\n')
  while (lines.length > 0 && known.test(lines[lines.length - 1])) {
    lines.pop()
  }
  // Drop trailing blank lines left behind by the strip.
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop()
  }
  return lines.join('\n').trim()
}

// ── helpers ─────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 space-y-1">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <div className="text-sm text-foreground">{children}</div>
    </div>
  )
}

function ScoreInline({ score }: { score: number }) {
  const tone =
    score >= 70
      ? 'bg-emerald-500'
      : score >= 40
        ? 'bg-amber-500'
        : 'bg-rose-500'
  return (
    <div className="flex items-center gap-2">
      <span className={cn('inline-block h-1.5 w-1.5 rounded-full', tone)} />
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full', tone)}
          style={{ width: `${Math.max(0, Math.min(100, score))}%` }}
        />
      </div>
      <span className="font-mono text-sm font-bold tabular-nums">{score}</span>
    </div>
  )
}

function StagePill({
  lead,
  onChanged,
}: {
  lead: Lead
  onChanged?: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const handleChange = async (next: LeadStage) => {
    if (next === lead.stage) {
      setOpen(false)
      return
    }
    setBusy(true)
    try {
      // Mock-data mode: mutate the in-memory list so the refetch picks up
      // the new stage. Without this, the rail / detail snap back to the old
      // value on refetch (because the mock array never changed).
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
            'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold transition-opacity',
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
        className="w-44 p-1 rounded-lg border border-border/60 bg-popover shadow-lg ring-1 ring-black/[0.02]"
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
              onClick={() => handleChange(s.value)}
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

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}
