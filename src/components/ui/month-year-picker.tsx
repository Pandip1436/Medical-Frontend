import * as React from "react"
import { Calendar as CalendarIcon, X, ChevronLeft, ChevronRight, ChevronDown } from "lucide-react"

import { cn, endOfMonthISO, formatExpiry } from "@/lib/utils"
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

// Month/year picker for pharma expiry. A drug expires by MONTH — the exact day
// is meaningless — so this captures MM/YYYY and emits an ISO yyyy-mm-dd pinned
// to the LAST day of that month (via endOfMonthISO), which keeps day-granular
// FEFO / isExpired logic correct (stock is sellable through its expiry month).
// Prop shape mirrors DatePicker so it's a drop-in in the GRN keyboard chain.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

function parseYM(v?: string | null): { month: number; year: number } | null {
  if (!v) return null
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return null
  return { month: d.getMonth() + 1, year: d.getFullYear() }
}

// Mask free text into MM/YYYY: digits only, slash after the 2-digit month.
function applyMonthMask(input: string): string {
  const digits = input.replace(/\D/g, "").slice(0, 6)
  if (digits.length <= 2) return digits
  return `${digits.slice(0, 2)}/${digits.slice(2)}`
}

// Parse "MM/YYYY" (or "M/YYYY", "MMYYYY") into {month, year} or null.
function parseMonthText(input: string): { month: number; year: number } | null {
  const s = input.trim()
  if (!s) return null
  const digits = s.replace(/\D/g, "")
  let month: number, year: number
  if (digits.length === 6) {
    month = Number(digits.slice(0, 2))
    year = Number(digits.slice(2))
  } else {
    const m = s.match(/^(\d{1,2})\D+(\d{4})$/)
    if (!m) return null
    month = Number(m[1])
    year = Number(m[2])
  }
  if (!(month >= 1 && month <= 12) || !(year >= 1900 && year <= 9999)) return null
  return { month, year }
}

export interface MonthYearPickerProps {
  value?: string | null
  onChange?: (isoEndOfMonth: string) => void
  // ISO yyyy-mm-dd floor — the selected month's end must be on/after this.
  min?: string
  disabled?: boolean
  placeholder?: string
  className?: string
  id?: string
  error?: boolean
  clearable?: boolean
  onEnterKey?: () => void
  dataField?: string
}

export const MonthYearPicker = React.forwardRef<HTMLInputElement, MonthYearPickerProps>(
  function MonthYearPicker(
    { value, onChange, min, disabled, placeholder, className, id, error, clearable = true, onEnterKey, dataField },
    ref,
  ) {
    const parsed = parseYM(value)
    const [open, setOpen] = React.useState(false)
    const [yearOpen, setYearOpen] = React.useState(false)
    const [text, setText] = React.useState(parsed ? formatExpiry(value!) : "")
    const [viewYear, setViewYear] = React.useState(parsed?.year ?? new Date().getFullYear())

    // Re-sync the text when the external value changes.
    React.useEffect(() => {
      setText(value ? formatExpiry(value) : "")
      const p = parseYM(value)
      if (p) setViewYear(p.year)
    }, [value])

    // Emit end-of-month ISO, honouring min. Returns whether a value committed.
    const commitYM = (month: number, year: number): boolean => {
      const iso = endOfMonthISO(year, month)
      if (min && iso < min) {
        // Out of range — revert display to the last valid value.
        setText(value ? formatExpiry(value) : "")
        return false
      }
      onChange?.(iso)
      setText(`${String(month).padStart(2, "0")}/${year}`)
      return true
    }

    const commitText = (input: string): boolean => {
      const trimmed = input.trim()
      if (!trimmed) {
        onChange?.("")
        return false
      }
      const ym = parseMonthText(trimmed)
      if (!ym) {
        setText(value ? formatExpiry(value) : "")
        return false
      }
      return commitYM(ym.month, ym.year)
    }

    const handleClear = (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setText("")
      onChange?.("")
    }

    const minYM = parseYM(min)
    const isMonthDisabled = (month: number, year: number) =>
      endOfMonthISO(year, month) < (min ?? "")
    // Years offered in the dropdown start at the min year (no past years) and
    // run 20 years out — expiry is always in the future.
    const floorYear = minYM?.year ?? new Date().getFullYear()
    const yearOptions = Array.from({ length: 21 }, (_, i) => floorYear + i)

    return (
      <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setYearOpen(false) }}>
        <PopoverAnchor asChild>
          <div
            className={cn(
              "flex h-11 md:h-9 w-full items-center gap-1 rounded-lg border border-input bg-transparent px-3 text-sm shadow-sm transition-all duration-150",
              "focus-within:border-ring",
              error && "border-destructive",
              disabled && "cursor-not-allowed opacity-50",
              className,
            )}
          >
            <PopoverTrigger asChild>
              <button
                type="button"
                disabled={disabled}
                aria-label="Open month picker"
                className="grid size-6 shrink-0 place-items-center rounded-sm opacity-60 hover:opacity-100 disabled:cursor-not-allowed"
              >
                <CalendarIcon className="size-4" />
              </button>
            </PopoverTrigger>
            <input
              ref={ref}
              id={id}
              data-field={dataField}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={text}
              disabled={disabled}
              placeholder={placeholder ?? "MM/YYYY"}
              onChange={(e) => setText(applyMonthMask(e.target.value))}
              onBlur={(e) => commitText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  const val = (e.target as HTMLInputElement).value
                  const committed = commitText(val)
                  // Advance the keyboard chain on a valid commit OR when the
                  // field is left empty (nothing to reject) — so an unfilled
                  // expiry doesn't trap focus and block the jump to the next
                  // product row. Only a non-empty, unparseable value stays put.
                  if (committed || !val.trim()) onEnterKey?.()
                }
              }}
              className="flex-1 min-w-0 bg-transparent outline-none placeholder:text-muted-foreground/60 disabled:cursor-not-allowed"
            />
            {text && clearable && !disabled && (
              <button
                type="button"
                tabIndex={-1}
                aria-label="Clear expiry"
                onClick={handleClear}
                className="grid size-5 shrink-0 place-items-center rounded-sm opacity-50 hover:opacity-100 hover:bg-accent"
              >
                <X className="size-3" />
              </button>
            )}
          </div>
        </PopoverAnchor>
        <PopoverContent className="w-56 p-2" align="start">
          <div className="mb-2 flex items-center justify-between gap-1">
            <button
              type="button"
              aria-label="Previous year"
              disabled={viewYear <= floorYear}
              onClick={() => setViewYear((y) => Math.max(floorYear, y - 1))}
              className="grid size-7 place-items-center rounded-md hover:bg-accent disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronLeft className="size-4" />
            </button>
            <div className="relative flex-1">
              <button
                type="button"
                aria-label="Select year"
                onClick={() => setYearOpen((o) => !o)}
                className="flex w-full items-center justify-center gap-1 rounded-md border border-input bg-transparent px-2 py-1 text-sm font-semibold tabular-nums outline-none hover:bg-accent focus:border-ring"
              >
                {viewYear}
                <ChevronDown className="size-3.5 opacity-60" />
              </button>
              {yearOpen && (
                <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-44 overflow-auto rounded-md border border-border bg-popover p-1 shadow-md">
                  {yearOptions.map((y) => (
                    <button
                      key={y}
                      type="button"
                      onClick={() => { setViewYear(y); setYearOpen(false) }}
                      className={cn(
                        "block w-full rounded px-2 py-1 text-center text-sm tabular-nums transition-colors",
                        y === viewYear ? "bg-primary text-primary-foreground" : "hover:bg-accent",
                      )}
                    >
                      {y}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              aria-label="Next year"
              onClick={() => setViewYear((y) => y + 1)}
              className="grid size-7 place-items-center rounded-md hover:bg-accent"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {MONTHS.map((label, i) => {
              const month = i + 1
              const disabledCell = isMonthDisabled(month, viewYear)
              const selected = parsed?.month === month && parsed?.year === viewYear
              return (
                <button
                  key={label}
                  type="button"
                  disabled={disabledCell}
                  onClick={() => {
                    if (commitYM(month, viewYear)) setOpen(false)
                  }}
                  className={cn(
                    "rounded-md py-1.5 text-xs font-medium transition-colors",
                    selected
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-accent",
                    disabledCell && "cursor-not-allowed opacity-40 hover:bg-transparent",
                  )}
                >
                  {label}
                </button>
              )
            })}
          </div>
          {minYM && (
            <p className="mt-2 text-[10px] text-muted-foreground">
              Earliest: {String(minYM.month).padStart(2, "0")}/{minYM.year}
            </p>
          )}
        </PopoverContent>
      </Popover>
    )
  },
)
