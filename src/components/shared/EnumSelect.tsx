import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export interface EnumOption {
  label: string
  value: string
}

export interface EnumSelectProps {
  label?: string
  options: readonly EnumOption[] | EnumOption[]
  value: string
  onValueChange: (val: string) => void
  placeholder?: string
  clearable?: boolean
  onClear?: () => void
  className?: string
}

export function EnumSelect({
  label,
  options,
  value,
  onValueChange,
  placeholder,
  clearable = true,
  onClear,
  className,
}: EnumSelectProps) {
  // Assuming 'all' or empty string as the unselected value
  const hasValue = clearable && Boolean(value && value !== 'all')

  return (
    <div className={`space-y-1.5 ${className || ''}`}>
      {label && (
        <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </Label>
      )}
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger hasValue={hasValue} onClear={onClear}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
