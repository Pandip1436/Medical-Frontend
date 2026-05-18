import * as React from "react"
import { Clock, X } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

const HOURS = Array.from({ length: 24 }, (_, i) => i)
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5)

function pad(n: number) {
  return String(n).padStart(2, "0")
}

// HH:MM mask — strip non-digits, clamp the hour to 23 and the minute to 59
// only when the user has typed the full field. Partial typing stays as-is so
// you can still backspace past the colon.
function applyTimeMask(input: string): string {
  const digits = input.replace(/\D/g, "").slice(0, 4)
  if (digits.length <= 2) return digits
  return `${digits.slice(0, 2)}:${digits.slice(2)}`
}

function isValidTime(s: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(s)) return false
  const [h, m] = s.split(":").map(Number)
  return h >= 0 && h <= 23 && m >= 0 && m <= 59
}

export interface TimePickerProps {
  value?: string | null
  onChange?: (value: string) => void
  disabled?: boolean
  placeholder?: string
  className?: string
  id?: string
  error?: boolean
  clearable?: boolean
  name?: string
}

export const TimePicker = React.forwardRef<HTMLInputElement, TimePickerProps>(
  function TimePicker(
    {
      value,
      onChange,
      disabled,
      placeholder = "HH:MM",
      className,
      id,
      error,
      clearable = true,
      name,
    },
    ref,
  ) {
    const normalized = value && isValidTime(value) ? value : ""
    const [open, setOpen] = React.useState(false)
    const [text, setText] = React.useState(normalized)

    React.useEffect(() => {
      if (normalized !== text) setText(normalized)
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value])

    const commit = (input: string) => {
      const trimmed = input.trim()
      if (!trimmed) {
        onChange?.("")
        return
      }
      if (isValidTime(trimmed)) {
        onChange?.(trimmed)
        setText(trimmed)
      } else {
        // Roll back to last good value if the typed text is unparseable.
        setText(normalized)
      }
    }

    const handleClear = (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setText("")
      onChange?.("")
    }

    // Selected hour/minute for the popover lists — falls back to the current
    // wall-clock hour so the popover doesn't open on midnight every time.
    const [curH, curM] = normalized
      ? normalized.split(":").map(Number)
      : [new Date().getHours(), 0]

    const selectHour = (h: number) => {
      const m = isValidTime(normalized) ? Number(normalized.split(":")[1]) : 0
      const next = `${pad(h)}:${pad(m)}`
      onChange?.(next)
      setText(next)
    }
    const selectMinute = (m: number) => {
      const h = isValidTime(normalized)
        ? Number(normalized.split(":")[0])
        : new Date().getHours()
      const next = `${pad(h)}:${pad(m)}`
      onChange?.(next)
      setText(next)
      setOpen(false)
    }

    return (
      <Popover open={open} onOpenChange={setOpen}>
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
                aria-label="Open time picker"
                className="grid size-6 shrink-0 place-items-center rounded-sm opacity-60 hover:opacity-100 disabled:cursor-not-allowed"
              >
                <Clock className="size-4" />
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
              onChange={(e) => setText(applyTimeMask(e.target.value))}
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
                aria-label="Clear time"
                onClick={handleClear}
                className="grid size-5 shrink-0 place-items-center rounded-sm opacity-50 hover:opacity-100 hover:bg-accent"
              >
                <X className="size-3" />
              </button>
            )}
            {name && <input type="hidden" name={name} value={value ?? ""} />}
          </div>
        </PopoverAnchor>
        <PopoverContent className="w-44 p-0" align="start">
          <div className="grid grid-cols-2 divide-x divide-border">
            <ScrollColumn
              label="Hour"
              items={HOURS}
              selected={curH}
              onSelect={selectHour}
              renderItem={(n) => pad(n)}
            />
            <ScrollColumn
              label="Min"
              items={MINUTES}
              selected={curM - (curM % 5)}
              onSelect={selectMinute}
              renderItem={(n) => pad(n)}
            />
          </div>
        </PopoverContent>
      </Popover>
    )
  },
)

function ScrollColumn({
  label,
  items,
  selected,
  onSelect,
  renderItem,
}: {
  label: string
  items: number[]
  selected: number
  onSelect: (n: number) => void
  renderItem: (n: number) => string
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  // Scroll the selected row into view when the popover opens.
  React.useEffect(() => {
    const el = ref.current?.querySelector<HTMLButtonElement>(
      `[data-val="${selected}"]`,
    )
    el?.scrollIntoView({ block: "center" })
  }, [selected])
  return (
    <div className="flex flex-col">
      <div className="border-b border-border px-2 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div ref={ref} className="h-48 overflow-y-auto py-1">
        {items.map((n) => {
          const isSelected = n === selected
          return (
            <button
              key={n}
              type="button"
              data-val={n}
              onClick={() => onSelect(n)}
              className={cn(
                "block w-full px-3 py-1 text-center text-sm hover:bg-accent",
                isSelected && "bg-primary text-primary-foreground hover:bg-primary/90",
              )}
            >
              {renderItem(n)}
            </button>
          )
        })}
      </div>
    </div>
  )
}
