import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { TrendingUp, IndianRupee, FileText, Calendar, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import api from '@/lib/api'

interface ReportRow {
  salespersonId: string
  name: string
  isActive: boolean
  invoiceCount: number
  totalSales: number
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n)
}

export default function SalespersonReportPage() {
  const [rows, setRows] = useState<ReportRow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const fetchReport = async () => {
    setIsLoading(true)
    try {
      const params: any = {}
      if (from) params.from = from
      if (to) params.to = to
      const { data } = await api.get('/salespersons/report', { params })
      setRows(data)
    } catch {
      toast.error('Failed to load report')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { fetchReport() }, [])

  const totalSales = rows.reduce((sum, r) => sum + r.totalSales, 0)
  const totalInvoices = rows.reduce((sum, r) => sum + r.invoiceCount, 0)
  const activeSalespersons = rows.filter((r) => r.isActive).length

  return (
    <div className="flex flex-col h-full">
      {/* Filter bar */}
      <div className="px-4 sm:px-6 py-4 border-b border-border/40">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">From</Label>
            <DatePicker
              value={from}
              onChange={setFrom}
              className="h-9 text-sm w-44"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">To</Label>
            <DatePicker
              value={to}
              onChange={setTo}
              className="h-9 text-sm w-44"
            />
          </div>
          <Button size="sm" onClick={fetchReport} disabled={isLoading}>
            <Calendar className="h-4 w-4 mr-1.5" />
            {isLoading ? 'Loading...' : 'Apply'}
          </Button>
          {(from || to) && (
            <Button size="sm" variant="ghost" onClick={() => { setFrom(''); setTo('') }}>
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="px-4 sm:px-6 py-4 grid grid-cols-3 gap-3 border-b border-border/40">
        <div className="rounded-xl border border-border/40 bg-background p-3">
          <div className="flex items-center gap-2 mb-1">
            <IndianRupee className="h-4 w-4 text-emerald-500" />
            <span className="text-xs text-muted-foreground">Total Sales</span>
          </div>
          <p className="text-base font-bold truncate">{fmt(totalSales)}</p>
        </div>
        <div className="rounded-xl border border-border/40 bg-background p-3">
          <div className="flex items-center gap-2 mb-1">
            <FileText className="h-4 w-4 text-blue-500" />
            <span className="text-xs text-muted-foreground">Invoices</span>
          </div>
          <p className="text-base font-bold">{totalInvoices}</p>
        </div>
        <div className="rounded-xl border border-border/40 bg-background p-3">
          <div className="flex items-center gap-2 mb-1">
            <Users className="h-4 w-4 text-orange-500" />
            <span className="text-xs text-muted-foreground">Active</span>
          </div>
          <p className="text-base font-bold">{activeSalespersons}</p>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-4 sm:px-6 py-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <div className="h-7 w-7 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-3 text-center">
            <TrendingUp className="h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">No data for selected period</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border/40">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/40 bg-muted/30">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">#</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Invoices</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Total Sales</th>
                  <th className="px-4 py-3 text-center font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr
                    key={row.salespersonId}
                    className="border-b border-border/30 hover:bg-muted/20 transition-colors"
                  >
                    <td className="px-4 py-3 text-muted-foreground">{idx + 1}</td>
                    <td className="px-4 py-3 font-medium">{row.name}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{row.invoiceCount}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">
                      {fmt(row.totalSales)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant={row.isActive ? 'success' : 'secondary'} size="sm">
                        {row.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
