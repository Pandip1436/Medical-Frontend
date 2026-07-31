import * as React from "react"
import { AlertCircle, CalendarDays, X } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

// Day-of-month picker for recurring monthly schedules (e.g. customer reminders).
// The value is a repeating DAY, not a calendar date, so the pop-up is a
// month-shaped day grid rather than a real calendar — no month/year to pick.
// Callers that need the day to exist in EVERY month (February included) pass
// maxDay={28}; the reminders API enforces exactly that server-side.
// Prop shape mirrors DatePicker/MonthYearPicker so it drops into the same slots.

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"]
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

function parseDay(v: string | number | null | undefined, maxDay: number): number | null {
  if (v === null || v === undefined || v === "") return null
  const n = typeof v === "number" ? v : parseInt(v, 10)
  return Number.isInteger(n) && n >= 1 && n <= maxDay ? n : null
}

export interface DayOfMonthPickerProps {
  // Day as a string (form state) or number. Empty string = unset.
  value?: string | number | null
  // Emits the day as a string ("" when cleared) so it drops straight into
  // string-based form state.
  onChange?: (day: string) => void
  // Highest selectable day. Use 28 for schedules that must fire every month.
  maxDay?: number
  disabled?: boolean
  placeholder?: string
  className?: string
  id?: string
  error?: boolean
  clearable?: boolean
  autoFocus?: boolean
  onEnterKey?: () => void
  dataField?: string
}

export const DayOfMonthPicker = React.forwardRef<HTMLInputElement, DayOfMonthPickerProps>(
  function DayOfMonthPicker(
    { value, onChange, maxDay = 31, disabled, placeholder, className, id, error, clearable = true, autoFocus, onEnterKey, dataField },
    ref,
  ) {
    const days = React.useMemo(() => Array.from({ length: maxDay }, (_, i) => i + 1), [maxDay])
    const [open, setOpen] = React.useState(false)
    const [text, setText] = React.useState(() => {
      const d = parseDay(value, maxDay)
      return d ? String(d) : ""
    })

    // The typed text is the source of truth while editing. An out-of-range entry
    // is KEPT on screen (not silently reverted) and reported inline below the
    // field — the parent is handed "" for it, so an invalid day can never be
    // submitted even though the user still sees what they typed.
    const typed = text.trim()
    const selected = parseDay(typed, maxDay)
    const invalid = typed !== "" && selected === null

    const invalidMessage = !invalid
      ? null
      : Number(typed) > maxDay
        ? `Day must be 1–${maxDay}${maxDay === 28 ? " — use 28 for end-of-month" : ""}`
        : `Day must be 1–${maxDay}`

    // Re-sync when the external value changes — but never wipe an in-progress
    // invalid entry, which is exactly the "" the parent holds while it's shown.
    React.useEffect(() => {
      const d = parseDay(value, maxDay)
      if (d) setText(String(d))
      else setText((t) => (parseDay(t, maxDay) === null && t.trim() !== "" ? t : ""))
    }, [value, maxDay])

    // Emit on every keystroke: the day when valid, "" when not.
    const handleText = (raw: string) => {
      const next = raw.replace(/\D/g, "").slice(0, 2)
      setText(next)
      const d = parseDay(next, maxDay)
      onChange?.(d ? String(d) : "")
    }

    const handleClear = (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setText("")
      onChange?.("")
    }

    return (
      <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <div
            className={cn(
              "flex h-11 md:h-9 w-full items-center gap-1 rounded-lg border border-input bg-transparent px-3 text-sm shadow-sm transition-all duration-150",
              "focus-within:border-ring",
              (error || invalid) && "border-destructive focus-within:border-destructive",
              disabled && "cursor-not-allowed opacity-50",
              className,
            )}
          >
            <PopoverTrigger asChild>
              <button
                type="button"
                disabled={disabled}
                aria-label="Open day picker"
                className="grid size-6 shrink-0 place-items-center rounded-sm opacity-60 hover:opacity-100 disabled:cursor-not-allowed"
              >
                <CalendarDays className="size-4" />
              </button>
            </PopoverTrigger>
            <input
              ref={ref}
              id={id}
              data-field={dataField}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              autoFocus={autoFocus}
              value={text}
              disabled={disabled}
              placeholder={placeholder ?? "Pick a day"}
              aria-invalid={invalid || error || undefined}
              aria-describedby={invalid && id ? `${id}-error` : undefined}
              onChange={(e) => handleText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  // Only advance the keyboard chain once the field is clean —
                  // an out-of-range day keeps focus so the error gets fixed.
                  if (!invalid) onEnterKey?.()
                }
              }}
              className="flex-1 min-w-0 bg-transparent tabular-nums outline-none placeholder:text-muted-foreground/60 disabled:cursor-not-allowed"
            />
            {selected && (
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {ordinal(selected)} monthly
              </span>
            )}
            {text && clearable && !disabled && (
              <button
                type="button"
                tabIndex={-1}
                aria-label="Clear day"
                onClick={handleClear}
                className="grid size-5 shrink-0 place-items-center rounded-sm opacity-50 hover:opacity-100 hover:bg-accent"
              >
                <X className="size-3" />
              </button>
            )}
          </div>
        </PopoverAnchor>
        <PopoverContent className="w-64 p-2" align="start">
          <p className="mb-2 px-0.5 text-[11px] font-semibold text-muted-foreground">
            Repeats on this day every month
          </p>
          <div className="grid grid-cols-7 gap-1">
            {days.map((day) => {
              const isSelected = selected === day
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => {
                    onChange?.(String(day))
                    setText(String(day))
                    setOpen(false)
                  }}
                  className={cn(
                    "grid h-8 place-items-center rounded-md text-xs font-medium tabular-nums transition-colors",
                    isSelected
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-accent",
                  )}
                >
                  {day}
                </button>
              )
            })}
          </div>
          {maxDay === 28 && (
            <p className="mt-2 text-[10px] text-muted-foreground">
              Capped at 28 so it lands in every month — pick 28 for end-of-month.
            </p>
          )}
        </PopoverContent>
      </Popover>
      {invalidMessage && (
        <p id={id ? `${id}-error` : undefined} role="alert" className="flex items-center gap-1 text-[11px] font-medium text-destructive">
          <AlertCircle className="size-3 shrink-0" />
          {invalidMessage}
        </p>
      )}
      </>
    )
  },
)
