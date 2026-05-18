import { useCallback, useEffect, useState } from 'react'
import api from '@/lib/api'
import type { Lead, LeadSource, LeadStage } from '../types'
import { MOCK_LEADS, USE_MOCK_DATA } from '../mockData'

// ─── Types matching the backend response shapes ──────────────────────────

export interface LeadsAnalyticsSummary {
  period: { from: string; to: string }
  kpis: {
    totalLeads: number
    totalLeadsPrev: number
    totalLeadsDelta: number | null
    pipelineValue: number
    openLeads: number
    winRate: number
    wonCount: number
    lostCount: number
    avgDealSize: number
  }
  funnel: { stage: LeadStage; count: number }[]
  sourceBreakdown: {
    source: LeadSource
    count: number
    won: number
    winRate: number
  }[]
  aging: ({
    stage: LeadStage
  } & Record<'0-7d' | '7-30d' | '30-90d' | '90d+', number>)[]
}

export interface LeadsAnalyticsTrend {
  bucket: 'day' | 'month'
  series: { key: string; created: number; won: number }[]
}

export interface NeedsAttentionLead {
  id: string
  leadNumber: string
  title: string
  stage: LeadStage
  value: number
  currency: string
  updatedAt: string
  daysSinceUpdate: number
  contact: {
    id: string
    firstName: string
    lastName: string | null
    phone: string | null
  } | null
  assignedToUser: { id: string; name: string } | null
}

export interface LeadsAnalyticsNeedsAttention {
  staleDays: number
  total: number
  leads: NeedsAttentionLead[]
}

// ─── Period helpers ──────────────────────────────────────────────────────

// Relative-time presets. The `month` kind below is a separate shape so the
// type signal stays clear at every callsite.
export type AnalyticsPresetKey = '7d' | '30d' | '90d' | 'ytd'

export type AnalyticsPeriod =
  | { kind: 'preset'; preset: AnalyticsPresetKey }
  | { kind: 'month'; anchor: string } // 'YYYY-MM'

export interface AnalyticsPeriodRange {
  from: string
  to: string
  bucket: 'day' | 'month'
  /** Human label for the trigger button. */
  label: string
}

const PRESET_LABELS: Record<AnalyticsPresetKey, string> = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  ytd: 'This Year',
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

export function periodToRange(period: AnalyticsPeriod): AnalyticsPeriodRange {
  if (period.kind === 'preset') {
    const to = new Date()
    const from = new Date()
    let bucket: 'day' | 'month' = 'day'
    switch (period.preset) {
      case '7d':
        from.setDate(to.getDate() - 7)
        break
      case '30d':
        from.setDate(to.getDate() - 30)
        break
      case '90d':
        from.setDate(to.getDate() - 90)
        break
      case 'ytd':
        from.setMonth(0, 1)
        from.setHours(0, 0, 0, 0)
        bucket = 'month'
        break
    }
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      bucket,
      label: PRESET_LABELS[period.preset],
    }
  }
  // Month kind — anchor is 'YYYY-MM'. Window covers the entire month.
  const [yStr, mStr] = period.anchor.split('-')
  const y = Number(yStr)
  const m = Number(mStr) - 1
  const from = new Date(y, m, 1, 0, 0, 0, 0)
  const to = new Date(y, m + 1, 0, 23, 59, 59, 999)
  return {
    from: from.toISOString(),
    to: to.toISOString(),
    bucket: 'day',
    label: `${MONTH_NAMES[m]} ${y}`,
  }
}

/** Helper: today as 'YYYY-MM'. */
export function currentMonthAnchor(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Helper: shift a 'YYYY-MM' anchor by N months. */
export function shiftMonthAnchor(anchor: string, deltaMonths: number): string {
  const [yStr, mStr] = anchor.split('-')
  const d = new Date(Number(yStr), Number(mStr) - 1 + deltaMonths, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// ─── Mock synthesizer (mirrors backend logic on MOCK_LEADS) ──────────────

const STAGE_ORDER: LeadStage[] = [
  'LEAD',
  'QUALIFIED',
  'PROPOSAL',
  'NEGOTIATION',
  'WON',
  'LOST',
]

function mockSummary(from: string, to: string): LeadsAnalyticsSummary {
  const fromMs = new Date(from).getTime()
  const toMs = new Date(to).getTime()
  const prevFrom = fromMs - (toMs - fromMs)

  const inPeriod = (l: Lead) => {
    const t = new Date(l.createdAt).getTime()
    return t >= fromMs && t <= toMs
  }
  const inPrev = (l: Lead) => {
    const t = new Date(l.createdAt).getTime()
    return t >= prevFrom && t < fromMs
  }
  const closedInPeriod = (l: Lead) => {
    const t = new Date(l.updatedAt).getTime()
    return l.status === 'CLOSED' && t >= fromMs && t <= toMs
  }

  const created = MOCK_LEADS.filter(inPeriod)
  const prevCreated = MOCK_LEADS.filter(inPrev)
  const open = MOCK_LEADS.filter((l) => l.status === 'OPEN')
  const closed = MOCK_LEADS.filter(closedInPeriod)
  const won = closed.filter((l) => l.stage === 'WON')
  const lost = closed.filter((l) => l.stage === 'LOST')

  const pipelineValue = open.reduce((s, l) => s + Number(l.value || 0), 0)
  const winRate = closed.length > 0 ? won.length / closed.length : 0
  const avgDealSize =
    won.length > 0
      ? won.reduce((s, l) => s + Number(l.value || 0), 0) / won.length
      : 0

  const funnel = STAGE_ORDER.map((stage) => ({
    stage,
    count: created.filter((l) => l.stage === stage).length,
  }))

  const sourceMap = new Map<LeadSource, { count: number; won: number }>()
  for (const l of created) {
    const cur = sourceMap.get(l.source) ?? { count: 0, won: 0 }
    cur.count++
    if (l.stage === 'WON') cur.won++
    sourceMap.set(l.source, cur)
  }
  const sourceBreakdown = Array.from(sourceMap.entries())
    .map(([source, v]) => ({
      source,
      count: v.count,
      won: v.won,
      winRate: v.count > 0 ? v.won / v.count : 0,
    }))
    .sort((a, b) => b.count - a.count)

  const now = Date.now()
  const agingStages: LeadStage[] = [
    'LEAD',
    'QUALIFIED',
    'PROPOSAL',
    'NEGOTIATION',
  ]
  const aging = agingStages.map((stage) => {
    const row = {
      stage,
      '0-7d': 0,
      '7-30d': 0,
      '30-90d': 0,
      '90d+': 0,
    } as { stage: LeadStage } & Record<
      '0-7d' | '7-30d' | '30-90d' | '90d+',
      number
    >
    open
      .filter((l) => l.stage === stage)
      .forEach((l) => {
        const ageDays =
          (now - new Date(l.createdAt).getTime()) / 86_400_000
        if (ageDays < 7) row['0-7d']++
        else if (ageDays < 30) row['7-30d']++
        else if (ageDays < 90) row['30-90d']++
        else row['90d+']++
      })
    return row
  })

  return {
    period: { from, to },
    kpis: {
      totalLeads: created.length,
      totalLeadsPrev: prevCreated.length,
      totalLeadsDelta:
        prevCreated.length > 0
          ? (created.length - prevCreated.length) / prevCreated.length
          : null,
      pipelineValue,
      openLeads: open.length,
      winRate,
      wonCount: won.length,
      lostCount: lost.length,
      avgDealSize,
    },
    funnel,
    sourceBreakdown,
    aging,
  }
}

function mockTrend(
  from: string,
  to: string,
  bucket: 'day' | 'month',
): LeadsAnalyticsTrend {
  const fromMs = new Date(from).getTime()
  const toMs = new Date(to).getTime()
  const keyFor = (d: Date) => {
    const y = d.getUTCFullYear()
    const m = String(d.getUTCMonth() + 1).padStart(2, '0')
    if (bucket === 'month') return `${y}-${m}`
    const day = String(d.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
  const map: Record<string, { created: number; won: number }> = {}
  const cursor = new Date(fromMs)
  while (cursor.getTime() <= toMs) {
    map[keyFor(cursor)] = { created: 0, won: 0 }
    if (bucket === 'day') cursor.setUTCDate(cursor.getUTCDate() + 1)
    else cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  }
  for (const l of MOCK_LEADS) {
    const ct = new Date(l.createdAt).getTime()
    if (ct >= fromMs && ct <= toMs) {
      const k = keyFor(new Date(l.createdAt))
      if (map[k]) map[k].created++
    }
    if (l.stage === 'WON') {
      const ut = new Date(l.updatedAt).getTime()
      if (ut >= fromMs && ut <= toMs) {
        const k = keyFor(new Date(l.updatedAt))
        if (map[k]) map[k].won++
      }
    }
  }
  return {
    bucket,
    series: Object.entries(map)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([key, v]) => ({ key, created: v.created, won: v.won })),
  }
}

function mockNeedsAttention(
  staleDays: number,
  limit: number,
): LeadsAnalyticsNeedsAttention {
  const cutoff = Date.now() - staleDays * 86_400_000
  const stale = MOCK_LEADS.filter(
    (l) => l.status === 'OPEN' && new Date(l.updatedAt).getTime() < cutoff,
  )
    .sort((a, b) => Number(b.value || 0) - Number(a.value || 0))
    .slice(0, limit)
  return {
    staleDays,
    total: stale.length,
    leads: stale.map((l) => ({
      id: l.id,
      leadNumber: l.leadNumber,
      title: l.title,
      stage: l.stage,
      value: Number(l.value || 0),
      currency: l.currency,
      updatedAt: l.updatedAt,
      daysSinceUpdate: Math.floor(
        (Date.now() - new Date(l.updatedAt).getTime()) / 86_400_000,
      ),
      contact: l.contact
        ? {
            id: l.contact.id,
            firstName: l.contact.firstName,
            lastName: l.contact.lastName ?? null,
            phone: l.contact.phone ?? null,
          }
        : null,
      assignedToUser: l.assignedToUser
        ? { id: l.assignedToUser.id, name: l.assignedToUser.name }
        : null,
    })),
  }
}

// ─── Hooks ───────────────────────────────────────────────────────────────

export function useLeadsAnalytics(period: AnalyticsPeriod) {
  const range = periodToRange(period)
  const [summary, setSummary] = useState<LeadsAnalyticsSummary | null>(null)
  const [trend, setTrend] = useState<LeadsAnalyticsTrend | null>(null)
  const [needsAttention, setNeedsAttention] =
    useState<LeadsAnalyticsNeedsAttention | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)

    if (USE_MOCK_DATA) {
      // Synthesize on the client so the page renders without a backend.
      // Slight delay mimics network so loading states are exercised.
      await new Promise((r) => setTimeout(r, 60))
      setSummary(mockSummary(range.from, range.to))
      setTrend(mockTrend(range.from, range.to, range.bucket))
      setNeedsAttention(mockNeedsAttention(7, 10))
      setLoading(false)
      return
    }

    try {
      const [summaryRes, trendRes, naRes] = await Promise.all([
        api.get('/leads/analytics/summary', {
          params: { from: range.from, to: range.to },
        }),
        api.get('/leads/analytics/trend', {
          params: { from: range.from, to: range.to, bucket: range.bucket },
        }),
        api.get('/leads/analytics/needs-attention', {
          params: { staleDays: 7, limit: 10 },
        }),
      ])
      setSummary(summaryRes.data)
      setTrend(trendRes.data)
      setNeedsAttention(naRes.data)
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      setError(e?.response?.data?.message ?? 'Failed to load analytics')
    } finally {
      setLoading(false)
    }
    // periodToRange returns fresh dates every call, so depend on the input shape.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period.kind, period.kind === 'preset' ? period.preset : period.anchor])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { summary, trend, needsAttention, loading, error, refetch, range }
}
