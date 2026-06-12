import { useState, useMemo, useEffect, useRef, useCallback, Fragment, createContext, useContext } from 'react'
import { motion, type Variants } from 'framer-motion'
import {
  Package, Clock, IndianRupee, AlertTriangle, ShieldCheck,
  CheckCheck, Trash2, RefreshCw, FileX2, Check, Search, BellOff,
  Inbox, CalendarClock, ChevronDown, ChevronRight, ArrowUpDown, ListFilter,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { cn, timeAgo } from '@/lib/utils'
import { toast } from 'sonner'
import { navigate } from '@/lib/router'
import { useNotificationStore } from '@/stores/notificationStore'
import { useMasterDataStore } from '@/stores/masterDataStore'
import { useAuthStore } from '@/stores/authStore'
import { usePaginatedSearch } from '@/hooks/usePaginatedSearch'
import { usePersistedState } from '@/hooks/usePersistedState'
import type { Notification } from '@/types'
import { isSuperAdmin } from '@/types'

// ─── Category config ──────────────────────────────────────────
type CategoryKey = 'all' | 'LOW_STOCK' | 'EXPIRY' | 'PAYMENT_DUE' | 'APPROVAL' | 'REMINDER'

const CATEGORIES: {
  key: CategoryKey
  label: string
  icon: typeof Package
  accent: string
  roles: string[] | null
}[] = [
  { key: 'all',         label: 'All',         icon: Inbox,         accent: 'text-foreground',                       roles: null },
  { key: 'LOW_STOCK',   label: 'Low Stock',   icon: Package,       accent: 'text-amber-600 dark:text-amber-400',    roles: ['ADMIN', 'PHARMACIST', 'INVENTORY_MANAGER'] },
  { key: 'EXPIRY',      label: 'Expiry',      icon: Clock,         accent: 'text-red-600 dark:text-red-400',        roles: ['ADMIN', 'PHARMACIST', 'INVENTORY_MANAGER'] },
  { key: 'PAYMENT_DUE', label: 'Payment Due', icon: IndianRupee,   accent: 'text-blue-600 dark:text-blue-400',      roles: ['ADMIN', 'PHARMACIST', 'ACCOUNTANT'] },
  { key: 'APPROVAL',    label: 'Requests',    icon: ShieldCheck,   accent: 'text-emerald-600 dark:text-emerald-400', roles: ['ADMIN', 'PHARMACIST', 'INVENTORY_MANAGER'] },
  { key: 'REMINDER',    label: 'Follow-ups',  icon: CalendarClock, accent: 'text-cyan-600 dark:text-cyan-400',      roles: null },
]

const CATEGORY_KEYS: CategoryKey[] = CATEGORIES.map((c) => c.key)

// Sort options for every folder. Server applies the ordering (folders are
// server-paginated, so sorting only the loaded page would be wrong). Unread-first
// is intentionally omitted — the toolbar's Unread/All toggle already covers that.
type SortKey = 'newest' | 'oldest'
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'newest', label: 'Newest first' },
  { key: 'oldest', label: 'Oldest first' },
]

// The active folder is mirrored in the URL (?folder=PAYMENT_DUE) so that
// deep-linking out to an invoice and pressing Back returns to the same folder
// instead of resetting to "All". Reads + validates that param on mount.
function readFolderFromUrl(): CategoryKey {
  const v = new URLSearchParams(window.location.search).get('folder')
  return v && (CATEGORY_KEYS as string[]).includes(v) ? (v as CategoryKey) : 'all'
}

const typeConfig: Record<Notification['type'], { label: string; icon: typeof Package; tone: string }> = {
  LOW_STOCK:   { label: 'Low Stock',   icon: Package,       tone: 'text-amber-600 dark:text-amber-400 bg-amber-500/10' },
  EXPIRY:      { label: 'Expiry',      icon: Clock,         tone: 'text-red-600 dark:text-red-400 bg-red-500/10' },
  PAYMENT_DUE: { label: 'Payment Due', icon: IndianRupee,   tone: 'text-blue-600 dark:text-blue-400 bg-blue-500/10' },
  SYSTEM:      { label: 'System',      icon: AlertTriangle, tone: 'text-purple-600 dark:text-purple-400 bg-purple-500/10' },
  APPROVAL:    { label: 'Approval',    icon: ShieldCheck,   tone: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10' },
}

// Reminders are stored with type SYSTEM + a [reminderId:…] marker
const REMINDER_MARKER = '[reminderId:'
const isReminder = (n: Notification) => n.type === 'SYSTEM' && n.message.includes(REMINDER_MARKER)

const reminderConfig = {
  label: 'Reminder',
  icon: CalendarClock,
  tone: 'text-cyan-600 dark:text-cyan-400 bg-cyan-500/10',
}
const cfgFor = (n: Notification) => (isReminder(n) ? reminderConfig : typeConfig[n.type])

// Resolves a customer's phone for a notification so the UI can show it next to
// the name (and disambiguate two customers with the same name). Order of trust:
// the backend-stamped entityState.customerPhone → entityState.customerId looked
// up in master data → a unique name match in master data. Provided via context
// so the deeply-nested row components don't each subscribe to master data.
type PhoneResolver = (n: Notification, name?: string | null) => string | null
const PhoneCtx = createContext<PhoneResolver>(() => null)
const usePhoneResolver = () => useContext(PhoneCtx)

const SNOOZE_PRESETS: { label: string; hours: number }[] = [
  { label: 'For 1 hour',     hours: 1 },
  { label: 'For 4 hours',    hours: 4 },
  { label: 'Until tomorrow', hours: 24 },
  { label: 'For 1 week',     hours: 24 * 7 },
]

// ─── Action URL resolution ────────────────────────────────────
// Notifications store the relevant entity id in the message as `[invoiceId:xxx]`,
// `[productId:xxx]`, etc. At click time we extract that marker and append it
// as a query param so the destination page can deep-link straight to the row
// or detail modal. Works for old notifications that pre-date the backend
// embedding the id in actionUrl directly.
//
// Rewrite the stored `actionUrl` to today's canonical destination. The CRM
// refactor replaced the standalone batch / reminder / approval detail pages
// with inline panels on the list pages, opened via `?<entityId>` query params
// (handled by each list page's `useDeepLinkParam` hook). Map both directions
// (old detail-page → new inline-panel route, and the bare list path → the
// same canonical path) so notifications created at any point in history
// resolve to a working destination today.
const URL_REWRITES: Record<string, string> = {
  // Old detail-page / list routes → new Sheet/inline-panel destinations.
  // PAYMENT_DUE goes to SalesListPage because it has a working Sheet
  // (CustomerInvoicesPage's deep-link redirects to the old full-page detail).
  '/customers/invoices/detail':  '/billing/sales',
  '/customers/invoices':         '/billing/sales',
  // Expiry alerts open the full-page batch detail so that pressing Back returns
  // to wherever the user came from (the notifications page) in one step. The
  // bare expiry-list path is rewritten to the detail route too (the batchId
  // comes from the message marker); no-id links fall back to the list below.
  '/inventory/expiry':           '/inventory/batches/detail',
  // Reminder / Approval alerts open the ACTUAL list pages with their inline
  // detail panel (deep-linked via ?reminderId / ?requestId, handled by each
  // page's useDeepLinkParam hook). The panel's Back arrow returns to the exact
  // notification folder in one step. Legacy actionUrls that still point at the
  // old standalone /detail routes are mapped back onto the list pages here, so
  // the bare list paths fall through to themselves.
  '/reminders/detail':           '/reminders',
  '/admin/approvals/detail':     '/admin/approvals',
  // Credit-note review alerts → the standalone CN detail page directly, so
  // Back returns to the notification folder in one step. Going via the list
  // (`/billing/credit-notes?id=`) would push an extra history entry that the
  // list then redirects past, breaking Back.
  '/billing/credit-notes':       '/billing/credit-notes/detail',
  // Low Stock: ProductsPage has no detail Sheet, so /inventory/product-history
  // remains the canonical destination (full-page history view).
  '/inventory/products':         '/inventory/product-history',
}
// For each base path (after rewrite), which marker in the message holds the
// entity id and what query param name to use on the destination URL. Keys
// are the POST-rewrite path; legacy paths fall through unchanged via the
// fallback in resolveActionUrl().
const MARKER_FOR_PATH: Record<string, { marker: string; param: string }> = {
  '/inventory/product-history':  { marker: 'productId',  param: 'productId' },
  '/inventory/batches/detail':   { marker: 'batchId',    param: 'id' },
  '/billing/sales':              { marker: 'invoiceId',  param: 'invoiceId' },
  // Reminder / Approval list pages deep-link via ?reminderId / ?requestId
  // (their useDeepLinkParam hooks open the inline detail panel). The marker
  // also lets pre-actionUrl notifications (id embedded only in the message)
  // resolve. Keyed on the post-rewrite list path (see URL_REWRITES above).
  '/reminders':                  { marker: 'reminderId', param: 'reminderId' },
  '/admin/approvals':            { marker: 'requestId',  param: 'requestId' },
  '/billing/credit-notes/detail':{ marker: 'creditNoteId', param: 'id' },
}
function extractMarker(message: string, marker: string): string | null {
  const m = message.match(new RegExp(`\\[${marker}:([^\\]]+)\\]`))
  return m?.[1] ?? null
}

// Try every known id-style query param so legacy URLs (?invoiceId=…) still work
// when we point them at the new detail pages (which read ?id=…).
const ID_QUERY_KEYS = ['id', 'invoiceId', 'batchId', 'productId', 'reminderId', 'requestId']
function extractIdFromQuery(query: string): string | null {
  const params = new URLSearchParams(query)
  for (const key of ID_QUERY_KEYS) {
    const v = params.get(key)
    if (v) return v
  }
  return null
}

function resolveActionUrl(n: Notification): string | null {
  if (!n.actionUrl) return null
  const [basePath, existingQuery] = n.actionUrl.split('?')
  const rewrittenPath = URL_REWRITES[basePath] ?? basePath
  // Spec for the *destination* page tells us the canonical param name we should emit.
  const spec = MARKER_FOR_PATH[rewrittenPath] ?? MARKER_FOR_PATH[basePath]

  // Find the entity id — first try the URL's existing query, then the message marker.
  let id: string | null = null
  if (existingQuery) id = extractIdFromQuery(existingQuery)
  if (!id && spec) id = extractMarker(n.message, spec.marker)

  if (id && spec) return `${rewrittenPath}?${spec.param}=${id}`
  // A batch-detail link with no id is useless (renders "Batch not found"), so
  // send those to the expiry list instead.
  if (rewrittenPath === '/inventory/batches/detail') return '/inventory/expiry'
  // Fallback: preserve the original query (unlikely to match anymore, but safer than dropping).
  if (existingQuery) return `${rewrittenPath}?${existingQuery}`
  return rewrittenPath
}

// Strip dedup markers for display
function cleanMessage(msg: string): string {
  return msg.replace(/\s*\[\w+Id:[^\]]+\](?:\[[^\]]+\])*/g, '').trim()
}

// Reorder the one-line detail so the most relevant entity leads:
//   Payment Due → customer first (not the invoice number)
//   Expiry      → product first, then batch
//   Low Stock   → product first (already the case)
// New notifications are generated in this order by the backend, so they fall
// straight through `cleanMessage`. This also rewrites the *legacy* phrasing
// ("Invoice X for Y…", "Batch B of P…") so already-stored alerts reorder too.
// Returns the detail split into a highlighted `lead` (the entity to scan for —
// customer + phone, or product + batch) and the muted `rest`. The lead is
// rendered bold so the user's eye lands on the name/number, and the redundant
// invoice number is dropped from Payment Due. Handles both the current and the
// legacy backend phrasings so already-stored alerts reformat too.
interface Detail { lead: string; rest: string }

// Pull a "(phone)" embedded in the message (reminders / approvals carry it
// inline). Returns [nameWithoutPhone, phone|null].
function splitInlinePhone(s: string): [string, string | null] {
  const m = s.match(/^(.*?)\s*\(([+\d][\d\s-]{4,})\)\s*$/)
  return m ? [m[1].trim(), m[2].trim()] : [s.trim(), null]
}

function withPhone(name: string, phone: string | null): string {
  return phone ? `${name} · ${phone}` : name
}

function formatDetail(n: Notification, resolvePhone: PhoneResolver): Detail {
  const message = cleanMessage(n.message)
  if (isReminder(n)) {
    // Matches both the monthly nudge ("<title> — Follow up with <name> today.")
    // and the one-off follow-up ("<title> — Follow-up with <name> is due today.").
    const m = message.match(/Follow[-\s]up with\s+(.+?)\s+(?:is\s+due\s+)?today/i)
    if (m) {
      const [name, inlinePhone] = splitInlinePhone(m[1])
      return { lead: withPhone(name, inlinePhone ?? resolvePhone(n, name)), rest: 'Follow up today' }
    }
    return { lead: '', rest: message }
  }
  switch (n.type) {
    case 'PAYMENT_DUE': {
      // Legacy phrasing also starts with a name-like token, so match it first.
      const legacy = message.match(/^Invoice\s+\S+\s+for\s+(.+?)\s+has\s+₹([\d,.]+)\s+outstanding/i)
      const cur = legacy ? null : message.match(/^(.+?)\s+has\s+₹([\d,.]+)\s+outstanding/i)
      const customer = legacy?.[1] ?? cur?.[1]
      const amount = legacy?.[2] ?? cur?.[2]
      if (customer && amount) {
        return { lead: withPhone(customer, resolvePhone(n, customer)), rest: `₹${amount} outstanding` }
      }
      break
    }
    case 'EXPIRY': {
      const cur = message.match(/^(.+?)\s+·\s+Batch\s+(\S+)\s+(expires\b.*|has already expired.*)$/i)
      if (cur) return { lead: `${cur[1]} · Batch ${cur[2]}`, rest: cur[3] }
      const legacy = message.match(/^Batch\s+(\S+)\s+of\s+(.+?)\s+(expires\b.*|has already expired.*)$/i)
      if (legacy) return { lead: `${legacy[2]} · Batch ${legacy[1]}`, rest: legacy[3] }
      break
    }
    case 'LOW_STOCK': {
      const m = message.match(/^(.+?)\s+(is out of stock.*|has only\s+.*)$/i)
      if (m) return { lead: m[1], rest: m[2] }
      break
    }
    case 'APPROVAL': {
      // Current: "<customer> (<phone>?) — Credit Note <cn> (₹<amt>) awaiting review."
      // Legacy:  "<cn> (<customer>, ₹<amt>) — inspect returned goods …"
      const legacy = message.match(/^(\S+)\s+\((.+?),\s*₹([\d,.]+)\)\s+—\s+/i)
      if (legacy) {
        const [, cnNo, customer, amt] = legacy
        return { lead: withPhone(customer, resolvePhone(n, customer)), rest: `Credit Note ${cnNo} · ₹${amt} — review` }
      }
      const cur = message.match(/^(.+?)\s+—\s+(.*)$/)
      if (cur) {
        const [name, inlinePhone] = splitInlinePhone(cur[1])
        return { lead: withPhone(name, inlinePhone ?? resolvePhone(n, name)), rest: cur[2] }
      }
      break
    }
  }
  return { lead: '', rest: message }
}

// Renders a one-line detail with the lead entity highlighted (bold/foreground)
// and the rest muted: "Title · **Customer · phone** · ₹X outstanding".
function NotificationDetail({ n }: { n: Notification }) {
  const resolvePhone = usePhoneResolver()
  const { lead, rest } = formatDetail(n, resolvePhone)
  return (
    <>
      <span className={cn(!n.isRead ? 'font-semibold text-foreground' : 'text-foreground/80')}>
        {n.title}
      </span>
      {lead && <span className="font-semibold text-foreground"> · {lead}</span>}
      {rest && <span className="text-muted-foreground"> · {rest}</span>}
    </>
  )
}

// ─── Per-type cluster row parsing ─────────────────────────────────
// When a cluster expands we render its items in a real <table> with
// type-specific columns instead of one merged prose string. The backend
// generates notification messages with consistent shapes per type, so
// regex extraction is reliable. When a message doesn't match (legacy
// formats, freeform SYSTEM alerts), we fall back to a single "Detail"
// column with the raw cleaned message — the row still renders cleanly,
// just less structured.
interface ColumnDef {
  key: string
  label: string
  align?: 'left' | 'right'
  className?: string
  /** Tailwind width class applied to <th>. Omit for a flexible column
   *  that absorbs leftover space in a `table-fixed` layout. */
  width?: string
}

// Columns per cluster type. Order matters — the first column is treated as
// the "primary" one (bolded when unread). Widths are explicit on numeric /
// short columns so the flex column (product/customer name) absorbs the rest
// instead of leaving an empty band in the middle of the row.
const CLUSTER_COLUMNS: Partial<Record<ClusterKey, ColumnDef[]>> = {
  PAYMENT_DUE: [
    { key: 'customer',  label: 'Customer' },
    { key: 'amount',    label: 'Outstanding', align: 'right', className: 'font-medium tabular-nums', width: 'w-32' },
    { key: 'aged',      label: 'Aged',        align: 'right', className: 'tabular-nums text-muted-foreground', width: 'w-24' },
  ],
  EXPIRY: [
    { key: 'product',   label: 'Product' },
    { key: 'batch',     label: 'Batch',       className: 'font-mono text-[11px]', width: 'w-32' },
    { key: 'expiresIn', label: 'Expires in',  align: 'right', className: 'tabular-nums', width: 'w-28' },
    { key: 'severity',  label: 'Severity',    align: 'left', width: 'w-32' },
  ],
  LOW_STOCK: [
    { key: 'product',   label: 'Product' },
    { key: 'current',   label: 'Stock',  align: 'right', className: 'font-medium tabular-nums', width: 'w-20' },
    { key: 'min',       label: 'Min',    align: 'right', className: 'tabular-nums text-muted-foreground', width: 'w-20' },
    { key: 'status',    label: 'Status', align: 'left',  width: 'w-32' },
  ],
  APPROVAL: [
    { key: 'customer', label: 'Customer', width: 'w-56' },
    { key: 'detail',   label: 'Request' },
  ],
  REMINDER: [
    { key: 'customer', label: 'Customer', width: 'w-56' },
    { key: 'detail',   label: 'Follow-up' },
  ],
}

const DEFAULT_COLUMNS: ColumnDef[] = [{ key: 'detail', label: 'Detail' }]

// Expiry severity buckets, in urgency order. Mirrors the Severity column logic
// in parseClusterRow — used by the Expiry folder's severity filter.
const EXPIRY_SEVERITIES = ['Expired', 'Critical', 'Soon', 'Upcoming'] as const

// Derive an expiry notification's severity (same rules as the row's Severity
// column). Returns '—' when days-left can't be determined.
function expirySeverity(n: Notification): string {
  const state = (n.entityState ?? {}) as Record<string, unknown>
  const message = cleanMessage(n.message)
  let daysLeft: number | null = null
  if (typeof state.daysLeft === 'number') daysLeft = state.daysLeft
  else {
    const m = message.match(/expires\s+in\s+(\d+)\s*day/i)
    if (m) daysLeft = parseInt(m[1], 10)
    else if (/has already expired/i.test(message)) daysLeft = 0
  }
  if (daysLeft === null) return '—'
  if (daysLeft <= 0) return 'Expired'
  if (daysLeft <= 30) return 'Critical'
  if (daysLeft <= 60) return 'Soon'
  return 'Upcoming'
}

function parseClusterRow(n: Notification, resolvePhone: PhoneResolver): Record<string, string> {
  const message = cleanMessage(n.message)
  if (isReminder(n)) {
    // Matches both the monthly nudge ("<title> — Follow up with <name> today.")
    // and the one-off follow-up ("<title> — Follow-up with <name> is due today.").
    const m = message.match(/Follow[-\s]up with\s+(.+?)\s+(?:is\s+due\s+)?today/i)
    if (m) {
      const [name, inlinePhone] = splitInlinePhone(m[1])
      const title = message.split('—')[0]?.trim()
      return { customer: name, phone: (inlinePhone ?? resolvePhone(n, name)) ?? '', detail: title || 'Follow up today' }
    }
    return { detail: message }
  }
  // entityState is the structured snapshot the backend stamps when generating
  // the alert. Prefer it over re-parsing the message when both are available
  // — the message is for humans and may not carry every datum.
  const state = (n.entityState ?? {}) as Record<string, unknown>
  switch (n.type) {
    case 'PAYMENT_DUE': {
      // Current: "<customer> has ₹<amount> outstanding · Invoice <invNo>."
      // Legacy:  "Invoice <invNo> for <customer> has ₹<amount> outstanding."
      const aged =
        typeof state.daysOutstanding === 'number' && state.daysOutstanding > 0
          ? `${state.daysOutstanding}d`
          : '—'
      const legacy = message.match(/^Invoice\s+\S+\s+for\s+(.+?)\s+has\s+₹([\d,.]+)\s+outstanding/i)
      const cur = legacy ? null : message.match(/^(.+?)\s+has\s+₹([\d,.]+)\s+outstanding/i)
      const customer = legacy?.[1] ?? cur?.[1]
      const amount = legacy?.[2] ?? cur?.[2]
      if (customer && amount) {
        return { customer, phone: resolvePhone(n, customer) ?? '', amount: `₹${amount}`, aged }
      }
      break
    }
    case 'EXPIRY': {
      // Current: "<product> · Batch <b#> expires in <N> day(s)." / "… has already expired."
      // Legacy:  "Batch <b#> of <product> expires in <N> day(s)."
      const cur = message.match(/^(.+?)\s+·\s+Batch\s+(\S+)\s+expires\s+in\s+(\d+)\s*day/i)
      const legacy = cur ? null : message.match(/^Batch\s+(\S+)\s+of\s+(.+?)\s+expires\s+in\s+(\d+)\s*day/i)
      const m = cur
        ? { product: cur[1], batch: cur[2], days: cur[3] }
        : legacy
          ? { product: legacy[2], batch: legacy[1], days: legacy[3] }
          : null
      const daysLeft =
        typeof state.daysLeft === 'number'
          ? state.daysLeft
          : m
            ? parseInt(m.days, 10)
            : null
      const severity =
        daysLeft === null ? '—'
        : daysLeft <= 0   ? 'Expired'
        : daysLeft <= 30  ? 'Critical'
        : daysLeft <= 60  ? 'Soon'
        : 'Upcoming'
      if (m) return { batch: m.batch, product: m.product, expiresIn: `${m.days}d`, severity }
      // Fallback for the "Expired Stock" message that doesn't carry days
      // (both current "<product> · Batch <b#> has already expired" and legacy).
      const expCur = message.match(/^(.+?)\s+·\s+Batch\s+(\S+)\s+has already expired/i)
      if (expCur) return { batch: expCur[2], product: expCur[1], expiresIn: 'Expired', severity: 'Expired' }
      const expLegacy = message.match(/^Batch\s+(\S+)\s+of\s+(.+?)\s+has already expired/i)
      if (expLegacy) return { batch: expLegacy[1], product: expLegacy[2], expiresIn: 'Expired', severity: 'Expired' }
      break
    }
    case 'LOW_STOCK': {
      // Backend variants:
      //   "<product> is out of stock."
      //   "<product> has only N units left (min: M)."
      // entityState carries totalStock + minStock for both shapes.
      const stateTotal = typeof state.totalStock === 'number' ? state.totalStock : null
      const stateMin   = typeof state.minStock   === 'number' ? state.minStock   : null
      const oos = message.match(/^(.+?)\s+is out of stock/i)
      if (oos) {
        return {
          product: oos[1],
          current: String(stateTotal ?? 0),
          min: stateMin !== null ? String(stateMin) : '—',
          status: 'Out of stock',
        }
      }
      const low = message.match(/^(.+?)\s+has only\s+(\d+)\s+units left.*?min:\s*(\d+)/i)
      if (low) {
        return {
          product: low[1],
          current: low[2],
          min: low[3],
          status: 'Low',
        }
      }
      break
    }
    case 'APPROVAL': {
      // Current: "<customer> (<phone>?) — Credit Note <cn> (₹<amt>) awaiting review."
      // Legacy:  "<cn> (<customer>, ₹<amt>) — inspect returned goods …"
      const legacy = message.match(/^(\S+)\s+\((.+?),\s*₹([\d,.]+)\)\s+—\s+/i)
      if (legacy) {
        const [, cnNo, customer, amt] = legacy
        return { customer, phone: resolvePhone(n, customer) ?? '', detail: `Credit Note ${cnNo} · ₹${amt} — review` }
      }
      const cur = message.match(/^(.+?)\s+—\s+(.*)$/)
      if (cur) {
        const [name, inlinePhone] = splitInlinePhone(cur[1])
        return { customer: name, phone: (inlinePhone ?? resolvePhone(n, name)) ?? '', detail: cur[2] }
      }
      break
    }
  }
  return { detail: message }
}

function getClusterColumns(key: ClusterKey): ColumnDef[] {
  return CLUSTER_COLUMNS[key] ?? DEFAULT_COLUMNS
}

// ─── Smart grouping ──────────────────────────────────────────
// When a date group contains MIN_GROUP_SIZE+ items of the same type
// (regardless of position — they can be interleaved with other types), we
// collapse them into a single expandable cluster panel. The cluster takes
// the position of the FIRST occurrence in the group; other types between
// them keep their original positions. This avoids the "wall of 30 payment-
// due rows" problem while keeping mixed days readable.
const MIN_GROUP_SIZE = 5

// Use 'REMINDER' as a virtual cluster key so reminders (stored as SYSTEM
// with a marker) cluster separately from real SYSTEM alerts.
type ClusterKey = Notification['type'] | 'REMINDER'
const clusterKeyOf = (n: Notification): ClusterKey =>
  (isReminder(n) ? 'REMINDER' : n.type)

type ListEntry =
  | { kind: 'single'; item: Notification }
  | { kind: 'cluster'; key: ClusterKey; type: Notification['type']; items: Notification[] }

function clusterSameType(items: Notification[]): ListEntry[] {
  // Pass 1 — count each cluster key in this date group.
  const counts = new Map<ClusterKey, number>()
  for (const n of items) {
    const key = clusterKeyOf(n)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  // Pass 2 — emit. First occurrence of a clusterable type emits the cluster
  // with ALL of that type's items (in original order); subsequent items of
  // the same type are absorbed (skipped). Other types stay where they are.
  const shouldCluster = (key: ClusterKey) => (counts.get(key) ?? 0) >= MIN_GROUP_SIZE
  const clusterBuckets = new Map<ClusterKey, Notification[]>()
  for (const n of items) {
    const key = clusterKeyOf(n)
    if (shouldCluster(key)) {
      if (!clusterBuckets.has(key)) clusterBuckets.set(key, [])
      clusterBuckets.get(key)!.push(n)
    }
  }

  const out: ListEntry[] = []
  const emitted = new Set<ClusterKey>()
  for (const n of items) {
    const key = clusterKeyOf(n)
    if (shouldCluster(key)) {
      if (!emitted.has(key)) {
        emitted.add(key)
        out.push({ kind: 'cluster', key, type: n.type, items: clusterBuckets.get(key)! })
      }
      // else: absorbed into the already-emitted cluster
    } else {
      out.push({ kind: 'single', item: n })
    }
  }
  return out
}

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.04 } },
}
const itemVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] as const } },
}

// ─── Page ─────────────────────────────────────────────────────
export default function NotificationsPage() {
  const {
    notifications, isLoading, fetchNotifications,
    markAsRead, markAllAsRead, snooze, resolve, removeNotification,
  } = useNotificationStore()
  const userRole = useAuthStore((s) => s.user?.role ?? 'PHARMACIST')
  // Super Admin sees every folder regardless of the per-category role lists.
  const isSuper = useAuthStore((s) => isSuperAdmin(s.user))

  // Customer phone lookup for the notification rows. Loaded lazily; rows fall
  // back to name-only until it arrives.
  const customers = useMasterDataStore((s) => s.customers)
  const fetchMasterData = useMasterDataStore((s) => s.fetchMasterData)
  useEffect(() => { fetchMasterData() }, [fetchMasterData])

  const phoneResolver = useMemo<PhoneResolver>(() => {
    const byId = new Map<string, string>()
    const nameCount = new Map<string, number>()
    const byName = new Map<string, string>()
    for (const c of customers) {
      if (c.id && c.phone) byId.set(c.id, c.phone)
      const key = (c.name || '').trim().toLowerCase()
      if (!key) continue
      nameCount.set(key, (nameCount.get(key) ?? 0) + 1)
      if (c.phone) byName.set(key, c.phone)
    }
    return (n, name) => {
      const es = (n.entityState ?? {}) as Record<string, unknown>
      if (typeof es.customerPhone === 'string' && es.customerPhone) return es.customerPhone
      if (typeof es.customerId === 'string' && byId.has(es.customerId)) return byId.get(es.customerId)!
      // Name match only when unambiguous — never guess a phone for a name two
      // customers share (the exact case phone is meant to disambiguate).
      const key = (name || '').trim().toLowerCase()
      if (key && nameCount.get(key) === 1) return byName.get(key) ?? null
      return null
    }
  }, [customers])

  const visibleCategories = useMemo(
    () => CATEGORIES.filter((c) => c.roles === null || isSuper || c.roles.includes(userRole)),
    [userRole, isSuper]
  )

  const [activeCategory, setActiveCategory] = useState<CategoryKey>(() => readFolderFromUrl())

  // Switch folders and mirror the choice into the URL. Uses replaceState (not a
  // pushState navigate) so flipping between folders doesn't pile up history
  // entries — but the current entry still carries ?folder=…, so when the user
  // clicks a notification (a pushState navigate) and later presses Back, this
  // folder is restored instead of falling back to "All".
  const selectCategory = useCallback((key: CategoryKey) => {
    setActiveCategory(key)
    const params = new URLSearchParams(window.location.search)
    if (key === 'all') params.delete('folder')
    else params.set('folder', key)
    const qs = params.toString()
    window.history.replaceState(window.history.state, '', `/notifications${qs ? `?${qs}` : ''}`)
  }, [])

  const [searchQuery, setSearchQuery] = useState('')
  // View preferences persist (sessionStorage) so they survive navigating to a
  // detail page and back, instead of snapping back to the defaults each time.
  const [readFilter, setReadFilter] = usePersistedState<'all' | 'unread' | 'read'>('notifications:readFilter', 'all')
  // Row ordering, applied to every folder via the server query.
  const [sortBy, setSortBy] = usePersistedState<SortKey>('notifications:sort', 'newest')
  // Folder view defaults to unread-only so the table size matches the sidebar
  // badge (which counts unread per type). "All" includes already-read alerts;
  // "Resolved" shows only the ones closed out (e.g. a Payment Due that got paid).
  const [folderView, setFolderView] = usePersistedState<'unread' | 'all' | 'resolved'>('notifications:folderView', 'unread')
  // Expiry-folder severity filter (client-side, on the loaded rows). 'all' = off.
  const [severityFilter, setSeverityFilter] = useState<'all' | typeof EXPIRY_SEVERITIES[number]>('all')
  // Expanded cluster bundles in the All view. Each key is `${dateBucket}-${type}`
  // (see AllTable). Collapsed by default so a long mixed-type day reads as a
  // tight summary instead of a wall of rows.
  const [expandedClusters, setExpandedClusters] = useState<Set<string>>(new Set())

  useEffect(() => { fetchNotifications() }, [fetchNotifications])

  // ── Unified server-paginated infinite scroll ─────────────────
  // One hook drives both views. Params change with activeCategory:
  //   • All view: optional unread/read filter from the readFilter pill.
  //   • Folder views: narrow by NotificationType (or reminders=only for the
  //     REMINDER/Follow-ups folder) + folderView toggle.
  // Mirrors the customer-dropdown pattern in NewSalePage: pageSize 50, fetch
  // more on near-bottom scroll, returns { data, total, hasMore }.
  const paginatedExtraParams = useMemo<Record<string, string | undefined>>(() => {
    const sort = sortBy === 'newest' ? undefined : sortBy
    if (activeCategory === 'all') {
      return {
        unread: readFilter === 'unread' ? 'true' : undefined,
        read:   readFilter === 'read'   ? 'true' : undefined,
        sort,
      }
    }
    const folderUnread = folderView === 'unread' ? 'true' : undefined
    const folderResolved = folderView === 'resolved' ? 'only' : undefined
    if (activeCategory === 'REMINDER') return { reminders: 'only', unread: folderUnread, resolved: folderResolved, sort }
    return { type: activeCategory, unread: folderUnread, resolved: folderResolved, sort }
  }, [activeCategory, readFilter, folderView, sortBy])

  const paginated = usePaginatedSearch<any>({
    endpoint: '/notifications',
    pageSize: 50,
    extraParams: paginatedExtraParams,
  })

  // Mirror the store's mapRaw: server returns `createdAt`, but render code
  // (timeAgo, date grouping) reads `timestamp`. Normalize once at the edge.
  const paginatedItems = useMemo<Notification[]>(
    () =>
      paginated.items.map((n: any) => ({
        ...n,
        timestamp: n.timestamp ?? n.createdAt ?? new Date().toISOString(),
        message: n.message ?? '',
      })) as Notification[],
    [paginated.items],
  )

  // Apply the Expiry severity filter client-side (severity is derived per-row,
  // not a server field, so it filters the loaded page). A no-op for other
  // folders and the 'all' view.
  const displayItems = useMemo(() => {
    if (activeCategory !== 'EXPIRY' || severityFilter === 'all') return paginatedItems
    return paginatedItems.filter((n) => expirySeverity(n) === severityFilter)
  }, [paginatedItems, activeCategory, severityFilter])

  // Sync the search input into the hook's debounced query.
  const paginatedSetQuery = paginated.setQuery
  useEffect(() => {
    paginatedSetQuery(searchQuery)
  }, [searchQuery, paginatedSetQuery])

  // Clear search + expanded clusters when switching folders so each view starts
  // clean. We deliberately DON'T reset folderView (Unread/All/Resolved) here:
  // it's a persisted preference (usePersistedState) and must survive folder
  // switches AND navigate-away-and-back. Resetting it was discarding the user's
  // choice — e.g. returning to Follow-ups always snapped back to Unread.
  const didMountFolderReset = useRef(false)
  useEffect(() => {
    if (!didMountFolderReset.current) { didMountFolderReset.current = true; return }
    setSearchQuery('')
    setExpandedClusters(new Set())
    setSeverityFilter('all')
  }, [activeCategory])

  // ── Per-category unread counts ────────────────────────────
  const categoryCounts = useMemo(() => {
    const counts: Record<CategoryKey, number> = { all: 0, LOW_STOCK: 0, EXPIRY: 0, PAYMENT_DUE: 0, APPROVAL: 0, REMINDER: 0 }
    for (const n of notifications) {
      if (n.isRead) continue
      counts.all++
      if (n.type === 'SYSTEM') {
        // Reminders live under Follow-ups; non-reminder system alerts have no
        // dedicated folder and surface only in the All view (counted above).
        if (isReminder(n)) counts.REMINDER++
      } else if (n.type in counts) {
        counts[n.type as CategoryKey]++
      }
    }
    return counts
  }, [notifications])

  // ── Handlers ───────────────────────────────────────────────
  // Both views read from the same `paginated` hook. Every per-row action:
  //   1. Calls the store action (optimistic store update + API request — the
  //      store still drives the sidebar badge counts and bell notification).
  //   2. Optimistically mirrors the change into the paginated list via
  //      mutate() so the visible table reflects the action without a refetch.
  const paginatedMutate = paginated.mutate

  // Single click on a row: mark read + navigate to the deep-linked destination.
  // The row IS the action — no separate detail pane to fill in.
  const openNotification = (n: Notification) => {
    if (!n.isRead) {
      paginatedMutate((items: any[]) =>
        items.map((x: any) => (x.id === n.id ? { ...x, isRead: true } : x)),
      )
      markAsRead(n.id)
    }
    const url = resolveActionUrl(n)
    if (url) navigate(url)
  }

  const handleSnooze = async (id: string, hours: number) => {
    const until = new Date(Date.now() + hours * 3_600_000)
    // Snoozed items are filtered out server-side on subsequent fetches; hide
    // locally too so the row disappears immediately.
    paginatedMutate((items: any[]) => items.filter((n: any) => n.id !== id))
    await snooze(id, until)
    toast.success(`Snoozed ${hours < 24 ? `for ${hours}h` : `for ${Math.round(hours / 24)}d`}`)
  }

  const handleResolve = async (id: string) => {
    const nowIso = new Date().toISOString()
    paginatedMutate((items: any[]) =>
      items.map((n: any) =>
        n.id === id ? { ...n, isRead: true, resolvedAt: nowIso } : n,
      ),
    )
    await resolve(id)
    toast.success('Marked as resolved')
  }

  const handleDelete = async (id: string) => {
    paginatedMutate((items: any[]) => items.filter((n: any) => n.id !== id))
    await removeNotification(id)
    toast.success('Notification deleted')
  }

  const toggleCluster = (key: string) => {
    setExpandedClusters((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Bulk-resolve every unresolved item in a cluster. Backend has no
  // dedicated bulk-resolve endpoint (only read-bulk + delete-bulk), so we
  // fan out per-item calls — the store updates optimistically per item.
  const handleResolveCluster = async (ids: string[]) => {
    if (ids.length === 0) return
    await Promise.all(ids.map((id) => resolve(id)))
    toast.success(`Resolved ${ids.length} ${ids.length === 1 ? 'alert' : 'alerts'}`)
  }

  const activeCategoryLabel =
    visibleCategories.find((c) => c.key === activeCategory)?.label ?? 'All'

  return (
    <PhoneCtx.Provider value={phoneResolver}>
    <motion.div variants={containerVariants} initial="hidden" animate="visible">
      <motion.div variants={itemVariants}>
        <Card className="overflow-hidden p-0">
          {/* Slim toolbar — count, view filter, and global actions all live here */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-3 py-2">
            <p className="text-xs text-muted-foreground">
              {categoryCounts.all > 0
                ? <><span className="font-semibold text-foreground">{categoryCounts.all}</span> unread · {notifications.length} total</>
                : <>You&apos;re all caught up · {notifications.length} total</>}
            </p>
            <div className="flex items-center gap-2">
              {/* Global read filter — only meaningful in the date-grouped
                  "All" view, which is driven by the in-memory store list.
                  Folder views are server-paginated and have their own
                  "Show all" toggle, so this pill is hidden there. */}
              {activeCategory === 'all' && (
                <div className="flex items-center rounded-md border border-border/60 bg-background p-0.5">
                  {(['all', 'unread', 'read'] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setReadFilter(v)}
                      className={cn(
                        'rounded px-2 py-1 text-[11px] font-medium capitalize transition-colors',
                        readFilter === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              )}
              <Button variant="ghost" size="icon-sm" className="h-7 w-7" onClick={() => fetchNotifications()} disabled={isLoading} aria-label="Refresh">
                <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
              </Button>
              {categoryCounts.all > 0 && (
                <Button size="sm" variant="outline" className="h-7 gap-1.5 px-2 text-[11px]" onClick={() => markAllAsRead()}>
                  <CheckCheck className="h-3.5 w-3.5" /> Mark all read
                </Button>
              )}
            </div>
          </div>

          <div className="flex h-[calc(100vh-160px)] min-h-100 flex-col lg:flex-row">

            {/* ── Sidebar: categories ── */}
            <aside className="shrink-0 border-b border-border/60 lg:w-56 lg:border-b-0 lg:border-r">
              <div className="px-3 py-3">
                <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  Folders
                </p>
                <nav className="space-y-0.5">
                  {visibleCategories.map((cat) => {
                    const Icon = cat.icon
                    const count = categoryCounts[cat.key]
                    const isActive = activeCategory === cat.key
                    return (
                      <button
                        key={cat.key}
                        type="button"
                        onClick={() => selectCategory(cat.key)}
                        className={cn(
                          'group relative flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors',
                          isActive
                            ? 'bg-accent font-medium text-foreground'
                            : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                        )}
                      >
                        {isActive && (
                          <motion.span
                            layoutId="sidebar-active"
                            className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-primary"
                            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                          />
                        )}
                        <Icon className={cn('h-3.5 w-3.5 shrink-0', isActive ? cat.accent : '')} />
                        <span className="flex-1 truncate text-[13px]">{cat.label}</span>
                        {count > 0 && (
                          <span className={cn(
                            'rounded-full px-1.5 py-px text-[10px] font-semibold tabular-nums',
                            isActive
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted text-muted-foreground'
                          )}>
                            {count > 99 ? '99+' : count}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </nav>
              </div>
            </aside>

            {/* ── Main: list (now full width with no detail pane) ── */}
            <section className="flex min-h-0 flex-1 flex-col">

              {/* Search row */}
              <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2.5">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={`Search ${activeCategoryLabel.toLowerCase()}…`}
                    className="h-8 border-border/60 pl-8 text-xs"
                  />
                </div>
                {/* Sort — available in every folder. The server applies the
                    ordering so it covers the whole list, not just the loaded
                    page. */}
                {/* One-click sort toggle (newest ⇄ oldest) — simpler than a
                    dropdown for a two-option choice. Applies across all folders. */}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0 gap-1.5 px-2 text-[11px] font-medium text-muted-foreground"
                  aria-label={`Sort: ${SORT_OPTIONS.find((o) => o.key === sortBy)?.label}. Click to switch.`}
                  title="Click to switch newest / oldest"
                  onClick={() => setSortBy(sortBy === 'newest' ? 'oldest' : 'newest')}
                >
                  <ArrowUpDown className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">
                    {SORT_OPTIONS.find((o) => o.key === sortBy)?.label}
                  </span>
                </Button>
                {/* Severity filter — Expiry folder only. Filters the loaded rows
                    client-side (severity is derived per-row, not a server field). */}
                {activeCategory === 'EXPIRY' && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn(
                          'h-8 shrink-0 gap-1.5 px-2 text-[11px] font-medium',
                          severityFilter === 'all' ? 'text-muted-foreground' : 'border-primary/50 bg-primary/5 text-foreground',
                        )}
                        title="Filter by severity"
                      >
                        <ListFilter className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">
                          {severityFilter === 'all' ? 'Severity' : severityFilter}
                        </span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setSeverityFilter('all')}>
                        All severities
                      </DropdownMenuItem>
                      {EXPIRY_SEVERITIES.map((s) => (
                        <DropdownMenuItem key={s} onClick={() => setSeverityFilter(s)}>
                          {s}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                {/* Folder view: 3-state toggle controls the server query.
                    Unread (default, matches the sidebar badge) · All (adds
                    read rows) · Resolved (only closed-out alerts, e.g. a
                    Payment Due that's since been paid). */}
                {activeCategory !== 'all' && (
                  <div className="flex shrink-0 items-center rounded-md border border-border/60 bg-background p-0.5">
                    {([
                      { key: 'unread',   label: 'Unread' },
                      { key: 'all',      label: 'All' },
                      { key: 'resolved', label: 'Resolved' },
                    ] as const).map((opt) => (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setFolderView(opt.key)}
                        className={cn(
                          'rounded px-2 py-1 text-[11px] font-medium transition-colors',
                          folderView === opt.key
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
                <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground/70">
                  {paginatedItems.length} of {paginated.total}
                  {activeCategory !== 'all' && folderView !== 'all' && ` ${folderView}`}
                  {activeCategory === 'all' && readFilter !== 'all' && ` ${readFilter}`}
                </span>
              </div>

              {/* List body — one scroll container for both views. Near-bottom
                  scroll triggers loadMore (NewSalePage customer-dropdown
                  pattern, scaled up to full-page table). */}
              <div
                className="flex-1 overflow-y-auto"
                onScroll={(e) => {
                  const el = e.currentTarget
                  // Pre-emptive fire — start the next fetch before the user
                  // hits the very bottom so new rows arrive without a
                  // visible "loading" gap.
                  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 200) {
                    paginated.loadMore()
                  }
                }}
              >
                {paginated.loading && paginatedItems.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center gap-3 py-16">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    <p className="text-xs text-muted-foreground">Loading…</p>
                  </div>
                ) : displayItems.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-16 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/60">
                      <FileX2 className="h-5 w-5 text-muted-foreground/50" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">No notifications</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {severityFilter !== 'all' && paginatedItems.length > 0
                          ? `No “${severityFilter}” alerts on the loaded rows — load more or clear the filter`
                          : searchQuery
                          ? `No matches in ${activeCategoryLabel}`
                          : activeCategory === 'all' && readFilter !== 'all'
                            ? `No ${readFilter} alerts`
                            : activeCategory !== 'all' && folderView === 'unread'
                              ? 'Nothing unread — switch to All or Resolved to see closed-out alerts'
                              : activeCategory !== 'all' && folderView === 'resolved'
                                ? 'No resolved alerts in this folder yet'
                                : 'Nothing in this folder'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    {activeCategory === 'all' ? (
                      // All view also reads as one structured table, with
                      // date-bucket separator rows (Yesterday / This week / …)
                      // so mixed-type lists stay scannable. When a date bucket
                      // has 5+ same-type items they collapse into a single
                      // bundle row the user can click to expand into the table.
                      <AllTable
                        items={paginatedItems}
                        expandedClusters={expandedClusters}
                        onToggleCluster={toggleCluster}
                        onResolveCluster={handleResolveCluster}
                        onOpen={openNotification}
                        onSnooze={handleSnooze}
                        onResolve={handleResolve}
                        onDelete={handleDelete}
                      />
                    ) : (
                      <ClusterTable
                        items={displayItems}
                        clusterKey={activeCategory as ClusterKey}
                        onOpen={openNotification}
                        onSnooze={handleSnooze}
                        onResolve={handleResolve}
                        onDelete={handleDelete}
                      />
                    )}
                    {/* Pagination footer — same in both views: loading-more
                        spinner, click-to-load button, or "all caught up". */}
                    <div className="flex items-center justify-center gap-2 border-t border-border/30 px-3 py-3 text-[11px] text-muted-foreground">
                      {paginated.loading ? (
                        <>
                          <div className="h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground/40 border-t-transparent" />
                          Loading more…
                        </>
                      ) : paginated.hasMore ? (
                        <button
                          type="button"
                          onClick={() => paginated.loadMore()}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          Load more · {paginated.total - paginatedItems.length} remaining
                        </button>
                      ) : (
                        <span>All caught up · {paginatedItems.length} total</span>
                      )}
                    </div>
                  </>
                )}
              </div>
            </section>
          </div>
        </Card>
      </motion.div>
    </motion.div>
    </PhoneCtx.Provider>
  )
}

// ─── List row ────────────────────────────────────────────────
// Single notification row in the compact table-style layout. Layout matches
// ClusterItem (below) but adds a type icon as the first column since
// standalone rows aren't grouped under a cluster header that already shows
// the type. Click anywhere → deep-linked destination. Hover reveals
// snooze/resolve/delete; resting state shows a chevron affordance.
function NotificationRow({
  notification: n,
  indented,
  onOpen,
  onSnooze,
  onResolve,
  onDelete,
}: {
  notification: Notification
  indented?: boolean
  onOpen: (n: Notification) => void
  onSnooze: (id: string, hours: number) => void
  onResolve: (id: string) => void
  onDelete: (id: string) => void
}) {
  const cfg = cfgFor(n)
  const Icon = cfg.icon
  const isResolved = !!n.resolvedAt

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(n)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen(n)
        }
      }}
      className={cn(
        // grid: icon · status · title+message · time · chevron/actions
        'group grid cursor-pointer items-center gap-2 border-b border-border/30 px-3 py-2 text-[12px] transition-colors hover:bg-muted/40',
        'grid-cols-[auto_auto_minmax(0,1fr)_auto_auto]',
        indented && 'pl-9',
        isResolved && 'opacity-70',
      )}
    >
      {/* Type icon */}
      <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', cfg.tone)}>
        <Icon className="h-3.5 w-3.5" />
      </div>

      {/* Unread / resolved indicator — same column-width as cluster items */}
      <span className="flex h-3 w-3 shrink-0 items-center justify-center" aria-hidden>
        {isResolved ? (
          <Check className="h-2.5 w-2.5 text-emerald-600 dark:text-emerald-400" />
        ) : !n.isRead ? (
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
        ) : (
          <span className="h-1.5 w-1.5 rounded-full bg-transparent" />
        )}
      </span>

      {/* Title + highlighted lead + muted rest, on one truncated line */}
      <span className="min-w-0 truncate leading-tight">
        <NotificationDetail n={n} />
      </span>

      {/* Time */}
      <span className="shrink-0 whitespace-nowrap text-[10px] tabular-nums text-muted-foreground/70">
        {timeAgo(n.timestamp)}
      </span>

      {/* Actions — hover-revealed; chevron is the resting affordance */}
      <span className="flex shrink-0 items-center" onClick={(e) => e.stopPropagation()}>
        <span className="hidden items-center gap-0.5 opacity-0 transition-opacity group-hover:flex group-hover:opacity-100 focus-within:flex focus-within:opacity-100">
          {!isResolved && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon-sm" variant="ghost" className="h-7 w-7" aria-label="Snooze">
                  <BellOff className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {SNOOZE_PRESETS.map((p) => (
                  <DropdownMenuItem key={p.label} onClick={() => onSnooze(n.id, p.hours)}>
                    {p.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {!isResolved && (
            <Button
              size="icon-sm"
              variant="ghost"
              className="h-7 w-7 text-emerald-700 hover:text-emerald-700 dark:text-emerald-400"
              onClick={() => onResolve(n.id)}
              aria-label="Mark resolved"
            >
              <Check className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            size="icon-sm"
            variant="ghost"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            onClick={() => onDelete(n.id)}
            aria-label="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </span>
        <ChevronRight
          className="ml-0.5 h-3.5 w-3.5 text-muted-foreground/40 transition-opacity group-hover:opacity-0"
          aria-hidden
        />
      </span>
    </div>
  )
}

// ─── Cluster panel ───────────────────────────────────────────
// Renders when a date group has MIN_GROUP_SIZE+ items of one type. Collapsed
// shows a one-line summary; expanded shows the items in a tighter "table"
// layout inside a type-tinted container so the user can see at a glance
// "these all belong together". Differs from a plain expanded list by:
//   1. Bordered + tinted container (visual grouping)
//   2. Header strip with bulk "Resolve all" action
//   3. Compact one-line rows (no separate message line)
function ClusterPanel({
  cluster,
  isExpanded,
  onToggle,
  onOpen,
  onSnooze,
  onResolve,
  onDelete,
  onResolveAll,
}: {
  cluster: { key: ClusterKey; type: Notification['type']; items: Notification[] }
  isExpanded: boolean
  onToggle: () => void
  onOpen: (n: Notification) => void
  onSnooze: (id: string, hours: number) => void
  onResolve: (id: string) => void
  onDelete: (id: string) => void
  onResolveAll: (ids: string[]) => void
}) {
  const sample = cluster.items[0]
  const cfg = sample ? cfgFor(sample) : typeConfig[cluster.type]
  const Icon = cfg.icon
  const unreadCount = cluster.items.filter((n) => !n.isRead).length
  const unresolvedIds = cluster.items.filter((n) => !n.resolvedAt).map((n) => n.id)

  // Type-tinted container colors. Mirror the tone classes on typeConfig but
  // expressed as border + background rather than icon background.
  const containerStyle = clusterContainerColors(cluster.key)

  return (
    <div
      className={cn(
        'border-b border-border/30',
        isExpanded && cn('border-l-2', containerStyle.borderLeft, containerStyle.bg),
      )}
    >
      {/* Header — toggles expansion. Bulk action button is rendered when
          expanded so it doesn't compete with the collapsed-state affordance. */}
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-muted/40"
      >
        <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', cfg.tone)}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold leading-tight">
            {cfg.label} · {cluster.items.length} alerts
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {unreadCount > 0
              ? `${unreadCount} unread · click to ${isExpanded ? 'collapse' : 'expand'}`
              : `All read · click to ${isExpanded ? 'collapse' : 'expand'}`}
          </p>
        </div>
        {isExpanded && unresolvedIds.length > 0 && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation()
              onResolveAll(unresolvedIds)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                e.stopPropagation()
                onResolveAll(unresolvedIds)
              }
            }}
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border/60 bg-background px-2 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 dark:hover:bg-emerald-950/30 dark:hover:text-emerald-400 dark:hover:border-emerald-900/40"
          >
            <CheckCheck className="h-3 w-3" />
            Resolve all
          </span>
        )}
        <ChevronDown
          className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', isExpanded && 'rotate-180')}
        />
      </button>

      {/* Expanded body — real <table> with type-specific column headers
          (Invoice | Customer | Outstanding for PAYMENT_DUE; Batch | Product
          | Expires in for EXPIRY; etc.). Falls back to a single "Detail"
          column for types without a parsable shape (REMINDER / APPROVAL /
          SYSTEM). Same component is reused for the folder-filter view. */}
      {isExpanded && (
        <ClusterTable
          items={cluster.items}
          clusterKey={cluster.key}
          onOpen={onOpen}
          onSnooze={onSnooze}
          onResolve={onResolve}
          onDelete={onDelete}
        />
      )}
    </div>
  )
}

// ─── Cluster table ────────────────────────────────────────────
// The actual <table> rendered when a cluster expands AND when the user
// selects a non-"All" folder in the sidebar (so an entire filtered list
// reads as one structured table instead of a flat feed). Columns are
// resolved from `getClusterColumns(clusterKey)` so each type gets the
// right schema; unknown types fall back to a one-column "Detail" view.
//
// Rows are bucketed by relative date (Yesterday / This week / Older …) and
// each bucket gets a separator row so the user can tell at a glance which
// alerts came in today vs last week without scanning the When column.
function ClusterTable({
  items,
  clusterKey,
  onOpen,
  onSnooze,
  onResolve,
  onDelete,
}: {
  items: Notification[]
  clusterKey: ClusterKey
  onOpen: (n: Notification) => void
  onSnooze: (id: string, hours: number) => void
  onResolve: (id: string) => void
  onDelete: (id: string) => void
}) {
  const columns = getClusterColumns(clusterKey)
  return (
    <div className="overflow-x-auto">
      {/* table-auto (no table-fixed): columns size to content so short
          values don't get stretched into wide empty bands. Explicit widths
          on the numeric/short columns still apply via the `width` class. */}
      <table className="w-full border-collapse">
        <thead>
          <tr className="sticky top-0 z-10 border-y border-border/40 bg-muted/40 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 backdrop-blur-sm">
            <th className="w-6 px-3 py-2" aria-hidden></th>
            {columns.map((c) => (
              <th
                key={c.key}
                className={cn(
                  'px-3 py-2 text-left',
                  c.align === 'right' && 'text-right',
                  c.width,
                )}
              >
                {c.label}
              </th>
            ))}
            <th className="w-28 px-3 py-2 text-right">When</th>
            <th className="w-20 px-3 py-2" aria-hidden></th>
          </tr>
        </thead>
        {/* Flat list — one global order so the sort toggle (newest/oldest)
            applies across the whole folder, not within date buckets. */}
        <tbody className="divide-y divide-border/30">
          {items.map((n) => (
            <ClusterRow
              key={n.id}
              notification={n}
              columns={columns}
              onOpen={onOpen}
              onSnooze={onSnooze}
              onResolve={onResolve}
              onDelete={onDelete}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Status/Severity → pill colour. Centralised so the LOW_STOCK and EXPIRY
// tables use the same palette. Defaults to a neutral grey for anything not
// explicitly listed (e.g. "Upcoming" expiries are not yet urgent).
function badgeToneFor(label: string): string {
  switch (label) {
    case 'Out of stock':
    case 'Expired':
      return 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300'
    case 'Critical':
      return 'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300'
    case 'Low':
    case 'Soon':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
    case 'Upcoming':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

// Per-cluster tint. Map ClusterKey → border + background tailwind classes.
function clusterContainerColors(key: ClusterKey): { borderLeft: string; bg: string } {
  switch (key) {
    case 'LOW_STOCK':
      return { borderLeft: 'border-l-amber-400 dark:border-l-amber-600', bg: 'bg-amber-50/40 dark:bg-amber-950/15' }
    case 'EXPIRY':
      return { borderLeft: 'border-l-red-400 dark:border-l-red-600',     bg: 'bg-red-50/40 dark:bg-red-950/15' }
    case 'PAYMENT_DUE':
      return { borderLeft: 'border-l-blue-400 dark:border-l-blue-600',   bg: 'bg-blue-50/40 dark:bg-blue-950/15' }
    case 'APPROVAL':
      return { borderLeft: 'border-l-emerald-400 dark:border-l-emerald-600', bg: 'bg-emerald-50/40 dark:bg-emerald-950/15' }
    case 'REMINDER':
      return { borderLeft: 'border-l-cyan-400 dark:border-l-cyan-600',   bg: 'bg-cyan-50/40 dark:bg-cyan-950/15' }
    case 'SYSTEM':
    default:
      return { borderLeft: 'border-l-purple-400 dark:border-l-purple-600', bg: 'bg-purple-50/40 dark:bg-purple-950/15' }
  }
}

// ─── Cluster table row ────────────────────────────────────────
// A single <tr> inside the cluster table. Columns are passed in from the
// parent ClusterPanel based on cluster type (PAYMENT_DUE has Invoice /
// Customer / Outstanding; EXPIRY has Batch / Product / Expires in; etc.).
// Click anywhere on the row → deep-link nav. Hover reveals snooze /
// resolve / delete actions. Stays in the same density as the table head.
function ClusterRow({
  notification: n,
  columns,
  onOpen,
  onSnooze,
  onResolve,
  onDelete,
}: {
  notification: Notification
  columns: ColumnDef[]
  onOpen: (n: Notification) => void
  onSnooze: (id: string, hours: number) => void
  onResolve: (id: string) => void
  onDelete: (id: string) => void
}) {
  const isResolved = !!n.resolvedAt
  const resolvePhone = usePhoneResolver()
  const parsed = parseClusterRow(n, resolvePhone)
  const primaryKey = columns[0]?.key

  return (
    <tr
      role="button"
      tabIndex={0}
      onClick={() => onOpen(n)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen(n)
        }
      }}
      className={cn(
        'group cursor-pointer transition-colors hover:bg-muted/40',
        isResolved && 'opacity-70',
      )}
    >
      {/* Unread / resolved indicator */}
      <td className="w-6 px-3 py-1.5 align-middle">
        {isResolved ? (
          <Check className="h-2.5 w-2.5 text-emerald-600 dark:text-emerald-400" />
        ) : !n.isRead ? (
          <span className="block h-1.5 w-1.5 rounded-full bg-primary" aria-label="Unread" />
        ) : null}
      </td>

      {/* Type-specific columns */}
      {columns.map((c) => {
        const value = parsed[c.key]
        // Render status/severity as a coloured pill so urgency is scannable
        // at a glance. Falls back to plain text for the rest.
        const isBadge = c.key === 'status' || c.key === 'severity'
        // The customer column stacks the name (highlighted) over the phone, so
        // same-named customers are distinguishable at a glance.
        const isCustomer = c.key === 'customer'
        return (
          <td
            key={c.key}
            className={cn(
              'px-3 py-1.5 align-middle text-[12px]',
              !isBadge && !isCustomer && 'truncate',
              c.align === 'right' && 'text-right',
              // Always highlight the primary (name/entity) column so it stands out.
              c.key === primaryKey && 'font-semibold text-foreground',
              c.className,
            )}
          >
            {isCustomer ? (
              <span className="block min-w-0">
                <span className="block truncate">{value || <span className="text-muted-foreground/50">—</span>}</span>
                {parsed.phone && (
                  <span className="block truncate font-mono text-[10px] font-normal text-muted-foreground">
                    {parsed.phone}
                  </span>
                )}
              </span>
            ) : value
              ? isBadge
                ? <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium', badgeToneFor(value))}>{value}</span>
                : value
              : <span className="text-muted-foreground/50">—</span>}
          </td>
        )
      })}

      {/* When */}
      <td className="w-24 whitespace-nowrap px-3 py-1.5 align-middle text-right text-[10px] tabular-nums text-muted-foreground/70">
        {timeAgo(n.timestamp)}
      </td>

      {/* Actions — hover-revealed; stop propagation so taps don't trigger nav */}
      <td
        className="w-20 px-3 py-1.5 align-middle text-right"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="inline-flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          {!isResolved && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon-sm" variant="ghost" className="h-6 w-6" aria-label="Snooze">
                  <BellOff className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {SNOOZE_PRESETS.map((p) => (
                  <DropdownMenuItem key={p.label} onClick={() => onSnooze(n.id, p.hours)}>
                    {p.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {!isResolved && (
            <Button
              size="icon-sm"
              variant="ghost"
              className="h-6 w-6 text-emerald-700 hover:text-emerald-700 dark:text-emerald-400"
              onClick={() => onResolve(n.id)}
              aria-label="Mark resolved"
            >
              <Check className="h-3 w-3" />
            </Button>
          )}
          <Button
            size="icon-sm"
            variant="ghost"
            className="h-6 w-6 text-muted-foreground hover:text-destructive"
            onClick={() => onDelete(n.id)}
            aria-label="Delete"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </span>
      </td>
    </tr>
  )
}

// ─── All-view table ──────────────────────────────────────────
// Renders the mixed-type "All" feed as one structured <table> with the same
// look as the folder tables. Loses per-type columns (the rows can be any of
// LOW_STOCK / EXPIRY / PAYMENT_DUE / APPROVAL / SYSTEM / REMINDER), so the
// detail column shows the parsed primary info per type when we have a
// schema for it (invoice no / batch / product), and falls back to the raw
// title + message for types without one. Date-bucket separator rows
// (Yesterday / This week / Older …) keep the timeline scannable.
//
// When a date bucket has MIN_GROUP_SIZE+ items of the same type, those rows
// collapse into a single AllClusterRow bundle. Clicking the bundle expands
// it into N indented rows below. Mixed-type buckets render flat.
// Initial / step size for the inside-cluster "Show more" pagination — when a
// cluster has more loaded items than this, we render only the first N and
// surface a "Show 25 more" button to reveal the next page. Avoids rendering
// 400 rows in the DOM the instant the user expands a large bundle.
const CLUSTER_PAGE_SIZE = 25

function AllTable({
  items,
  expandedClusters,
  onToggleCluster,
  onResolveCluster,
  onOpen,
  onSnooze,
  onResolve,
  onDelete,
}: {
  items: Notification[]
  expandedClusters: Set<string>
  onToggleCluster: (key: string) => void
  onResolveCluster: (ids: string[]) => void
  onOpen: (n: Notification) => void
  onSnooze: (id: string, hours: number) => void
  onResolve: (id: string) => void
  onDelete: (id: string) => void
}) {
  // 5 cells: indicator + type + detail + when + actions.
  const totalCols = 5
  // Per-cluster row cap. Default to CLUSTER_PAGE_SIZE on first expand; a
  // "Show N more" button below the expanded rows bumps this by another
  // CLUSTER_PAGE_SIZE each click. Stored as state inside AllTable (not in
  // the parent page) because the cap is purely a render-time concern for
  // this component — no other code needs to read it.
  const [clusterCaps, setClusterCaps] = useState<Record<string, number>>({})
  const bumpClusterCap = (clusterId: string) => {
    setClusterCaps((prev) => ({
      ...prev,
      [clusterId]: (prev[clusterId] ?? CLUSTER_PAGE_SIZE) + CLUSTER_PAGE_SIZE,
    }))
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="sticky top-0 z-10 border-y border-border/40 bg-muted/40 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 backdrop-blur-sm">
            <th className="w-6 px-3 py-2" aria-hidden></th>
            <th className="w-36 px-3 py-2 text-left">Type</th>
            <th className="px-3 py-2 text-left">Notification</th>
            <th className="w-28 px-3 py-2 text-right">When</th>
            <th className="w-20 px-3 py-2" aria-hidden></th>
          </tr>
        </thead>
        {/* Flat list — clustering still bundles 5+ same-type alerts, but
            there are no date-bucket separators, so the sort toggle applies
            across the whole list instead of within each day. */}
        <tbody className="divide-y divide-border/30">
          {clusterSameType(items).map((entry) => {
                if (entry.kind === 'cluster') {
                  // Stable cluster id: bucket + type. We DON'T include the
                  // entryIdx here so that as the page loads more items (and
                  // the entry's position within entries could shift), the
                  // expanded state survives.
                  const clusterId = entry.key
                  const isExpanded = expandedClusters.has(clusterId)
                  const cap = clusterCaps[clusterId] ?? CLUSTER_PAGE_SIZE
                  const visibleItems = entry.items.slice(0, cap)
                  const hiddenCount = entry.items.length - visibleItems.length
                  return (
                    <Fragment key={clusterId}>
                      <AllClusterRow
                        cluster={entry}
                        isExpanded={isExpanded}
                        onToggle={() => onToggleCluster(clusterId)}
                        onResolveAll={onResolveCluster}
                      />
                      {isExpanded && (
                        <>
                          {visibleItems.map((n) => (
                            <AllRow
                              key={n.id}
                              notification={n}
                              indented
                              onOpen={onOpen}
                              onSnooze={onSnooze}
                              onResolve={onResolve}
                              onDelete={onDelete}
                            />
                          ))}
                          {hiddenCount > 0 && (
                            <tr className="bg-muted/10">
                              <td colSpan={totalCols} className="px-3 py-2 text-center">
                                <button
                                  type="button"
                                  onClick={() => bumpClusterCap(clusterId)}
                                  className="text-[11px] text-muted-foreground hover:text-foreground"
                                >
                                  Show {Math.min(CLUSTER_PAGE_SIZE, hiddenCount)} more in this group
                                  <span className="ml-1 text-muted-foreground/60">· {hiddenCount} remaining</span>
                                </button>
                              </td>
                            </tr>
                          )}
                        </>
                      )}
                    </Fragment>
                  )
                }
                return (
                  <AllRow
                    key={entry.item.id}
                    notification={entry.item}
                    onOpen={onOpen}
                    onSnooze={onSnooze}
                    onResolve={onResolve}
                    onDelete={onDelete}
                  />
                )
              })}
        </tbody>
      </table>
    </div>
  )
}

// ─── All-view cluster bundle row ─────────────────────────────
// One row that stands in for N same-type notifications inside a date bucket.
// Click anywhere to toggle expansion; on expand, a bulk "Resolve all" action
// appears so the user can clear the whole bundle in one go. Visually
// distinct (slightly tinted, chevron on the right) so it doesn't read as a
// regular notification row.
function AllClusterRow({
  cluster,
  isExpanded,
  onToggle,
  onResolveAll,
}: {
  cluster: { key: ClusterKey; type: Notification['type']; items: Notification[] }
  isExpanded: boolean
  onToggle: () => void
  onResolveAll: (ids: string[]) => void
}) {
  const sample = cluster.items[0]
  const cfg = sample ? cfgFor(sample) : typeConfig[cluster.type]
  const Icon = cfg.icon
  const unreadCount = cluster.items.filter((n) => !n.isRead).length
  const unresolvedIds = cluster.items.filter((n) => !n.resolvedAt).map((n) => n.id)

  return (
    <tr
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onToggle()
        }
      }}
      className={cn(
        // Slightly taller + a thicker top/bottom feel so the bundle row reads
        // as a section heading inside the table rather than just another row.
        // Type-tinted left accent bar to reinforce "this is N items of TYPE".
        'cursor-pointer border-y border-border/40 bg-muted/30 transition-colors hover:bg-muted/50',
        isExpanded && 'bg-muted/40',
      )}
    >
      {/* Indicator — solid dot if any item is unread. Wider/taller cell to
          match the bigger row height. */}
      <td className="w-6 px-3 py-3 align-middle">
        {unreadCount > 0 && <span className="block h-2 w-2 rounded-full bg-primary" aria-label="Unread alerts" />}
      </td>

      {/* Type icon + label, bigger + bolder so the bundle row reads as a
          heading. Icon goes from h-5 → h-7 and label from text-[12px] → text-sm. */}
      <td className="w-36 px-3 py-3 align-middle">
        <span className="inline-flex items-center gap-2.5">
          <span className={cn('flex h-7 w-7 items-center justify-center rounded-md', cfg.tone)}>
            <Icon className="h-4 w-4" />
          </span>
          <span className="truncate text-sm font-semibold text-foreground">{cfg.label}</span>
        </span>
      </td>

      {/* Summary — count + click-to-expand hint. Slightly bigger text and a
          two-line layout so the count is visually prominent. */}
      <td className="px-3 py-3 align-middle text-[13px]">
        <span className="block font-semibold text-foreground">{cluster.items.length} alerts</span>
        <span className="mt-0.5 block text-[11px] text-muted-foreground">
          {unreadCount > 0 && <><span className="font-medium text-primary">{unreadCount} unread</span> · </>}
          click to {isExpanded ? 'collapse' : 'expand'}
        </span>
      </td>

      {/* Bulk action — only shown when expanded so the collapsed row stays clean */}
      <td className="w-28 px-3 py-3 align-middle text-right" onClick={(e) => e.stopPropagation()}>
        {isExpanded && unresolvedIds.length > 0 && (
          <button
            type="button"
            onClick={() => onResolveAll(unresolvedIds)}
            className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background px-2 py-1 text-[10px] font-medium text-foreground transition-colors hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:border-emerald-900/40 dark:hover:bg-emerald-950/30 dark:hover:text-emerald-400"
          >
            <CheckCheck className="h-3 w-3" />
            Resolve all
          </button>
        )}
      </td>

      {/* Chevron — bigger to match the new row height */}
      <td className="w-20 px-3 py-3 align-middle text-right">
        <ChevronDown
          className={cn('inline-block h-4 w-4 text-muted-foreground transition-transform', isExpanded && 'rotate-180')}
          aria-hidden
        />
      </td>
    </tr>
  )
}

// ─── All-view row ────────────────────────────────────────────
// Single row in the unified All-view table. Compresses each notification
// into Type (icon + label) + Detail (title + cleaned message, one line,
// truncated) + When + hover-revealed actions.
function AllRow({
  notification: n,
  indented,
  onOpen,
  onSnooze,
  onResolve,
  onDelete,
}: {
  notification: Notification
  /** True when this row is rendered inside an expanded cluster bundle.
   *  Adds a left tint + indent so child items visually nest under the
   *  bundle header. */
  indented?: boolean
  onOpen: (n: Notification) => void
  onSnooze: (id: string, hours: number) => void
  onResolve: (id: string) => void
  onDelete: (id: string) => void
}) {
  const cfg = cfgFor(n)
  const Icon = cfg.icon
  const isResolved = !!n.resolvedAt

  return (
    <tr
      role="button"
      tabIndex={0}
      onClick={() => onOpen(n)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen(n)
        }
      }}
      className={cn(
        'group cursor-pointer transition-colors hover:bg-muted/40',
        isResolved && 'opacity-70',
        // Subtle background tint when this row sits inside an expanded
        // cluster bundle, so the parent/child relationship reads visually.
        indented && 'bg-muted/10',
      )}
    >
      {/* Unread / resolved indicator. When indented, swap the dot for a thin
          vertical guide-line so the eye traces back to the bundle header. */}
      <td className={cn('w-6 px-3 py-1.5 align-middle', indented && 'relative')}>
        {indented && (
          <span
            className="pointer-events-none absolute inset-y-0 left-5 w-px bg-border/60"
            aria-hidden
          />
        )}
        {isResolved ? (
          <Check className="h-2.5 w-2.5 text-emerald-600 dark:text-emerald-400" />
        ) : !n.isRead ? (
          <span className="block h-1.5 w-1.5 rounded-full bg-primary" aria-label="Unread" />
        ) : null}
      </td>

      {/* Type — small icon + short label, fixed width so labels line up.
          When indented, push right so child items visually nest. */}
      <td className={cn('w-36 px-3 py-1.5 align-middle', indented && 'pl-8')}>
        <span className="inline-flex items-center gap-2">
          <span className={cn('flex h-5 w-5 items-center justify-center rounded-md', cfg.tone)}>
            <Icon className="h-3 w-3" />
          </span>
          <span className="truncate text-[12px] text-foreground/80">{cfg.label}</span>
        </span>
      </td>

      {/* Detail — title + highlighted lead entity + muted rest, one line */}
      <td className="px-3 py-1.5 align-middle text-[12px]">
        <span className="block truncate">
          <NotificationDetail n={n} />
        </span>
      </td>

      {/* When */}
      <td className="w-28 whitespace-nowrap px-3 py-1.5 align-middle text-right text-[10px] tabular-nums text-muted-foreground/70">
        {timeAgo(n.timestamp)}
      </td>

      {/* Actions — hover-revealed; stop propagation so taps don't trigger nav */}
      <td
        className="w-20 px-3 py-1.5 align-middle text-right"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="inline-flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          {!isResolved && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon-sm" variant="ghost" className="h-6 w-6" aria-label="Snooze">
                  <BellOff className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {SNOOZE_PRESETS.map((p) => (
                  <DropdownMenuItem key={p.label} onClick={() => onSnooze(n.id, p.hours)}>
                    {p.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {!isResolved && (
            <Button
              size="icon-sm"
              variant="ghost"
              className="h-6 w-6 text-emerald-700 hover:text-emerald-700 dark:text-emerald-400"
              onClick={() => onResolve(n.id)}
              aria-label="Mark resolved"
            >
              <Check className="h-3 w-3" />
            </Button>
          )}
          <Button
            size="icon-sm"
            variant="ghost"
            className="h-6 w-6 text-muted-foreground hover:text-destructive"
            onClick={() => onDelete(n.id)}
            aria-label="Delete"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </span>
      </td>
    </tr>
  )
}
