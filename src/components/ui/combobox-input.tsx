import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

interface ComboboxInputProps {
  value: string
  onChange: (v: string) => void
  options: readonly string[]
  placeholder?: string
  className?: string
  error?: boolean
  id?: string
}

/**
 * Text input with a portal-positioned filtered dropdown — same visual design
 * as SearchableSelect but allows free typing (custom values not in the list).
 * Used for fields like Manufacturer and Unit of Measure where suggestions help
 * but the list is not an exhaustive whitelist.
 */
export function ComboboxInput({
  value,
  onChange,
  options,
  placeholder = 'Select or type...',
  className,
  error,
  id,
}: ComboboxInputProps) {
  const [open, setOpen] = useState(false)
  const [localValue, setLocalValue] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null)

  // Sync local display value when the parent resets the form
  useEffect(() => { setLocalValue(value) }, [value])

  useLayoutEffect(() => {
    if (!open) return
    const update = () => {
      const el = inputRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      setRect({ top: r.bottom + 4, left: r.left, width: r.width })
    }
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function handle(e: MouseEvent) {
      const t = e.target as Node
      if (inputRef.current?.contains(t) || panelRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  const filtered = localValue.trim()
    ? options.filter(o => o.toLowerCase().includes(localValue.trim().toLowerCase()))
    : options

  return (
    <div className="relative">
      <input
        ref={inputRef}
        id={id}
        value={localValue}
        onChange={e => {
          setLocalValue(e.target.value)
          onChange(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={e => {
          if (panelRef.current?.contains(e.relatedTarget as Node)) return
          setOpen(false)
        }}
        placeholder={placeholder}
        autoComplete="off"
        className={cn(
          'flex h-9 w-full rounded-md border bg-background px-3 py-1 text-sm shadow-sm transition-colors',
          'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1',
          error
            ? 'border-rose-500 focus-visible:ring-rose-500'
            : 'border-input focus-visible:ring-ring',
          className,
        )}
      />
      {open && rect && filtered.length > 0 && createPortal(
        <div
          ref={panelRef}
          // pointerEvents:auto is required because a modal Radix dialog sets
          // `pointer-events:none` on <body>; a panel portaled to <body> would
          // inherit it and become un-clickable/un-scrollable otherwise.
          style={{ position: 'fixed', top: rect.top, left: rect.left, width: Math.max(rect.width, 180), zIndex: 9999, pointerEvents: 'auto' }}
          className="overflow-hidden rounded-md border border-border bg-popover shadow-lg"
          onMouseDown={e => e.preventDefault()}
        >
          <div className="max-h-52 overflow-y-auto">
            {filtered.map(opt => (
              <button
                key={opt}
                type="button"
                onMouseDown={e => {
                  e.preventDefault()
                  onChange(opt)
                  setLocalValue(opt)
                  setOpen(false)
                }}
                className={cn(
                  'flex w-full items-center px-3 py-2 text-left text-sm hover:bg-accent/60',
                  opt === value && 'bg-accent/40 font-medium',
                )}
              >
                <span className="truncate">{opt}</span>
              </button>
            ))}
          </div>
        </div>,
        // Portal into the enclosing modal dialog (if any) rather than <body>:
        // Radix's modal Dialog wraps its content in react-remove-scroll, which
        // preventDefaults wheel/touch events outside that subtree — so a
        // body-level panel can't scroll. The dialog content has no transform,
        // so a position:fixed child stays viewport-anchored and isn't clipped
        // by the dialog's overflow:hidden. Falls back to <body> when not in a
        // dialog (the panel's original behavior).
        inputRef.current?.closest('[role="dialog"]') ?? document.body,
      )}
    </div>
  )
}
