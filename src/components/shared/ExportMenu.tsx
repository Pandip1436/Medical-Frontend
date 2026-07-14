import { useState } from 'react'
import { toast } from 'sonner'
import { Download, ChevronDown, Printer, FileDown, FileSpreadsheet, Loader2 } from 'lucide-react'
import { Button, type ButtonProps } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { exportToPdf, printReport } from '@/lib/exportUtils'
import { exportToExcel } from '@/lib/excelUtils'

type Row = Record<string, unknown>
export type RowsSource = Row[] | (() => Row[] | Promise<Row[]>)

async function resolveRows(source: RowsSource): Promise<Row[]> {
  return typeof source === 'function' ? await source() : source
}

export interface ExportMenuProps {
  label?: string
  size?: 'sm' | 'default'
  variant?: ButtonProps['variant']
  className?: string
  align?: 'start' | 'end'
  disabled?: boolean

  /** Heading used on the PDF and Print output. */
  title: string
  /** Base filename, no extension. */
  filename: string
  /** Singular noun used in the header caption and toasts, e.g. "invoice". */
  noun?: string
  /** Show an "Export N {noun}s" caption above the items — only when `rows` is a plain array (cheap to count). */
  showCountInHeader?: boolean

  /** Which formats to show — defaults to all three. Use e.g. `['excel']` when Print/PDF can't reflect the full dataset (only a paginated/visible slice) and Excel already exports everything correctly. */
  formats?: Array<'pdf' | 'excel' | 'print'>

  /** Row source for Print + PDF, and for Excel unless `excelRows`/`onExcelExport` is given. Optional only if `formats` excludes every format that would need it. */
  rows?: RowsSource
  /** Override row source for PDF only. */
  pdfRows?: RowsSource
  /** Override row source for the generic flat Excel export. */
  excelRows?: RowsSource

  /** Escape hatch for bespoke exports (e.g. multi-sheet round-trip workbooks) — replaces the built-in Excel wiring and owns its own success toast. */
  onExcelExport?: () => void | Promise<void>
  excelSubtitle?: string

  /** Extra menu items appended after a separator, e.g. Sales' Tally XML export. */
  extraItems?: React.ReactNode
  emptyMessage?: string
}

export function ExportMenu({
  label = 'Export',
  size = 'sm',
  variant = 'outline',
  className,
  align = 'end',
  disabled,
  title,
  filename,
  noun = 'row',
  showCountInHeader,
  formats = ['pdf', 'excel', 'print'],
  rows,
  pdfRows,
  excelRows,
  onExcelExport,
  excelSubtitle = 'Spreadsheet (.xlsx)',
  extraItems,
  emptyMessage,
}: ExportMenuProps) {
  const [busy, setBusy] = useState(false)
  const showPdf = formats.includes('pdf')
  const showExcel = formats.includes('excel')
  const showPrint = formats.includes('print')

  const plural = (n: number) => `${n} ${noun}${n === 1 ? '' : 's'}`
  const noneMessage = emptyMessage ?? `No ${noun}s to export`
  const staticCount = Array.isArray(rows) ? rows.length : null

  async function runExport(kind: 'pdf' | 'excel' | 'print') {
    if (busy) return
    setBusy(true)
    try {
      if (kind === 'excel' && onExcelExport) {
        await onExcelExport()
        return
      }
      const source = kind === 'pdf' ? (pdfRows ?? rows) : kind === 'excel' ? (excelRows ?? rows) : rows
      if (!source) {
        toast.info(noneMessage)
        return
      }
      const resolved = await resolveRows(source)
      if (!resolved.length) {
        toast.info(noneMessage)
        return
      }
      if (kind === 'pdf') {
        exportToPdf(resolved, title, filename)
        toast.success(`Exported ${plural(resolved.length)} to PDF`)
      } else if (kind === 'excel') {
        exportToExcel(resolved, filename)
        toast.success(`Exported ${plural(resolved.length)} to Excel`)
      } else {
        printReport(resolved, title)
      }
    } catch {
      toast.error('Export failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size={size} className={className} disabled={disabled || busy}>
          {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />}
          <span>{label}</span>
          <ChevronDown className="ml-1 h-3.5 w-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-64 p-1.5">
        {showCountInHeader && staticCount !== null && (
          <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            Export {plural(staticCount)}
          </p>
        )}
        {showPdf && (
          <DropdownMenuItem
            className="gap-3 rounded-md py-2 cursor-pointer focus:bg-rose-500/10"
            onClick={() => runExport('pdf')}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400">
              <FileDown className="h-4 w-4" />
            </span>
            <span className="flex flex-col">
              <span className="text-sm font-semibold">PDF</span>
              <span className="text-[11px] text-muted-foreground">Printable summary (.pdf)</span>
            </span>
          </DropdownMenuItem>
        )}
        {showExcel && (
          <DropdownMenuItem
            className="gap-3 rounded-md py-2 cursor-pointer focus:bg-emerald-500/10"
            onClick={() => runExport('excel')}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <FileSpreadsheet className="h-4 w-4" />
            </span>
            <span className="flex flex-col">
              <span className="text-sm font-semibold">Excel</span>
              <span className="text-[11px] text-muted-foreground">{excelSubtitle}</span>
            </span>
          </DropdownMenuItem>
        )}
        {showPrint && (
          <>
            {(showPdf || showExcel) && <DropdownMenuSeparator className="my-1" />}
            <DropdownMenuItem
              className="gap-3 rounded-md py-2 cursor-pointer focus:bg-sky-500/10"
              onClick={() => runExport('print')}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
                <Printer className="h-4 w-4" />
              </span>
              <span className="flex flex-col">
                <span className="text-sm font-semibold">Print</span>
                <span className="text-[11px] text-muted-foreground">Open the browser print dialog</span>
              </span>
            </DropdownMenuItem>
          </>
        )}
        {extraItems && (
          <>
            <DropdownMenuSeparator className="my-1" />
            {extraItems}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
