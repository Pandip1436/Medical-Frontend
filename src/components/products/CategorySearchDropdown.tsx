import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Loader2, Plus, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import api from '@/lib/api'
import { useMasterDataStore } from '@/stores/masterDataStore'
import type { Category } from '@/types'

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

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null)

  const [addOpen, setAddOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)

  useLayoutEffect(() => {
    if (!open) return
    const update = () => {
      const el = triggerRef.current
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
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  const filtered = query.trim()
    ? categories.filter(c => c.name.toLowerCase().includes(query.trim().toLowerCase()))
    : categories

  async function handleSaveCategory() {
    const name = newName.trim()
    if (!name) return
    setSaving(true)
    try {
      const res = await api.post<Category>('/categories', { name }, { suppressGlobalToast: true } as never)
      const created = res.data
      useMasterDataStore.setState(s => ({
        categories: [...s.categories.filter(c => c.id !== created.id), created]
          .sort((a, b) => a.name.localeCompare(b.name)),
      }))
      toast.success(`Category "${created.name}" added`)
      setNewName('')
      setAddOpen(false)
      setTimeout(() => onChange(created.id), 0)
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } }
      toast.error(err?.response?.data?.message ?? 'Failed to add category')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      {/* Trigger button — matches the style of SearchableSelect */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        className={cn(
          'flex h-9 w-full items-center gap-2 rounded-md border bg-background px-3 text-sm shadow-sm transition-colors',
          'hover:border-border/80 focus:outline-none focus-visible:ring-1',
          hasError
            ? 'border-rose-500 focus-visible:ring-rose-500'
            : 'border-input focus-visible:ring-ring',
        )}
      >
        <span className={cn('flex-1 truncate text-left', !selected && 'text-muted-foreground')}>
          {selected ? selected.name : 'Select category…'}
        </span>
        {value && (
          <span
            role="button"
            tabIndex={0}
            title="Clear"
            className="rounded p-0.5 text-muted-foreground/60 hover:bg-accent hover:text-foreground"
            onClick={e => { e.stopPropagation(); onChange('') }}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault(); e.stopPropagation(); onChange('')
              }
            }}
          >
            <X className="h-3.5 w-3.5" />
          </span>
        )}
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground/60" />
      </button>

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
          }}
          className="overflow-hidden rounded-md border border-border bg-popover shadow-lg"
        >
          {/* Search input */}
          <div className="border-b border-border/60 p-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
              <input
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search categories..."
                className="h-8 w-full rounded-md bg-muted/40 pl-8 pr-2 text-xs placeholder:text-muted-foreground/50 focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
          </div>

          {/* Options list */}
          <div className="max-h-52 overflow-y-auto">
            {filtered.map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => { onChange(c.id); setOpen(false) }}
                className={cn(
                  'flex w-full items-center px-3 py-2 text-left text-sm hover:bg-accent/60',
                  c.id === value && 'bg-accent/40 font-medium',
                )}
              >
                <span className="truncate">{c.name}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                No matches for "{query}"
              </div>
            )}
          </div>

          {/* Add new category */}
          <div className="border-t border-border/40 p-1">
            <button
              type="button"
              onClick={() => { setOpen(false); setAddOpen(true) }}
              className="flex w-full items-center gap-1.5 rounded px-3 py-2 text-sm font-semibold text-primary hover:bg-primary/10"
            >
              <Plus className="h-3.5 w-3.5" />
              Add new category
            </button>
          </div>
        </div>,
        document.body,
      )}

      {/* Add-category dialog */}
      <Dialog open={addOpen} onOpenChange={o => { if (!saving) setAddOpen(o) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Category</DialogTitle>
            <DialogDescription>
              Add a new product category. It becomes available for every product immediately.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={e => { e.preventDefault(); e.stopPropagation(); handleSaveCategory() }}
            className="space-y-3"
          >
            <div className="space-y-1.5">
              <Label htmlFor="new-category-name">Category Name *</Label>
              <Input
                id="new-category-name"
                autoFocus
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="e.g. Cardiology, Pediatrics, OTC"
                disabled={saving}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving || !newName.trim()}>
                {saving
                  ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Saving…</>
                  : 'Add Category'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
