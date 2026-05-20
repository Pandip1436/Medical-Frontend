import * as React from "react"
import { format, parse, isValid } from "date-fns"
import { Calendar as CalendarIcon, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { useSettingsStore, type DateFormat } from "@/stores/settingsStore"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

const ISO_FMT = "yyyy-MM-dd"

// Map our app-level DateFormat to a date-fns pattern + a human placeholder.
function fmtConfig(dateFormat: DateFormat): { displayFmt: string; placeholder: string; useDdMask: boolean } {
  switch (dateFormat) {
    case 'mm/dd/yyyy':  return { displayFmt: 'MM/dd/yyyy',  placeholder: 'MM/DD/YYYY',  useDdMask: false }
    case 'yyyy-mm-dd':  return { displayFmt: 'yyyy-MM-dd',  placeholder: 'YYYY-MM-DD',  useDdMask: false }
    case 'dd-mmm-yyyy': return { displayFmt: 'dd-MMM-yyyy', placeholder: 'DD-MMM-YYYY', useDdMask: false }
    case 'dd/mm/yyyy':
    default:            return { displayFmt: 'dd/MM/yyyy',  placeholder: 'DD/MM/YYYY',  useDdMask: true }
  }
}

function parseISO(s?: string | null): Date | undefined {
  if (!s) return undefined
  const d = parse(s, ISO_FMT, new Date())
  return isValid(d) ? d : undefined
}

// Try the user's preferred format first, then fall back to other common patterns
// so a user who pastes a date in some other format still gets a valid parse.
function parseFlexible(input: string, displayFmt: string): Date | undefined {
  const s = input.trim()
  if (!s) return undefined
  // Preferred format first; the rest are fallbacks the user might paste.
  const fmts = [
    displayFmt,
    "dd/MM/yyyy", "dd-MM-yyyy", "d/M/yyyy", "d-M-yyyy",
    "MM/dd/yyyy", "yyyy-MM-dd", "dd-MMM-yyyy",
    "ddMMyyyy",
  ]
  // Dedup while preserving order
  const seen = new Set<string>()
  for (const f of fmts) {
    if (seen.has(f)) continue
    seen.add(f)
    const d = parse(s, f, new Date())
    if (isValid(d)) return d
  }
  return undefined
}

// DD/MM/YYYY mask — strips non-digits and re-inserts slashes after positions 2
// and 4. Only applied when the chosen format starts with `dd/` (the layout
// matches digits-only entry). For other formats we let the user type freely.
function applyDateMask(input: string): string {
  const digits = input.replace(/\D/g, "").slice(0, 8)
  if (digits.length <= 2) return digits
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
}

export interface DatePickerProps {
  value?: string | null
  onChange?: (value: string) => void
  min?: string
  max?: string
  disabled?: boolean
  placeholder?: string
  className?: string
  id?: string
  error?: boolean
  clearable?: boolean
  name?: string
}

export const DatePicker = React.forwardRef<HTMLInputElement, DatePickerProps>(
  function DatePicker(
    {
      value,
      onChange,
      min,
      max,
      disabled,
      placeholder,
      className,
      id,
      error,
      clearable = true,
      name,
    },
    ref
  ) {
    // Reactive: when the admin changes the preference, every DatePicker
    // re-renders with the new display format.
    const dateFormat = useSettingsStore((s) => s.generalSettings.dateFormat)
    const { displayFmt, placeholder: defaultPh, useDdMask } = fmtConfig(dateFormat)

    const selected = parseISO(value)
    const minDate = parseISO(min)
    const maxDate = parseISO(max)
    const [open, setOpen] = React.useState(false)
    const [text, setText] = React.useState(
      selected ? format(selected, displayFmt) : ""
    )

    // Re-display in the new format whenever the value OR the format changes.
    React.useEffect(() => {
      const next = selected ? format(selected, displayFmt) : ""
      if (next !== text) setText(next)
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value, displayFmt])

    const commit = (input: string) => {
      const trimmed = input.trim()
      if (!trimmed) {
        onChange?.("")
        return
      }
      const d = parseFlexible(trimmed, displayFmt)
      if (d) {
        onChange?.(format(d, ISO_FMT))
        setText(format(d, displayFmt))
      } else {
        setText(selected ? format(selected, displayFmt) : "")
      }
    }

    const handleClear = (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setText("")
      onChange?.("")
    }

    const matchers = [
      ...(minDate ? [{ before: minDate }] : []),
      ...(maxDate ? [{ after: maxDate }] : []),
    ]

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <div
            className={cn(
              "flex h-11 md:h-9 w-full items-center gap-1 rounded-lg border border-input bg-transparent px-3 text-sm shadow-sm transition-all duration-150",
              "focus-within:border-ring",
              error && "border-destructive",
              disabled && "cursor-not-allowed opacity-50",
              className
            )}
          >
            <PopoverTrigger asChild>
              <button
                type="button"
                disabled={disabled}
                aria-label="Open calendar"
                className="grid size-6 shrink-0 place-items-center rounded-sm opacity-60 hover:opacity-100 disabled:cursor-not-allowed"
              >
                <CalendarIcon className="size-4" />
              </button>
            </PopoverTrigger>
            <input
              ref={ref}
              id={id}
              type="text"
              inputMode={useDdMask ? "numeric" : "text"}
              autoComplete="off"
              value={text}
              disabled={disabled}
              placeholder={placeholder ?? defaultPh}
              onChange={(e) => setText(useDdMask ? applyDateMask(e.target.value) : e.target.value)}
              onBlur={(e) => commit(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  commit((e.target as HTMLInputElement).value)
                }
              }}
              className="flex-1 min-w-0 bg-transparent outline-none placeholder:text-muted-foreground/60 disabled:cursor-not-allowed"
            />
            {text && clearable && !disabled && (
              <button
                type="button"
                tabIndex={-1}
                aria-label="Clear date"
                onClick={handleClear}
                className="grid size-5 shrink-0 place-items-center rounded-sm opacity-50 hover:opacity-100 hover:bg-accent"
              >
                <X className="size-3" />
              </button>
            )}
            {name && <input type="hidden" name={name} value={value ?? ""} />}
          </div>
        </PopoverAnchor>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selected}
            onSelect={(d) => {
              if (d) {
                onChange?.(format(d, ISO_FMT))
                setText(format(d, displayFmt))
              }
              setOpen(false)
            }}
            disabled={matchers.length > 0 ? matchers : undefined}
            defaultMonth={selected ?? minDate ?? maxDate ?? undefined}
            autoFocus
          />
        </PopoverContent>
      </Popover>
    )
  }
)
