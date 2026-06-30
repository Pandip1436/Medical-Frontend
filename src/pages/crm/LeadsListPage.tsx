import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, Plus, Search, SlidersHorizontal, Upload, X, Filter, BarChart3 } from 'lucide-react'
// Import / Export / Add Lead live next to the Filters button now — the top
// bar was tightened by the user to tabs + view-mode toggle + analytics only.
import { AnimatePresence, motion } from 'framer-motion'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { DataTablePagination } from '@/components/shared/DataTablePagination'
import { cn } from '@/lib/utils'
import { navigate, useRoute } from '@/lib/router'

import { LeadsTopBar, type ViewMode } from './components/LeadsTopBar'
import { LeadsFilterChips } from './components/LeadsFilterChips'
import { LeadsKanbanView } from './components/LeadsKanbanView'
import { LeadsTable } from './components/LeadsTable'
import { LeadsSplitView } from './components/LeadsSplitView'
import { BulkActionsBar } from './components/BulkActionsBar'
import {
  ColumnsToggle,
  useVisibleColumns,
} from './components/ColumnsToggle'
import { ContactDetailsDrawer } from './drawers/ContactDetailsDrawer'
import { AddLeadDrawer } from './drawers/AddLeadDrawer'
import { ImportLeadsDrawer } from './drawers/ImportLeadsDrawer'
import { ExportLeadsDrawer } from './drawers/ExportLeadsDrawer'

import { useLeadsList } from './hooks/useLeadsList'
import type { Lead } from './types'

/**
 * /crm/leads — top-level entry for the CRM module.
 *
 * View modes:
 *   - "list"  → full-width LeadsTable (default)
 *   - "split" → LeadsSplitView (left rail of compact cards + right detail panel)
 *   - "kanban"→ not implemented yet (toast placeholder)
 *
 * Selecting a row in list view OR landing on the page with `?leadId=...`
 * automatically switches to split view with that lead selected.
 */
export default function LeadsListPage() {
  const { search } = useRoute()
  const list = useLeadsList()
  const cols = useVisibleColumns()

  const [view, setView] = useState<ViewMode>(() => {
    const stored = localStorage.getItem('pbims_leads_view')
    return (stored as ViewMode) ?? 'list'
  })
  useEffect(() => {
    try { localStorage.setItem('pbims_leads_view', view) } catch { /* noop */ }
  }, [view])

  // Read selected lead id from the URL search string. Single source of truth
  // so deep links / browser back/forward work without extra state.
  const selectedLeadId = useMemo(() => {
    const params = new URLSearchParams(search)
    return params.get('leadId')
  }, [search])

  // Effective view mode: if a lead is selected, force split view regardless
  // of the toggle setting. The toggle reflects the user's preference for
  // when no lead is selected.
  const effectiveView: ViewMode = selectedLeadId ? 'split' : view

  const selectLead = useCallback((id: string | null) => {
    if (window.location.pathname !== '/crm/leads') return
    const params = new URLSearchParams(window.location.search)
    if (id) params.set('leadId', id)
    else params.delete('leadId')
    const qs = params.toString()
    navigate(`/crm/leads${qs ? `?${qs}` : ''}`)
  }, [])

  const [selectedIds, setSelectedIds] = useState<string[]>([])

  // Filter chips row is collapsed by default — matches the DataTableFilterBar
  // pattern used by Suppliers / Sales / Quotations / Credit Notes etc.
  const [filtersOpen, setFiltersOpen] = useState(false)

  // Split mode collapsible panels
  const [splitShowStats, setSplitShowStats] = useState(true)
  const [splitShowFilters, setSplitShowFilters] = useState(false)

  // Auto-open the chips when the user lands on the page with any pre-applied
  // filter (e.g. a deep link). Doesn't re-fire on user toggle.
  useEffect(() => {
    if (list.activeFilterCount > 0 && !filtersOpen) setFiltersOpen(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Clear selection whenever the page or any filter changes — otherwise
  // selections "leak" to rows the user can no longer see.
  useEffect(() => {
    setSelectedIds([])
  }, [list.page, list.tab, list.filters])

  // ── Add Lead drawer + Contact Details drawer + Import/Export drawer state ──
  const [addLeadOpen, setAddLeadOpen] = useState(false)
  const [contactDrawerId, setContactDrawerId] = useState<string | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)

  const handleRowClick = (lead: Lead) => {
    selectLead(lead.id)
  }

  return (
    // Flex column that fills the parent's height (AppLayout already constrains
    // it for compact pages). Only the table body scrolls vertically — top bar,
    // search, filter chips, error banner and pagination all stay pinned via
    // shrink-0. overflow-x-hidden on the page itself; overflow-y is handled
    // by the inner scroll region around <LeadsTable>.
    <div className="flex h-full min-h-0 min-w-0 max-w-full flex-col gap-3 overflow-x-hidden">
      {/* Top bar — title + tabs + view toggles + actions */}
      <LeadsTopBar
        tab={list.tab}
        counts={list.counts}
        onTabChange={list.setTab}
        view={effectiveView}
        onViewChange={(v) => {
          setView(v)
          // Switching out of split clears the selected-lead so the new
          // view actually appears (split is implied by ?leadId in the URL).
          if (v !== 'split' && selectedLeadId) selectLead(null)
        }}
      />

      {/* Search input + Filters toggle — same pattern as DataTableFilterBar.
          Result count lives on the right end of the search input as a suffix.
          Hidden in split view (the rail has its own compact search). */}
      {effectiveView !== 'split' && (
        <>
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <Input
                icon={<Search className="h-4 w-4" />}
                suffix={
                  <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                    {list.loading ? 'Loading…' : `${list.total} leads found`}
                  </span>
                }
                placeholder="Search leads..."
                value={list.filters.q}
                onChange={(e) =>
                  list.setFilters((prev) => ({ ...prev, q: e.target.value }))
                }
              />
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                variant={filtersOpen ? 'default' : 'outline'}
                size="sm"
                className="gap-1.5"
                onClick={() => setFiltersOpen((v) => !v)}
              >
                <SlidersHorizontal className="h-4 w-4" />
                <span className="hidden sm:inline">Filters</span>
                {list.activeFilterCount > 0 && (
                  <Badge
                    variant={filtersOpen ? 'secondary' : 'info'}
                    size="sm"
                    className="ml-0.5"
                  >
                    {list.activeFilterCount}
                  </Badge>
                )}
              </Button>
              {list.activeFilterCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1 text-muted-foreground hover:text-foreground"
                  onClick={() => list.clearFilters()}
                >
                  <X className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Clear</span>
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5"
                onClick={() => setImportOpen(true)}
              >
                <Upload className="h-4 w-4" />
                <span>Import</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5"
                onClick={() => setExportOpen(true)}
              >
                <Download className="h-4 w-4" />
                <span>Export</span>
              </Button>
              <Button
                size="sm"
                className="gap-1.5"
                onClick={() => setAddLeadOpen(true)}
              >
                <Plus className="h-4 w-4" />
                <span>Add Lead</span>
              </Button>
            </div>
          </div>

          {/* Filter chips row — collapsible. AnimatePresence so the height
              animates smoothly when the user toggles. */}
          <AnimatePresence initial={false}>
            {filtersOpen && (
              <motion.div
                key="filters"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                className={cn('overflow-hidden')}
              >
                <div className="rounded-lg border border-border/40 bg-muted/20 p-3">
                  <LeadsFilterChips
                    stage={list.filters.stage}
                    onStageChange={(stage) =>
                      list.setFilters((prev) => ({ ...prev, stage }))
                    }
                    source={list.filters.source}
                    onSourceChange={(source) =>
                      list.setFilters((prev) => ({ ...prev, source }))
                    }
                    createdFrom={list.filters.createdFrom}
                    createdTo={list.filters.createdTo}
                    onCreatedChange={(createdFrom, createdTo) =>
                      list.setFilters((prev) => ({ ...prev, createdFrom, createdTo }))
                    }
                    updatedFrom={list.filters.updatedFrom}
                    updatedTo={list.filters.updatedTo}
                    onUpdatedChange={(updatedFrom, updatedTo) =>
                      list.setFilters((prev) => ({ ...prev, updatedFrom, updatedTo }))
                    }
                    assignedToUserId={list.filters.assignedToUserId}
                    assignedToUserName={list.filters.assignedToUserName}
                    onAssigneeChange={list.setAssignedTo}
                    columnsSlot={
                      <ColumnsToggle visible={cols.visible} onToggle={cols.toggle} />
                    }
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      {/* Error banner */}
      {list.error && (
        <div className="rounded-md border border-rose-300/40 bg-rose-500/5 px-3 py-2 text-xs text-rose-700 dark:text-rose-400">
          {list.error}
        </div>
      )}

      {/* Body — list / kanban / split. flex-1 min-h-0 makes this the
          scrollable region so the top bar / filters / pagination stay
          pinned and only the body scrolls. */}
      {effectiveView === 'split' ? (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          {/* Collapsible stats cards */}
          <AnimatePresence>
            {splitShowStats && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    { label: 'Total Leads', value: list.counts.all, subtitle: 'all leads', iconBg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400', borderAccent: 'border-l-blue-500' },
                    { label: 'Open', value: list.counts.open, subtitle: 'in progress', iconBg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400', borderAccent: 'border-l-amber-500' },
                    { label: 'Qualified', value: list.counts.qualified, subtitle: 'qualified leads', iconBg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', borderAccent: 'border-l-emerald-500' },
                    { label: 'Won', value: list.counts.won, subtitle: 'closed won', iconBg: 'bg-purple-500/10 text-purple-600 dark:text-purple-400', borderAccent: 'border-l-purple-500' },
                  ].map((stat) => (
                    <Card key={stat.label} hover className={cn('border-l-[3px]', stat.borderAccent)}>
                      <CardContent className="flex items-center gap-3 p-3">
                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{stat.label}</p>
                          <p className="text-sm font-bold font-mono leading-tight">{stat.value}</p>
                          <p className="text-[10px] text-muted-foreground">{stat.subtitle}</p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Toolbar row */}
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
            <Button variant="ghost" size="sm" onClick={() => setExportOpen(true)}>
              <Download className="mr-1.5 h-4 w-4" />
              <span className="hidden sm:inline">Export</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              title="Toggle filters"
              onClick={() => setSplitShowFilters(!splitShowFilters)}
              className={cn(splitShowFilters && 'border-primary/50 bg-primary/5')}
            >
              <Filter className="h-4 w-4" />
              {list.activeFilterCount > 0 && (
                <span className="ml-1.5 flex h-4 min-w-4 items-center justify-center rounded bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                  {list.activeFilterCount}
                </span>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              title={splitShowStats ? 'Hide summary stats' : 'Show summary stats'}
              onClick={() => setSplitShowStats(!splitShowStats)}
              className={cn(splitShowStats && 'border-primary/50 bg-primary/5')}
            >
              <BarChart3 className="h-4 w-4" />
            </Button>
            <Button size="sm" onClick={() => setAddLeadOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              <span className="hidden sm:inline">Add Lead</span>
            </Button>
          </div>

          {/* Collapsible filter panel */}
          <AnimatePresence>
            {splitShowFilters && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="rounded-lg border border-border/40 bg-muted/20 p-3">
                  <LeadsFilterChips
                    stage={list.filters.stage}
                    onStageChange={(stage) => list.setFilters((prev) => ({ ...prev, stage }))}
                    source={list.filters.source}
                    onSourceChange={(source) => list.setFilters((prev) => ({ ...prev, source }))}
                    createdFrom={list.filters.createdFrom}
                    createdTo={list.filters.createdTo}
                    onCreatedChange={(createdFrom, createdTo) => list.setFilters((prev) => ({ ...prev, createdFrom, createdTo }))}
                    updatedFrom={list.filters.updatedFrom}
                    updatedTo={list.filters.updatedTo}
                    onUpdatedChange={(updatedFrom, updatedTo) => list.setFilters((prev) => ({ ...prev, updatedFrom, updatedTo }))}
                    assignedToUserId={list.filters.assignedToUserId}
                    assignedToUserName={list.filters.assignedToUserName}
                    onAssigneeChange={list.setAssignedTo}
                  />
                  {list.activeFilterCount > 0 && (
                    <div className="mt-2 flex justify-end border-t border-border/40 pt-2">
                      <Button variant="ghost" size="sm" onClick={() => list.clearFilters()}>
                        <X className="mr-1 h-3.5 w-3.5" />
                        Clear filters
                      </Button>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="min-h-0 flex-1">
            <LeadsSplitView
              selectedLeadId={selectedLeadId}
              onSelectLead={selectLead}
              onExitSplitView={() => {
                selectLead(null)
                setView('list')
              }}
              onViewContact={(contactId) => setContactDrawerId(contactId)}
              tab={list.tab}
            />
          </div>
        </div>
      ) : effectiveView === 'kanban' ? (
        <LeadsKanbanView
          data={list.data}
          loading={list.loading}
          onCardClick={(lead) => selectLead(lead.id)}
          onChanged={() => list.refetch()}
        />
      ) : (
        <>
          <div className="flex min-h-0 flex-1 flex-col">
            <LeadsTable
              data={list.data}
              loading={list.loading}
              visibleColumns={cols.visible}
              selectedIds={selectedIds}
              onSelectionChange={setSelectedIds}
              onSelectAll={(all) => {
                if (all) setSelectedIds(list.data.map((d) => d.id))
                else setSelectedIds([])
              }}
              onRowClick={handleRowClick}
              onChanged={() => list.refetch()}
            />
          </div>
          {list.totalPages > 1 && (
            <div className="shrink-0">
              <DataTablePagination
                currentPage={list.page}
                totalPages={list.totalPages}
                onPageChange={list.setPage}
              />
            </div>
          )}
        </>
      )}

      {/* Drawers */}
      <AddLeadDrawer
        open={addLeadOpen}
        onOpenChange={setAddLeadOpen}
        onCreated={() => {
          list.refetch()
        }}
      />
      <ContactDetailsDrawer
        contactId={contactDrawerId}
        onOpenChange={(open) => {
          if (!open) setContactDrawerId(null)
        }}
      />
      <ImportLeadsDrawer
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={() => list.refetch()}
      />
      <ExportLeadsDrawer
        open={exportOpen}
        onOpenChange={setExportOpen}
        filteredCount={list.total}
        totalCount={null}
        currentFilters={{
          q: list.filters.q,
          tab: list.tab,
          stage: list.filters.stage,
          source: list.filters.source,
          assignedToUserId: list.filters.assignedToUserId,
          createdFrom: list.filters.createdFrom,
          createdTo: list.filters.createdTo,
          updatedFrom: list.filters.updatedFrom,
          updatedTo: list.filters.updatedTo,
        }}
        selectedIds={selectedIds}
      />

      {/* Floating bulk actions — only mounts when rows are selected. Hidden in
          split view because the split view has its own per-lead actions. */}
      {effectiveView !== 'split' && (
        <BulkActionsBar
          selectedIds={selectedIds}
          onClear={() => setSelectedIds([])}
          onChanged={() => list.refetch()}
        />
      )}
    </div>
  )
}
