import { DatePicker } from "@/components/ui/date-picker"
import { TimePicker } from "@/components/ui/time-picker"

// DatePicker + TimePicker pair, kept in sync with a single "YYYY-MM-DDTHH:mm"
// string (the same shape native <input type="datetime-local"> uses) so it
// drops into an existing form schema/submit pipeline without any changes.
// Avoids the native datetime-local control's inconsistent, browser-owned
// calendar+scroller popout in favor of the app's own Popover-based pickers.
export interface DateTimeInputProps {
  value?: string
  onChange: (next: string) => void
  disabled?: boolean
  error?: boolean
  className?: string
}

export function DateTimeInput({ value, onChange, disabled, error, className }: DateTimeInputProps) {
  const [datePart, timePart] = splitDatetimeLocal(value)

  const handleDateChange = (next: string) => {
    if (!next) {
      onChange("")
      return
    }
    onChange(`${next}T${timePart || "09:00"}`)
  }

  const handleTimeChange = (t: string) => {
    if (!datePart) {
      // No date yet — default to today so the value is still parseable.
      const today = new Date()
      const pad = (n: number) => String(n).padStart(2, "0")
      const iso = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
      onChange(t ? `${iso}T${t}` : "")
      return
    }
    onChange(t ? `${datePart}T${t}` : "")
  }

  return (
    <div className={className ? className : "flex w-full min-w-0 gap-2"}>
      <div className="min-w-0 flex-1">
        <DatePicker value={datePart} onChange={handleDateChange} disabled={disabled} error={error} />
      </div>
      <div className="w-30 shrink-0">
        <TimePicker value={timePart} onChange={handleTimeChange} disabled={disabled} error={error} />
      </div>
    </div>
  )
}

function splitDatetimeLocal(val?: string): [string, string] {
  if (!val) return ["", ""]
  const [d = "", t = ""] = val.split("T")
  return [d, t.slice(0, 5)]
}
