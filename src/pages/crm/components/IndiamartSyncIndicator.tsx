import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, RefreshCw, XCircle } from 'lucide-react'
import api from '@/lib/api'
import { cn, timeAgo } from '@/lib/utils'
import { navigate } from '@/lib/router'

// Compact pill rendered in the CRM top bar. Polls the IndiaMART status
// endpoint every 60 s and shows a one-glance summary:
//   "Last lead · 4 min ago"     (connected, ok)
//   "Stale — no leads in 7d"    (likely activation problem)
//   "Push error"                (last upsert failed)
// Click → /settings (Integrations section).
//
// Hidden entirely when no webhook is configured for the branch.

interface StatusPayload {
  connected: boolean
  isActive: boolean
  webhookUrl: string | null
  lastReceivedAt: string | null
  stale: boolean
  lastJob: { status: string } | null
}

const POLL_MS = 60_000

export function IndiamartSyncIndicator() {
  const [status, setStatus] = useState<StatusPayload | null>(null)
  const [nowTick, setNowTick] = useState(Date.now())

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const res = await api.get<StatusPayload>('/integrations/indiamart/status')
        if (alive) setStatus(res.data)
      } catch {
        // Silent — admin without branch / no permission shouldn't see the pill.
        if (alive) setStatus(null)
      }
    }
    load()
    const id = setInterval(load, POLL_MS)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])

  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 5_000)
    return () => clearInterval(id)
  }, [])

  if (!status || !status.connected) return null
  void nowTick // keep listener alive so timeAgo re-renders periodically

  const failed = status.lastJob?.status === 'FAILED'

  let label: string
  let Icon = CheckCircle2
  let tone: string

  if (failed) {
    label = 'Push error'
    Icon = XCircle
    tone = 'text-rose-700 dark:text-rose-400'
  } else if (status.stale) {
    label = 'Stale — check IndiaMART'
    Icon = AlertTriangle
    tone = 'text-amber-700 dark:text-amber-400'
  } else if (status.lastReceivedAt) {
    label = `Last lead ${timeAgo(status.lastReceivedAt)}`
    Icon = CheckCircle2
    tone = 'text-muted-foreground hover:text-foreground'
  } else {
    label = 'Awaiting first push'
    Icon = RefreshCw
    tone = 'text-muted-foreground hover:text-foreground'
  }

  return (
    <button
      type="button"
      onClick={() => navigate('/settings')}
      title="IndiaMART integration — click to open Settings"
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
        tone,
      )}
    >
      <Icon className="h-3 w-3" />
      <span>{label}</span>
    </button>
  )
}
