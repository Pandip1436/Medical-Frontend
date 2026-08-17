import { useEffect, useRef } from 'react'
import { AlertTriangle } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  PHONE_LABEL_TEXT,
  type PartyPhone,
  isMobileNumber,
  phoneDigits,
  whatsappCapable,
} from '@/lib/phones'

/** Select-option values for the two choices that aren't one of the saved numbers. */
const SAME_AS_PRIMARY = '__primary__'
const OTHER_NUMBER = '__other__'

/**
 * Stored value that means "Other number chosen, nothing typed yet".
 *
 * A single space, deliberately: every submit path already does
 * `whatsappNumber.trim()` before sending, so a half-finished choice collapses to
 * "" — the default — with no extra cleanup and no risk of the sentinel reaching
 * the database. Form reset (which sets '') also lands the field back on Default
 * on its own, which local component state would not do.
 */
const OTHER_PENDING = ' '

/**
 * Digits of a typed WhatsApp number, with a pasted country/trunk prefix removed
 * before the 10-digit cap. Slicing first would keep the wrong end — pasting
 * "+91 98765 43210" would have become "9198765432".
 */
function normalizeTypedWhatsApp(raw: string): string {
  let digits = raw.replace(/\D/g, '')
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2)
  else if (digits.length === 13 && digits.startsWith('091')) digits = digits.slice(3)
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1)
  return digits.slice(0, 10)
}

interface WhatsAppNumberFieldProps {
  /** The party's numbers, as currently edited in the form. */
  phones: PartyPhone[]
  /** Stored override: '' means "use the default", anything else is an explicit number. */
  value: string
  onChange: (next: string) => void
  disabled?: boolean
  className?: string
}

/**
 * Chooses which number WhatsApp messages go to.
 *
 * The old field was a free-text "leave blank to use the phone number above",
 * which stops making sense once a party has several numbers — "above" is
 * ambiguous, and the default silently resolved to whichever number happened to
 * be primary. So this is a picker over the numbers actually entered, plus an
 * "Other number" escape hatch for parties whose WhatsApp lives on a line they
 * don't otherwise give out.
 *
 * Landlines are listed but not selectable: they can't receive WhatsApp, and
 * saying so on the option is more useful than hiding them (the operator can see
 * the number was considered). When a party has NO mobile at all, the field says
 * plainly that WhatsApp is unavailable rather than accepting a value that would
 * fail at send time.
 */
export function WhatsAppNumberField({
  phones,
  value,
  onChange,
  disabled,
  className,
}: WhatsAppNumberFieldProps) {
  const filled = phones.filter((p) => p.number.trim() !== '')
  const capable = whatsappCapable(filled)
  const defaultTarget = capable[0]
  const hasNoMobile = capable.length === 0

  // Map the stored string back onto a select option: blank → default, a number
  // that matches one of the saved entries → that entry, anything else → Other.
  // The pending sentinel has to be tested BEFORE trimming — it is whitespace, so
  // a `!value.trim()` check would read it as "blank" and snap the select back to
  // Default the instant "Other number…" was picked, making the option unusable.
  const typedOther = value.trim()
  const matching = filled.find((p) => phoneDigits(p.number) === phoneDigits(typedOther))
  const selection =
    value === OTHER_PENDING
      ? OTHER_NUMBER
      : !typedOther
        ? SAME_AS_PRIMARY
        : matching
          ? phoneDigits(matching.number)
          : OTHER_NUMBER

  // Put the cursor in the box as soon as "Other number…" is picked — the whole
  // point of that option is that a number is about to be typed. `autoFocus`
  // alone loses the race: Radix returns focus to the select trigger when the
  // dropdown closes, so this runs a tick later to land after that.
  const otherInputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (value !== OTHER_PENDING) return
    const t = setTimeout(() => otherInputRef.current?.focus(), 0)
    return () => clearTimeout(t)
  }, [value])

  // Live validation for the "Other number" box. Blank is allowed — it just means
  // the operator hasn't finished, and the trim on submit turns it back into the
  // default. Anything typed has to be a real mobile, since that is the only kind
  // of number WhatsApp will deliver to. The same rule gates submit in each
  // form's zod schema, both via isMobileNumber so they can't drift.
  const otherError =
    selection === OTHER_NUMBER && typedOther && !isMobileNumber(typedOther)
      ? 'Enter a valid 10-digit Indian mobile number (starting 6–9)'
      : ''

  return (
    <div className={cn('space-y-1.5', className)}>
      <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        WhatsApp Number
      </Label>

      <Select
        value={selection}
        disabled={disabled}
        onValueChange={(v) => {
          if (v === SAME_AS_PRIMARY) return onChange('')
          if (v === OTHER_NUMBER) return onChange(OTHER_PENDING)
          const picked = filled.find((p) => phoneDigits(p.number) === v)
          onChange(picked?.number ?? '')
        }}
      >
        <SelectTrigger className="text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={SAME_AS_PRIMARY}>
            {defaultTarget
              ? `Default — ${defaultTarget.number}`
              : 'Default — no WhatsApp-capable number'}
          </SelectItem>
          {filled.map((p) => {
            const usable = isMobileNumber(p.number)
            return (
              <SelectItem
                key={phoneDigits(p.number)}
                value={phoneDigits(p.number)}
                disabled={!usable}
              >
                {p.number} · {PHONE_LABEL_TEXT[p.label]}
                {!usable && " — landline, can't receive"}
              </SelectItem>
            )
          })}
          <SelectItem value={OTHER_NUMBER}>Other number…</SelectItem>
        </SelectContent>
      </Select>

      {selection === OTHER_NUMBER && (
        <div className="space-y-1">
          <Input
            ref={otherInputRef}
            className="text-sm"
            placeholder="10-digit WhatsApp number"
            inputMode="numeric"
            value={typedOther}
            disabled={disabled}
            error={!!otherError}
            onChange={(e) => onChange(normalizeTypedWhatsApp(e.target.value) || OTHER_PENDING)}
          />
          {otherError ? (
            <p className="text-xs text-destructive">{otherError}</p>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              WhatsApp only works on a mobile number — enter the 10-digit mobile this party
              uses for WhatsApp.
            </p>
          )}
        </div>
      )}

      {hasNoMobile ? (
        <p className="flex items-start gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>
            No mobile number on file — invoices and payment reminders can&apos;t be sent on
            WhatsApp. Add a mobile above, or enter one here.
          </span>
        </p>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          Leave on Default to use {defaultTarget?.number}. Pick another only if this party&apos;s
          WhatsApp is on a different line.
        </p>
      )}
    </div>
  )
}
