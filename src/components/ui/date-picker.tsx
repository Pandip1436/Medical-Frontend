import * as React from "react"
import { format, parse, isValid } from "date-fns"
import { Calendar as CalendarIcon, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

const ISO_FMT = "yyyy-MM-dd"
const DISPLAY_FMT = "dd/MM/yyyy"

function parseISO(s?: string | null): Date | undefined {
  if (!s) return undefined
  const d = parse(s, ISO_FMT, new Date())
  return isValid(d) ? d : undefined
}

// Accept a few common Indian-format variants when the user types directly.
function parseFlexible(input: string): Date | undefined {
  const s = input.trim()
  if (!s) return undefined
  const fmts = ["dd/MM/yyyy", "dd-MM-yyyy", "d/M/yyyy", "d-M-yyyy", "ddMMyyyy"]
  for (const fmt of fmts) {
    const d = parse(s, fmt, new Date())
    if (isValid(d)) return d
  }
  return undefined
}

// DD/MM/YYYY mask — strips non-digits and re-inserts slashes after positions 2 and 4.
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
      placeholder = "DD/MM/YYYY",
      className,
      id,
      error,
      clearable = true,
      name,
    },
    ref
  ) {
    const selected = parseISO(value)
    const minDate = parseISO(min)
    const maxDate = parseISO(max)
    const [open, setOpen] = React.useState(false)
    const [text, setText] = React.useState(
      selected ? format(selected, DISPLAY_FMT) : ""
    )

    React.useEffect(() => {
      const next = selected ? format(selected, DISPLAY_FMT) : ""
      if (next !== text) setText(next)
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value])

    const commit = (input: string) => {
      const trimmed = input.trim()
      if (!trimmed) {
        onChange?.("")
        return
      }
      const d = parseFlexible(trimmed)
      if (d) {
        onChange?.(format(d, ISO_FMT))
        setText(format(d, DISPLAY_FMT))
      } else {
        setText(selected ? format(selected, DISPLAY_FMT) : "")
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
              inputMode="numeric"
              autoComplete="off"
              value={text}
              disabled={disabled}
              placeholder={placeholder}
              onChange={(e) => setText(applyDateMask(e.target.value))}
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
                setText(format(d, DISPLAY_FMT))
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
