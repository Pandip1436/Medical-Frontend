import { Phone, Plus, Star, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
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
  MAX_PARTY_PHONES,
  PHONE_LABELS,
  PHONE_LABEL_TEXT,
  type PartyPhone,
  type PhoneLabel,
  inferLabel,
  isMobileNumber,
  isValidPhone,
} from '@/lib/phones'

interface PhoneListFieldProps {
  value: PartyPhone[]
  onChange: (next: PartyPhone[]) => void
  /** Per-row error text, keyed by row index — supplied by the form's validation. */
  errors?: Record<number, string | undefined>
  disabled?: boolean
  className?: string
}

/**
 * Editor for a party's phone numbers, shared by the customer and supplier forms.
 *
 * A party can hold several numbers — a mobile, an office landline, a residence
 * line — and exactly one of them is PRIMARY. The primary is what the backend
 * mirrors into the `phone` column, so it is the number shown under the party's
 * name in every list, invoice and search result; the star control is therefore
 * doing something visible, not bookkeeping, and the row says so.
 *
 * Landlines are accepted deliberately: a fair number of customers have no mobile
 * at all. Those rows are tagged "can't receive WhatsApp" rather than rejected,
 * because the number is still how you reach that customer — you just can't
 * message them, which is what the WhatsApp picker then reflects.
 */
export function PhoneListField({
  value,
  onChange,
  errors,
  disabled,
  className,
}: PhoneListFieldProps) {
  const rows = value.length ? value : [{ number: '', label: 'MOBILE' as PhoneLabel, isPrimary: true }]

  function update(index: number, patch: Partial<PartyPhone>) {
    onChange(rows.map((p, i) => (i === index ? { ...p, ...patch } : p)))
  }

  function setPrimary(index: number) {
    onChange(rows.map((p, i) => ({ ...p, isPrimary: i === index })))
  }

  function addRow() {
    if (rows.length >= MAX_PARTY_PHONES) return
    onChange([...rows, { number: '', label: 'MOBILE', isPrimary: false }])
  }

  function removeRow(index: number) {
    const next = rows.filter((_, i) => i !== index)
    if (next.length === 0) {
      onChange([{ number: '', label: 'MOBILE', isPrimary: true }])
      return
    }
    // Removing the primary would leave the party with none, and `phone` is
    // derived from it — promote the first remaining number instead.
    if (!next.some((p) => p.isPrimary)) next[0] = { ...next[0], isPrimary: true }
    onChange(next)
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between">
        <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Phone Numbers<span className="text-rose-500"> *</span>
        </Label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-xs"
          onClick={addRow}
          disabled={disabled || rows.length >= MAX_PARTY_PHONES}
        >
          <Plus className="h-3.5 w-3.5" />
          Add number
        </Button>
      </div>

      <div className="space-y-1.5">
        {rows.map((row, i) => {
          const filled = row.number.trim() !== ''
          const rowError = errors?.[i]
          // Only warn once the row holds a number we can judge — an empty or
          // half-typed row shouldn't shout at the operator mid-keystroke.
          const noWhatsapp = filled && isValidPhone(row.number) && !isMobileNumber(row.number)
          return (
            <div key={i} className="space-y-1">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setPrimary(i)}
                  disabled={disabled || !filled}
                  title={row.isPrimary ? 'Primary number — shown next to the name' : 'Make this the primary number'}
                  aria-label={row.isPrimary ? 'Primary number' : 'Make primary'}
                  aria-pressed={row.isPrimary}
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors lg:h-9',
                    row.isPrimary
                      ? 'border-amber-400 bg-amber-50 text-amber-500 dark:bg-amber-500/10'
                      : 'border-input text-muted-foreground/50 hover:text-amber-500',
                    (disabled || !filled) && 'cursor-not-allowed opacity-50',
                  )}
                >
                  <Star className={cn('h-4 w-4', row.isPrimary && 'fill-current')} />
                </button>

                <Input
                  icon={<Phone />}
                  className="flex-1"
                  placeholder={row.label === 'MOBILE' ? '10-digit mobile' : 'e.g. 0431-3501965'}
                  value={row.number}
                  disabled={disabled}
                  error={!!rowError}
                  onChange={(e) => {
                    const number = e.target.value
                    // Re-infer the label only while the operator hasn't set one
                    // themselves — typing a landline into a fresh Mobile row
                    // shouldn't leave it mislabelled, but an explicit Office
                    // choice must survive the next keystroke.
                    const relabel = row.label === 'MOBILE' && !isMobileNumber(number) && isValidPhone(number)
                    update(i, { number, ...(relabel ? { label: inferLabel(number) } : {}) })
                  }}
                />

                <Select
                  value={row.label}
                  disabled={disabled}
                  onValueChange={(v) => update(i, { label: v as PhoneLabel })}
                >
                  <SelectTrigger className="h-11 w-[7.5rem] shrink-0 text-xs lg:h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PHONE_LABELS.map((l) => (
                      <SelectItem key={l} value={l} className="text-xs">
                        {PHONE_LABEL_TEXT[l]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => removeRow(i)}
                  disabled={disabled || (rows.length === 1 && !filled)}
                  title="Remove this number"
                  aria-label="Remove this number"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              {rowError ? (
                <p className="pl-11 text-xs text-destructive">{rowError}</p>
              ) : row.isPrimary ? (
                <p className="pl-11 text-[11px] text-muted-foreground">
                  Primary — this is the number shown next to the name everywhere.
                </p>
              ) : noWhatsapp ? (
                <p className="pl-11 text-[11px] text-muted-foreground">
                  Landline — can be called, but can&apos;t receive WhatsApp.
                </p>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
