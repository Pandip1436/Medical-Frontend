import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Loader2, Plus, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import api from '@/lib/api'
import { useMasterDataStore } from '@/stores/masterDataStore'
import type { Category } from '@/types'

/**
 * Creatable category combobox.
 * - Type to search existing categories.
 * - If typed text has no exact match, a "+ Create '[text]'" option appears.
 * - Clicking it creates the category via API and auto-selects it — no dialog.
 * - Clear button (×) removes the current selection.
 */
export function CategorySearchDropdown({
  value,
  onChange,
  hasError,
}: {
  value: string
  onChange: (v: string) => void
  hasError?: boolean
}) {
  const categories = useMasterDataStore(s => s.categories)
  const fetchCategories = useMasterDataStore(s => s.fetchCategories)
  useEffect(() => {
    if (categories.length === 0) fetchCategories()
  }, [categories.length, fetchCategories])

  const selected = categories.find(c => c.id === value)

  // inputValue is the visible text in the field; syncs with selected name
  const [inputValue, setInputValue] = useState(selected?.name ?? '')
  useEffect(() => {
    setInputValue(selected?.name ?? '')
  }, [selected?.name])

  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null)

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

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handle(e: MouseEvent) {
      const t = e.target as Node
      if (inputRef.current?.contains(t) || panelRef.current?.contains(t)) return
      // Revert input to the selected category name if user clicked away without picking
      setInputValue(selected?.name ?? '')
      setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open, selected?.name])

  const trimmed = inputValue.trim()
  const filtered = trimmed
    ? categories.filter(c => c.name.toLowerCase().includes(trimmed.toLowerCase()))
    : categories

  const exactMatch = categories.some(c => c.name.toLowerCase() === trimmed.toLowerCase())
  const showCreate = trimmed.length > 0 && !exactMatch

  async function handleCreate() {
    if (!trimmed || creating) return
    setCreating(true)
    try {
      const res = await api.post<Category>('/categories', { name: trimmed }, { suppressGlobalToast: true } as never)
      const created = res.data
      useMasterDataStore.setState(s => ({
        categories: [...s.categories.filter(c => c.id !== created.id), created]
          .sort((a, b) => a.name.localeCompare(b.name)),
      }))
      toast.success(`Category "${created.name}" created`)
      onChange(created.id)
      setInputValue(created.name)
      setOpen(false)
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } }
      toast.error(err?.response?.data?.message ?? 'Failed to create category')
    } finally {
      setCreating(false)
    }
  }

  function handleSelect(c: Category) {
    onChange(c.id)
    setInputValue(c.name)
    setOpen(false)
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation()
    onChange('')
    setInputValue('')
    inputRef.current?.focus()
  }

  return (
    <div className="relative">
      {/* Combobox trigger — styled to match other form inputs */}
      <div className={cn(
        'flex h-9 items-center rounded-md border bg-background px-3 text-sm shadow-sm transition-colors',
        'focus-within:ring-1',
        hasError
          ? 'border-rose-500 focus-within:ring-rose-500'
          : 'border-input focus-within:ring-ring',
      )}>
        <Search className="mr-2 h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
        <input
          ref={inputRef}
          value={inputValue}
          onChange={e => {
            setInputValue(e.target.value)
            if (!e.target.value) onChange('') // clear selection when text is cleared
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault()
              if (filtered.length === 1) {
                handleSelect(filtered[0])
              } else if (showCreate) {
                handleCreate()
              }
            }
            if (e.key === 'Escape') {
              setInputValue(selected?.name ?? '')
              setOpen(false)
            }
          }}
          placeholder="Search or create category…"
          autoComplete="off"
          className="flex-1 bg-transparent placeholder:text-muted-foreground focus:outline-none min-w-0"
        />
        {creating && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground/60 ml-1" />}
        {value && !creating && (
          <button
            type="button"
            tabIndex={-1}
            title="Clear"
            onClick={handleClear}
            className="ml-1 rounded p-0.5 text-muted-foreground/60 hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        {!value && !creating && (
          <ChevronDown className="ml-1 h-4 w-4 shrink-0 text-muted-foreground/60" />
        )}
      </div>

      {/* Portal dropdown */}
      {open && rect && createPortal(
        <div
          ref={panelRef}
          style={{
            position: 'fixed',
            top: rect.top,
            left: rect.left,
            width: Math.max(rect.width, 200),
            zIndex: 9999,
            // Required inside a modal Radix dialog, which sets
            // `pointer-events:none` on <body>; without this the portaled panel
            // inherits it and becomes un-clickable/un-scrollable.
            pointerEvents: 'auto',
          }}
          className="overflow-hidden rounded-md border border-border bg-popover shadow-lg"
          onMouseDown={e => e.preventDefault()}
        >
          <div className="max-h-52 overflow-y-auto">
            {filtered.map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => handleSelect(c)}
                className={cn(
                  'flex w-full items-center px-3 py-2 text-left text-sm hover:bg-accent/60',
                  c.id === value && 'bg-accent/40 font-medium',
                )}
              >
                <span className="truncate">{c.name}</span>
              </button>
            ))}
            {filtered.length === 0 && !showCreate && (
              <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                No categories found
              </div>
            )}
          </div>

          {/* Create option — only shown when typed text has no exact match */}
          {showCreate && (
            <div className="border-t border-border/40">
              <button
                type="button"
                onClick={handleCreate}
                disabled={creating}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-sm font-medium text-primary hover:bg-primary/10 disabled:opacity-50"
              >
                {creating
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Plus className="h-3.5 w-3.5" />}
                <span>Create "{trimmed}"</span>
              </button>
            </div>
          )}
        </div>,
        // Portal into the enclosing modal dialog (if any) rather than <body>:
        // Radix's modal Dialog wraps content in react-remove-scroll, which
        // blocks wheel/touch events outside that subtree — so a body-level
        // panel can't scroll. The dialog content has no transform, so a
        // position:fixed child stays viewport-anchored and isn't clipped by the
        // dialog's overflow:hidden. Falls back to <body> outside a dialog.
        inputRef.current?.closest('[role="dialog"]') ?? document.body,
      )}
    </div>
  )
}
