import { useEffect, useRef, useState } from 'react'
import {
  ChevronLeft,
  Mail,
  MessageCircle,
  Phone,
  Search,
  Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

import api from '@/lib/api'
import { cn } from '@/lib/utils'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'

import { LeadCompactCard } from './LeadCompactCard'
import { LeadDetailHeader } from './LeadDetailHeader'
import { LeadTabs, type LeadDetailTab } from './LeadTabs'

import {
  LeadDetailsTab,
  ActivityTab,
  QuotationsTab,
  InvoicesTab,
  ProductsTab,
  FollowUpsTab,
} from '../tabs'

import { useLeadDetail } from '../hooks/useLeadDetail'
import { useLeadsList } from '../hooks/useLeadsList'
import { USE_MOCK_DATA, mockDeleteLead } from '../mockData'
import type { Lead, LeadTab } from '../types'

interface LeadsSplitViewProps {
  // Initial selection passed in by the page (e.g. from URL ?leadId=).
  selectedLeadId: string | null
  onSelectLead: (id: string | null) => void
  // Returns to plain list view from the back arrow.
  onExitSplitView: () => void
  // Opens the ContactDetailsDrawer for the currently selected lead. The page
  // owns the drawer so opening it from anywhere is consistent.
  onViewContact: (contactId: string) => void
  // Currently active tab pill on the page. The rail filters its leads by
  // this so the top bar's pills (All / Open / Untouched / Lead / Qualified /
  // …) still drive what shows up in split view.
  tab?: LeadTab
}

/**
 * Two-column shell: left rail with the compact lead list + right panel
 * with the active lead's detail (header, quick actions, tabs).
 *
 * The left rail uses the same `useLeadsList` hook as the list view so all
 * filters/search behave identically. The right panel mounts `useLeadDetail`
 * with the currently selected lead id; switching leads re-fetches just the
 * detail (the left rail stays mounted with its scroll position intact).
 *
 * Active tab is preserved across lead-switches (per the agreed spec) — when
 * you click a different lead while on "Activity", you stay on Activity but
 * see the new lead's data.
 */
export function LeadsSplitView({
  selectedLeadId,
  onSelectLead,
  onExitSplitView,
  onViewContact,
  tab,
}: LeadsSplitViewProps) {
  const list = useLeadsList({ tab })
  const detail = useLeadDetail(selectedLeadId)
  const [activeTab, setActiveTab] = useState<LeadDetailTab>('details')
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)

  const sentinelRef = useRef<HTMLDivElement>(null)
  const pendingLoadRef = useRef(false)

  // useLeadsList only consumes `tab` as the initial value, so push every
  // subsequent change from the parent into the rail's internal state.
  // Without this, clicking the tab pills on the page leaves the split-view
  // rail stuck on whatever tab it was first mounted with.
  useEffect(() => {
    if (tab) list.setTab(tab)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  // When the list changes (filter/tab applied), keep the selection if it's
  // still visible; otherwise snap to the first item in the new list.
  useEffect(() => {
    if (list.data.length === 0) return
    if (selectedLeadId && list.data.some(l => l.id === selectedLeadId)) return
    onSelectLead(list.data[0].id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.data])

  // Reset the "pending" guard once a loadMore request finishes.
  useEffect(() => {
    if (!list.loadingMore) pendingLoadRef.current = false
  }, [list.loadingMore])

  // IntersectionObserver: fire loadMore when the sentinel scrolls into view.
  useEffect(() => {
    if (!list.hasMore || !list.loadMore || !sentinelRef.current) return
    const el = sentinelRef.current
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !pendingLoadRef.current) {
          pendingLoadRef.current = true
          list.loadMore()
        }
      },
      { threshold: 0 },
    )
    observer.observe(el)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.hasMore, list.loadMore])

  const handleDelete = () => {
    setDeleteConfirmOpen(true)
  }

  const confirmDelete = async () => {
    if (!detail.lead) return
    try {
      if (USE_MOCK_DATA) {
        mockDeleteLead(detail.lead.id)
      } else {
        await api.delete(`/leads/${detail.lead.id}`)
      }
      toast.success('Lead deleted')
      onSelectLead(null)
      list.refetch()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      toast.error(e?.response?.data?.message ?? 'Failed to delete lead')
    } finally {
      setDeleteConfirmOpen(false)
    }
  }

  return (
    <>
      {/* h-full so we inherit from the page's flex-1 wrapper — no more
          hard-coded viewport math that caused the outer page to scroll when
          the panel was taller than the calculated height. */}
      {/* On mobile it's a SINGLE pane at a time: the rail when nothing is
          selected, the detail once a lead is picked (grid-rows-[1fr] makes that
          one visible pane fill the height so its internal scroll works). On md+
          both panes show side by side as before. */}
      <div className="grid h-full min-h-0 grid-rows-[1fr] grid-cols-1 md:grid-cols-[minmax(240px,32%)_1fr] overflow-hidden rounded-lg border border-border/60 bg-background">
        {/* ── Left rail ── (hidden on mobile once a lead is selected — the
            detail takes over full-screen; the list view is the picker there) */}
        <aside className={cn(
          'min-h-0 min-w-0 flex-col border-r border-border/40',
          selectedLeadId ? 'hidden md:flex' : 'flex',
        )}>
          {/* Header strip — search. Exiting split view lives in the toolbar's
              table/split ViewModeToggle (same onExitSplitView handler) — a
              second exit control here, next to an unrelated local search box,
              was redundant and confusing. */}
          <div className="flex shrink-0 items-center border-b border-border/40 px-3 py-2.5">
            <Input
              icon={<Search className="h-3.5 w-3.5" />}
              placeholder="Search leads…"
              value={list.filters.q}
              onChange={(e) =>
                list.setFilters((prev) => ({ ...prev, q: e.target.value }))
              }
              className="h-8 text-xs"
            />
          </div>
          <div className="shrink-0 border-b border-border/40 bg-muted/15 px-3 py-1.5 text-[11px] text-muted-foreground">
            {list.loading
              ? 'Loading…'
              : `${list.total} lead${list.total === 1 ? '' : 's'}`}
          </div>

          {/* Scrollable card list */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {list.loading && list.allData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                Loading…
              </div>
            ) : list.allData.length === 0 ? (
              <div className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
                No leads match the current filters
              </div>
            ) : (
              <>
                {list.allData.map((lead) => (
                  <LeadCompactCard
                    key={lead.id}
                    lead={lead}
                    selected={lead.id === selectedLeadId}
                    onClick={() => onSelectLead(lead.id)}
                  />
                ))}
                <div ref={sentinelRef} className="h-1" />
                {list.loadingMore && (
                  <div className="flex justify-center py-3">
                    <span className="text-[11px] text-muted-foreground">Loading more…</span>
                  </div>
                )}
              </>
            )}
          </div>
        </aside>

        {/* ── Right panel ── (on mobile only shown once a lead is selected) */}
        <section className={cn(
          'min-h-0 min-w-0 flex-col',
          selectedLeadId ? 'flex' : 'hidden md:flex',
        )}>
          {/* Mobile-only back bar for the states BEFORE the lead loads (loading
              / error / empty) — otherwise there'd be no way back on a phone,
              since the rail is hidden and the detail header (with its own close
              button) hasn't rendered yet. Once loaded, LeadDetailHeader owns it. */}
          {!detail.lead && (
            <div className="flex shrink-0 items-center gap-2 border-b border-border/40 px-3 py-2.5 md:hidden">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onExitSplitView}
                aria-label="Back to list"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground">Back to leads</span>
            </div>
          )}
          {detail.loading && !detail.lead ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Loading lead…
            </div>
          ) : detail.error && !detail.lead ? (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-rose-600 dark:text-rose-400">
              {detail.error}
            </div>
          ) : !detail.lead ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
              <Sparkles className="h-8 w-8 opacity-40" />
              <p>Select a lead on the left to see its details</p>
            </div>
          ) : (
            <>
              <LeadDetailHeader
                lead={detail.lead}
                onDelete={handleDelete}
                onClose={onExitSplitView}
              />
              {/* Call / WhatsApp / Email — moved out of the tab strip to their
                  own row directly under the lead's contact details. */}
              <div className="flex shrink-0 items-center gap-1 border-b border-border/40 bg-background px-2 py-1.5">
                <LeadCommIcons lead={detail.lead} />
              </div>
              <LeadTabs
                active={activeTab}
                onChange={setActiveTab}
              >
                {activeTab === 'details' && (
                  <LeadDetailsTab
                    lead={detail.lead}
                    onViewContact={() => onViewContact(detail.lead!.contactId)}
                    onChanged={() => {
                      // Stage / inline edits inside the detail panel need to
                      // ripple back into BOTH the left rail (so the moved lead
                      // shows its new tag) and the right panel (so the pill
                      // itself reflects the new value without a manual reload).
                      list.refetch()
                      detail.refetch()
                    }}
                  />
                )}
                {activeTab === 'activity' && <ActivityTab lead={detail.lead} />}
                {activeTab === 'quotations' && (
                  <QuotationsTab
                    lead={detail.lead}
                    onCreateQuote={() => {
                      stashLeadPrefill(detail.lead!)
                      window.location.href = `/billing/new?type=quotation&leadId=${detail.lead!.id}&t=${Date.now()}`
                    }}
                  />
                )}
                {activeTab === 'invoices' && (
                  <InvoicesTab
                    lead={detail.lead}
                    onCreateInvoice={() => {
                      stashLeadPrefill(detail.lead!)
                      window.location.href = `/billing/new?leadId=${detail.lead!.id}&t=${Date.now()}`
                    }}
                  />
                )}
                {activeTab === 'products' && <ProductsTab lead={detail.lead} />}
                {activeTab === 'followups' && <FollowUpsTab lead={detail.lead} />}
              </LeadTabs>
            </>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title={`Delete lead ${detail.lead?.leadNumber}?`}
        description={`Delete lead ${detail.lead?.leadNumber} (${detail.lead?.title})? This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={confirmDelete}
      />
    </>
  )
}

// Drops a tiny prefill blob into sessionStorage so NewSalePage can hydrate
// the contact + leadId on mount. Kept narrow — just name/phone/email and
// the leadId — anything richer would couple this module to NewSalePage's
// internal state shape.
function stashLeadPrefill(lead: {
  id: string
  contact: {
    firstName: string
    lastName?: string | null
    phone: string
    phoneCountryCode: string
    email?: string | null
  }
}) {
  try {
    sessionStorage.setItem(
      'lead_prefill',
      JSON.stringify({
        leadId: lead.id,
        customerName: `${lead.contact.firstName} ${lead.contact.lastName ?? ''}`.trim(),
        customerPhone: lead.contact.phone,
        customerPhoneCountryCode: lead.contact.phoneCountryCode,
        customerEmail: lead.contact.email ?? '',
      }),
    )
  } catch {
    /* localStorage unavailable — non-fatal, the URL ?leadId= still works */
  }
}

// Call / WhatsApp / Email icon trio rendered at the right edge of the tab
// strip. Replaces the old quick-actions row (Create Quote / Create Invoice
// / Follow Up / Products) — those actions now live inside their respective
// tabs (Quotations / Invoices / Follow Ups) as the primary action button.
function LeadCommIcons({ lead }: { lead: Lead }) {
  const phone = lead.contact.phone
    ? `${lead.contact.phoneCountryCode ?? ''}${lead.contact.phone}`
    : ''
  const waNumber = `${lead.contact.phoneCountryCode?.replace('+', '') ?? ''}${lead.contact.phone}`
  return (
    <>
      <CommIcon
        href={phone ? `tel:${phone}` : undefined}
        tone="emerald"
        ariaLabel="Call"
      >
        <Phone className="h-3.5 w-3.5" />
      </CommIcon>
      <CommIcon
        href={phone ? `https://wa.me/${waNumber}` : undefined}
        tone="emerald"
        ariaLabel="WhatsApp"
        external
      >
        <MessageCircle className="h-3.5 w-3.5" />
      </CommIcon>
      <CommIcon
        href={lead.contact.email ? `mailto:${lead.contact.email}` : undefined}
        tone="violet"
        ariaLabel="Email"
      >
        <Mail className="h-3.5 w-3.5" />
      </CommIcon>
    </>
  )
}

function CommIcon({
  href,
  tone,
  ariaLabel,
  external,
  children,
}: {
  href?: string
  tone: 'emerald' | 'violet'
  ariaLabel: string
  external?: boolean
  children: React.ReactNode
}) {
  const toneClass =
    tone === 'emerald'
      ? 'border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10'
      : 'border-violet-500/30 text-violet-600 hover:bg-violet-500/10'
  if (!href) {
    return (
      <span
        aria-label={ariaLabel}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/40 px-2.5 text-xs font-medium text-muted-foreground/40"
      >
        {children}
        <span>{ariaLabel}</span>
      </span>
    )
  }
  return (
    <a
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noreferrer' : undefined}
      aria-label={ariaLabel}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors',
        toneClass,
      )}
    >
      {children}
      <span>{ariaLabel}</span>
    </a>
  )
}
