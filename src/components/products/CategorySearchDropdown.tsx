import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import type { Category } from '@/types'

export function CategorySearchDropdown({
  categories,
  value,
  onChange,
  hasError,
}: {
  categories: Category[]
  value: string
  onChange: (v: string) => void
  hasError?: boolean
}) {
  const selected = categories.find(c => c.id === value)

  return (
    <Select value={value || '__placeholder__'} onValueChange={v => onChange(v === '__placeholder__' ? '' : v)}>
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
      </SelectContent>
    </Select>
  )
}
