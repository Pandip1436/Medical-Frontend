import { useState, useEffect } from 'react'
import { Plus, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
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
import api from '@/lib/api'
import { useMasterDataStore } from '@/stores/masterDataStore'
import type { Category } from '@/types'

// Internal sentinel value used only on the "+ Add new category" row. The
// onValueChange handler intercepts it and opens the create-dialog instead of
// applying it as a real selection.
const ADD_NEW_SENTINEL = '__add_new_category__'

export function CategorySearchDropdown({
  value,
  onChange,
  hasError,
}: {
  value: string
  onChange: (v: string) => void
  hasError?: boolean
}) {
  // Subscribe to the store directly (rather than taking categories as a prop):
  // this guarantees the dropdown re-renders the instant a category is added,
  // independent of whether the parent (a react-hook-form Controller) re-renders,
  // and gives every consumer (ProductsPage, NewSale, ProductFormDialog) one
  // shared, always-fresh list.
  const categories = useMasterDataStore(s => s.categories)
  const fetchCategories = useMasterDataStore(s => s.fetchCategories)
  // Some hosts (e.g. ProductsPage) keep their own local category list and never
  // populate the store, so load it here if it's empty — otherwise the dropdown
  // would render blank for them.
  useEffect(() => {
    if (categories.length === 0) fetchCategories()
  }, [categories.length, fetchCategories])
  const selected = categories.find(c => c.id === value)
  const [addOpen, setAddOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSaveCategory() {
    const name = newName.trim()
    if (!name) return
    setSaving(true)
    try {
      const res = await api.post<Category>('/categories', { name })
      const created = res.data
      // Insert into the shared store immediately so this dropdown — and every
      // other category consumer on the page — shows it right away. We add it
      // directly (like addCustomer) instead of refetching: a refetch races with
      // fetchCategories' in-flight dedup and silently fails on any hiccup, which
      // is why the new row sometimes didn't appear until a page reload. Sorted
      // by name to match the server's ordering; deduped in case it already exists.
      useMasterDataStore.setState((s) => ({
        categories: [...s.categories.filter((c) => c.id !== created.id), created]
          .sort((a, b) => a.name.localeCompare(b.name)),
      }))
      toast.success(`Category "${created.name}" added`)
      setNewName('')
      setAddOpen(false)
      // Auto-select AFTER the dialog has closed and the new <SelectItem> is
      // mounted. Doing it inline races with the dialog's focus-restore and the
      // freshly-added option, which left the field unselected. A tick later the
      // option exists and focus has settled, so the value reliably sticks.
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
      <Select
        value={value || '__placeholder__'}
        onValueChange={v => {
          if (v === ADD_NEW_SENTINEL) {
            setAddOpen(true)
            return
          }
          onChange(v === '__placeholder__' ? '' : v)
        }}
      >
        <SelectTrigger className={hasError ? 'border-rose-500 focus:ring-rose-500' : ''}>
          {selected ? selected.name : <span className="text-muted-foreground">Select category…</span>}
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__placeholder__" disabled className="hidden">
            Select category…
          </SelectItem>
          {categories.map(c => (
            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
          ))}
          <SelectItem
            value={ADD_NEW_SENTINEL}
            className="text-primary font-semibold border-t border-border/40 mt-1 pt-2"
          >
            <span className="flex items-center gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              Add new category
            </span>
          </SelectItem>
        </SelectContent>
      </Select>

      <Dialog open={addOpen} onOpenChange={(o) => { if (!saving) setAddOpen(o) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Category</DialogTitle>
            <DialogDescription>
              Add a new product category. It becomes available for every product immediately.
            </DialogDescription>
          </DialogHeader>
          <form
            // stopPropagation is essential: this dialog renders inside the
            // product form's React tree (Radix portals the DOM but React events
            // still bubble through the component tree). Without it, clicking
            // "Add Category" bubbles a submit up to the outer product <form>,
            // firing its validation ("Product name required") and aborting the
            // category add.
            onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); handleSaveCategory() }}
            className="space-y-3"
          >
            <div className="space-y-1.5">
              <Label htmlFor="new-category-name">Category Name *</Label>
              <Input
                id="new-category-name"
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Cardiology, Pediatrics, OTC"
                disabled={saving}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving || !newName.trim()}>
                {saving ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Saving…</> : 'Add Category'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
