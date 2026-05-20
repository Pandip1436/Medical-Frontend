import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, type Variants } from 'framer-motion'
import { toast } from 'sonner'
import { Hash, Save, Loader2, FastForward } from 'lucide-react'

import api from '@/lib/api'
import { useBranchRefresh } from '@/hooks/useBranchRefresh'
import {
  DOC_TYPES,
  DOC_TYPE_LABELS,
  FY_FORMATS,
  type ConfigurableDocType,
  type FyFormat,
  renderDocNumber,
} from '@/lib/documentNumbering'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

// ── Types ────────────────────────────────────────────────────────

interface ConfigRow {
  docType: ConfigurableDocType
  template: string
  fyFormat: FyFormat
  padding: number
  currentCounter: number
  nextCounter: number
  isCustomized: boolean
}

// Matches the variants used by other SettingsPage sections.
const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } },
}

// ── Page ─────────────────────────────────────────────────────────

export default function NumberingPage() {
  const [rows, setRows] = useState<ConfigRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [startFromDialog, setStartFromDialog] = useState<{ docType: ConfigurableDocType; current: number } | null>(null)

  const fetchConfigs = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<ConfigRow[]>('/numbering/configs')
      setRows(res.data)
    } catch {
      toast.error('Failed to load numbering config')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchConfigs() }, [fetchConfigs])
  useBranchRefresh(fetchConfigs)

  // ── Editing helpers ────────────────────────────────────────────

  const updateRow = (docType: ConfigurableDocType, patch: Partial<ConfigRow>) => {
    setRows((prev) => prev.map((r) => (r.docType === docType ? { ...r, ...patch } : r)))
  }

  const validateTemplate = (tpl: string): string | null => {
    if (!tpl) return 'Template cannot be empty'
    if (tpl.length > 50) return 'Template max 50 characters'
    if (!/^[A-Za-z0-9/\-_ {}]+$/.test(tpl)) return 'Only letters, digits, / - _ space { } allowed'
    const nn = tpl.match(/\{NN\}/g)?.length ?? 0
    if (nn === 0) return 'Template must contain {NN}'
    if (nn > 1) return 'Template must contain {NN} exactly once'
    const fy = tpl.match(/\{FY\}/g)?.length ?? 0
    if (fy > 1) return 'Template may contain {FY} at most once'
    return null
  }

  const saveAll = async () => {
    // Validate every row first; bail if any are bad
    for (const r of rows) {
      const err = validateTemplate(r.template)
      if (err) {
        toast.error(`${DOC_TYPE_LABELS[r.docType]}: ${err}`)
        return
      }
    }
    setSaving(true)
    try {
      await Promise.all(
        rows.map((r) =>
          api.put(`/numbering/configs/${r.docType}`, {
            template: r.template,
            fyFormat: r.fyFormat,
            padding: r.padding,
          }),
        ),
      )
      toast.success('Numbering settings saved')
      await fetchConfigs()
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────

  return (
    <motion.div variants={itemVariants} className="space-y-4">
      {document.getElementById('settings-save-button-portal') && createPortal(
        <Button
          onClick={saveAll}
          disabled={saving || loading}
          size="sm"
          className="gap-1.5 cursor-pointer h-8"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Numbering
        </Button>,
        document.getElementById('settings-save-button-portal')!,
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 dark:bg-blue-500/15">
              <Hash className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <CardTitle>Document Numbering</CardTitle>
              <CardDescription>
                Configure how invoice, quotation, credit-note, debit-note, PO and GRN numbers are generated.
                Existing documents keep their numbers — changes only affect newly issued ones.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Loading…
            </div>
          ) : (
            <div className="space-y-3">
              {/* Header row (desktop only) */}
              <div className="hidden md:grid grid-cols-[100px_1fr_140px_90px_1fr_180px] gap-3 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <div>Type</div>
                <div>Template</div>
                <div>Year Format</div>
                <div>Padding</div>
                <div>Preview (next #)</div>
                <div className="text-right">Starting Number</div>
              </div>

              {rows.map((row) => (
                <NumberingRow
                  key={row.docType}
                  row={row}
                  onChange={(patch) => updateRow(row.docType, patch)}
                  onOpenStartFrom={() => setStartFromDialog({ docType: row.docType, current: row.currentCounter })}
                  validateTemplate={validateTemplate}
                />
              ))}

              <p className="px-3 pt-2 text-[11px] text-muted-foreground">
                Tokens — <span className="font-mono">{`{FY}`}</span>: financial year (per Year Format),{' '}
                <span className="font-mono">{`{NN}`}</span>: sequence number (padded). Everything else is literal.
                <br />
                <span className="text-muted-foreground/70">
                  Note: Debit Note format also applies to Purchase Returns (they share the same sequence).
                </span>
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {startFromDialog && (
        <StartFromDialog
          docType={startFromDialog.docType}
          currentCounter={startFromDialog.current}
          onClose={() => setStartFromDialog(null)}
          onSaved={async () => { setStartFromDialog(null); await fetchConfigs() }}
        />
      )}
    </motion.div>
  )
}

// ── One row ──────────────────────────────────────────────────────

function NumberingRow({
  row,
  onChange,
  onOpenStartFrom,
  validateTemplate,
}: {
  row: ConfigRow
  onChange: (patch: Partial<ConfigRow>) => void
  onOpenStartFrom: () => void
  validateTemplate: (tpl: string) => string | null
}) {
  const error = useMemo(() => validateTemplate(row.template), [row.template, validateTemplate])

  // Preview using the row's NEXT counter so admins see exactly what the next
  // issued document will look like.
  const preview = useMemo(() => {
    if (error) return '—'
    try {
      return renderDocNumber(row.template, row.fyFormat, row.padding, row.nextCounter)
    } catch {
      return '—'
    }
  }, [row.template, row.fyFormat, row.padding, row.nextCounter, error])

  return (
    <div className="rounded-xl border border-border/60 bg-muted/10 p-3 dark:bg-muted/5">
      <div className="grid grid-cols-1 md:grid-cols-[100px_1fr_140px_90px_1fr_180px] gap-3 items-start">
        {/* Type */}
        <div>
          <Badge variant="info" size="sm" className="font-mono">{row.docType}</Badge>
          <p className="mt-1 text-[10px] text-muted-foreground">{DOC_TYPE_LABELS[row.docType]}</p>
        </div>

        {/* Template */}
        <div>
          <Label className="md:hidden text-[10px] text-muted-foreground">Template</Label>
          <Input
            value={row.template}
            onChange={(e) => onChange({ template: e.target.value })}
            className="font-mono text-xs"
            placeholder="e.g. HS/INV/{FY}/{NN}"
            error={!!error}
          />
          {error && <p className="text-[10px] text-destructive mt-1">{error}</p>}
        </div>

        {/* Year Format */}
        <div>
          <Label className="md:hidden text-[10px] text-muted-foreground">Year Format</Label>
          <Select
            value={row.fyFormat}
            onValueChange={(v) => onChange({ fyFormat: v as FyFormat })}
          >
            <SelectTrigger className="h-9 cursor-pointer text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FY_FORMATS.map((f) => <SelectItem key={f} value={f} className="font-mono text-xs">{f}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Padding */}
        <div>
          <Label className="md:hidden text-[10px] text-muted-foreground">Padding</Label>
          <Input
            type="number"
            min={1}
            max={10}
            value={row.padding}
            onChange={(e) => onChange({ padding: Math.min(10, Math.max(1, Number(e.target.value) || 1)) })}
            className="text-center"
          />
        </div>

        {/* Preview */}
        <div className="flex flex-col justify-center">
          <Label className="md:hidden text-[10px] text-muted-foreground">Preview (next #)</Label>
          <code className="rounded-md bg-background border border-border/60 px-2 py-1.5 text-xs font-mono">
            {preview}
          </code>
          <p className="text-[10px] text-muted-foreground/70 mt-0.5">
            Current: #{row.currentCounter} → Next: #{row.nextCounter}
          </p>
        </div>

        {/* Starting Number */}
        <div className="md:text-right">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 h-8 cursor-pointer"
            onClick={onOpenStartFrom}
          >
            <FastForward className="h-3.5 w-3.5" />
            Skip to…
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Skip-forward dialog ──────────────────────────────────────────

function StartFromDialog({
  docType,
  currentCounter,
  onClose,
  onSaved,
}: {
  docType: ConfigurableDocType
  currentCounter: number
  onClose: () => void
  onSaved: () => void
}) {
  const minValue = currentCounter + 1
  const [value, setValue] = useState<string>(String(minValue))
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    const n = Number(value)
    if (!Number.isInteger(n) || n < minValue) {
      toast.error(`Starting number must be at least ${minValue} (skip-forward only)`)
      return
    }
    setSaving(true)
    try {
      await api.put(`/numbering/configs/${docType}/start-from`, { startFrom: n })
      toast.success(`Next ${docType} number will be ${n}`)
      onSaved()
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Failed to update starting number')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Skip {DOC_TYPE_LABELS[docType]} numbering forward</DialogTitle>
          <DialogDescription>
            The next {docType} document will use this number. <strong>Skip-forward only</strong> —
            you can jump ahead but cannot go below the current counter ({currentCounter}). This is
            useful when migrating from a previous system or aligning to legacy books.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label htmlFor="startFrom">Next number</Label>
          <Input
            id="startFrom"
            type="number"
            min={minValue}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="font-mono"
          />
          <p className="text-xs text-muted-foreground">
            Must be ≥ <span className="font-mono">{minValue}</span>. Counter currently at{' '}
            <span className="font-mono">{currentCounter}</span>.
          </p>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
            Update
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
