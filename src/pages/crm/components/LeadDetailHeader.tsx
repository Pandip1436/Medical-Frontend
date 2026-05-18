import { Trash2, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn, formatDate } from '@/lib/utils'
import type { Lead, LeadStage } from '../types'

const stageStyles: Record<LeadStage, string> = {
  LEAD: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  QUALIFIED: 'bg-purple-500/15 text-purple-700 dark:text-purple-400',
  PROPOSAL: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  NEGOTIATION: 'bg-rose-500/15 text-rose-700 dark:text-rose-400',
  WON: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  LOST: 'bg-rose-500/15 text-rose-700 dark:text-rose-400',
}

interface LeadDetailHeaderProps {
  lead: Lead
  onDelete: () => void
  onClose: () => void
}

// Top strip of the right detail panel — avatar + name + stage pill + L-ID,
// followed by a dot-separated meta line (phone · source · assignee · created
// · updated). Mirrors screenshot 4 exactly. Sticky inside its parent so it
// stays visible while tab content scrolls below.
export function LeadDetailHeader({ lead, onDelete, onClose }: LeadDetailHeaderProps) {
  const fullName =
    `${lead.contact.firstName ?? ''} ${lead.contact.lastName ?? ''}`.trim() ||
    'IndiaMART Buyer'
  const initial = fullName.charAt(0).toUpperCase()
  const phone = lead.contact.phone
    ? `${lead.contact.phoneCountryCode ?? ''}${lead.contact.phone}`
    : ''

  return (
    <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border/40 bg-background px-5 py-3.5">
      <div className="flex min-w-0 flex-1 items-start gap-2.5">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 className="text-base font-semibold leading-tight text-foreground">
              {fullName}
            </h2>
            <Badge
              size="sm"
              className={cn('text-[10px] font-semibold', stageStyles[lead.stage])}
              variant="secondary"
            >
              {capitalize(lead.stage)}
            </Badge>
            <span className="font-mono text-xs text-muted-foreground">
              {lead.leadNumber}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
            {phone && (
              <>
                <span>{phone}</span>
                <span className="text-muted-foreground/40">·</span>
              </>
            )}
            <span>
              Source: <span className="font-medium text-foreground">{lead.source}</span>
            </span>
            <span className="text-muted-foreground/40">·</span>
            <span>
              Assigned To:{' '}
              <span className="font-medium text-foreground">
                {lead.assignedToUser.name}
              </span>
            </span>
            <span className="text-muted-foreground/40">·</span>
            <span>Created {formatDate(lead.createdAt)}</span>
            <span className="text-muted-foreground/40">·</span>
            <span>Updated {formatDate(lead.updatedAt)}</span>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onDelete}
          aria-label="Delete lead"
          className="text-rose-600 hover:bg-rose-500/10 hover:text-rose-700"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          aria-label="Close detail"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}
