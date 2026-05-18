import { Mail, MessageCircle, Phone } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn, formatDate } from '@/lib/utils'
import type { Lead, LeadStage } from '../types'

// Stage-keyed badge styles — matches LeadsTable and LeadDetailHeader so the
// rail card colour tracks the lead's actual stage instead of being stuck
// on blue.
const stageStyles: Record<LeadStage, string> = {
  LEAD: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  QUALIFIED: 'bg-purple-500/15 text-purple-700 dark:text-purple-400',
  PROPOSAL: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  NEGOTIATION: 'bg-orange-500/15 text-orange-700 dark:text-orange-400',
  WON: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  LOST: 'bg-rose-500/15 text-rose-700 dark:text-rose-400',
}

interface LeadCompactCardProps {
  lead: Lead
  selected: boolean
  onClick: () => void
}

// Single row in the split view's left rail. Compact info-dense layout —
// avatar, name + lead-id, phone, two status pills, action icons, and a
// timestamp. Mirrors the screenshot's left-rail card pixel-for-pixel.
export function LeadCompactCard({ lead, selected, onClick }: LeadCompactCardProps) {
  const fullName =
    `${lead.contact.firstName ?? ''} ${lead.contact.lastName ?? ''}`.trim() ||
    'IndiaMART Buyer'
  const initial = fullName.charAt(0).toUpperCase()
  const phone = lead.contact.phone
    ? `${lead.contact.phoneCountryCode ?? ''}${lead.contact.phone}`
    : ''
  const waNumber = `${lead.contact.phoneCountryCode?.replace('+', '') ?? ''}${lead.contact.phone}`

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative flex w-full gap-2.5 border-b border-border/40 px-3 py-3 text-left transition-colors',
        selected
          ? 'bg-primary/[0.06] hover:bg-primary/[0.08]'
          : 'hover:bg-muted/40',
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
          selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
        )}
      >
        {initial}
      </div>

      {/* Body */}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-baseline gap-1.5">
            <span className="truncate text-sm font-semibold leading-tight text-foreground">
              {fullName}
            </span>
            <Badge
              variant="secondary"
              size="sm"
              className="font-mono text-[10px] text-muted-foreground"
            >
              {lead.leadNumber}
            </Badge>
          </div>
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {formatDate(lead.createdAt)}
          </span>
        </div>

        {phone && (
          <span className="text-xs text-muted-foreground">{phone}</span>
        )}

        <div className="flex items-center justify-between gap-2">
          {/* Status pills */}
          <div className="flex shrink-0 items-center gap-1.5">
            <Badge size="sm" className={cn('text-[10px] font-medium', stageStyles[lead.stage])}>
              {capitalize(lead.stage)}
            </Badge>
            <Badge
              size="sm"
              className={cn(
                'text-[10px] font-medium',
                lead.touchStatus === 'UNTOUCHED'
                  ? 'bg-orange-500/15 text-orange-700 dark:text-orange-400'
                  : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
              )}
            >
              {lead.touchStatus === 'UNTOUCHED' ? 'Untouched' : 'Touched'}
            </Badge>
          </div>

          {/* Action icons — onClick stopPropagation so they don't fire the row click */}
          <div className="flex shrink-0 items-center gap-0.5">
            {phone && (
              <>
                <IconLink
                  href={`tel:${phone}`}
                  tone="emerald"
                  ariaLabel="Call"
                >
                  <Phone className="h-3 w-3" />
                </IconLink>
                <IconLink
                  href={`https://wa.me/${waNumber}`}
                  tone="emerald"
                  ariaLabel="WhatsApp"
                  external
                >
                  <MessageCircle className="h-3 w-3" />
                </IconLink>
              </>
            )}
            <IconLink
              href={lead.contact.email ? `mailto:${lead.contact.email}` : undefined}
              tone="violet"
              ariaLabel="Email"
            >
              <Mail className="h-3 w-3" />
            </IconLink>
          </div>
        </div>
      </div>
    </button>
  )
}

function IconLink({
  href,
  tone,
  ariaLabel,
  external,
  children,
}: {
  href?: string
  tone: 'emerald' | 'violet'
  ariaLabel: string
  external?: boolean
  children: React.ReactNode
}) {
  const toneClass =
    tone === 'emerald'
      ? 'text-emerald-600 hover:bg-emerald-500/10'
      : 'text-violet-600 hover:bg-violet-500/10'
  const disabled = !href
  if (disabled) {
    return (
      <span
        aria-label={ariaLabel}
        className={cn(
          'inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground/40',
        )}
      >
        {children}
      </span>
    )
  }
  return (
    <a
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noreferrer' : undefined}
      aria-label={ariaLabel}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'inline-flex h-6 w-6 items-center justify-center rounded transition-colors',
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
