import { Star } from 'lucide-react'

import { cn } from '@/lib/utils'
import { PHONE_LABEL_TEXT, phonesForForm } from '@/lib/phones'

interface PhoneListDisplayProps {
  /** A customer or supplier — anything carrying phones / phone / alternatePhone. */
  party: { phones?: unknown; phone?: string | null; alternatePhone?: string | null } | null | undefined
  className?: string
}

/**
 * Read-only rendering of a party's numbers for detail views: primary first with
 * a star, each tagged with its label.
 *
 * Reads through phonesForForm rather than `phones` directly so a party saved
 * before the list existed still shows its `phone` + `alternatePhone` — those
 * records are the majority right after the migration, and a blank contact card
 * would look like data loss.
 */
export function PhoneListDisplay({ party, className }: PhoneListDisplayProps) {
  const phones = phonesForForm(party).filter((p) => p.number.trim() !== '')
  if (phones.length === 0) return <span className="text-muted-foreground/60">—</span>

  const ordered = [...phones].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
  return (
    <span className={cn('flex flex-col gap-0.5', className)}>
      {ordered.map((p) => (
        <span key={p.number} className="flex items-center gap-1.5">
          <span className="font-mono">{p.number}</span>
          <span className="font-sans text-[10px] uppercase tracking-wide text-muted-foreground">
            {PHONE_LABEL_TEXT[p.label]}
          </span>
          {p.isPrimary && ordered.length > 1 && (
            <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" aria-label="Primary" />
          )}
        </span>
      ))}
    </span>
  )
}
