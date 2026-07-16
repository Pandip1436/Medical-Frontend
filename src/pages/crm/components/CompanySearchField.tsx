import { useEffect, useMemo, useState } from 'react'
import { Building2, Search as SearchIcon, X } from 'lucide-react'
import { toast } from 'sonner'

import api from '@/lib/api'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { usePaginatedSearch } from '@/hooks/usePaginatedSearch'
import { USE_MOCK_DATA } from '../mockData'

export interface CompanyOption {
  id: string
  name: string
}

// Lightweight, server-paginated company combo shared by the Add + Edit lead
// drawers. Type to search `/companies`; if the typed name matches nothing you
// can create it inline. Mock mode synthesises an id-name pair so the parent
// form still has something to attach.
export function CompanySearchField({
  value,
  onChange,
}: {
  value: CompanyOption | null
  onChange: (c: CompanyOption | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [creating, setCreating] = useState(false)
  const search = usePaginatedSearch<CompanyOption>({
    endpoint: '/companies',
    pageSize: 20,
    enabled: open,
  })

  useEffect(() => {
    if (open) search.setQuery(text)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text])

  const canCreate = useMemo(
    () =>
      text.trim().length > 0 &&
      !search.items.some((c) => c.name.toLowerCase() === text.trim().toLowerCase()),
    [text, search.items],
  )

  const createCompany = async () => {
    setCreating(true)
    try {
      if (USE_MOCK_DATA) {
        const fake = {
          id: `mock-co-${Date.now()}`,
          name: text.trim(),
        }
        onChange(fake)
        setOpen(false)
      } else {
        const res = await api.post('/companies', { name: text.trim() })
        const created: CompanyOption = res.data
        onChange({ id: created.id, name: created.name })
        setOpen(false)
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      toast.error(e?.response?.data?.message ?? 'Failed to create company')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2 text-left text-sm transition-colors hover:border-border/80',
          !value && 'text-muted-foreground',
        )}
      >
        <span className="flex items-center gap-2">
          <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="truncate">
            {value?.name ?? 'Search and select company…'}
          </span>
        </span>
        {value && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onChange(null)
            }}
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Clear company"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </button>

      {open && (
        <div
          className="absolute z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-border bg-popover shadow-lg"
          onScroll={(e) => {
            const el = e.currentTarget
            if (el.scrollTop + el.clientHeight >= el.scrollHeight - 32) {
              search.loadMore()
            }
          }}
        >
          <div className="sticky top-0 border-b border-border/60 bg-popover px-3 py-2">
            <Input
              icon={<SearchIcon className="h-3.5 w-3.5" />}
              placeholder="Type to search or create…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              autoFocus
            />
          </div>
          {search.items.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                onChange({ id: c.id, name: c.name })
                setOpen(false)
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
            >
              <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="truncate">{c.name}</span>
            </button>
          ))}
          {canCreate && (
            <button
              type="button"
              disabled={creating}
              onClick={createCompany}
              className="sticky bottom-0 w-full border-t border-border/60 bg-popover px-3 py-2 text-left text-sm font-medium text-primary hover:bg-accent disabled:opacity-50"
            >
              {creating ? 'Creating…' : `+ Create "${text.trim()}"`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
