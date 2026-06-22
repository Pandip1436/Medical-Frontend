import { useState } from 'react'
import { toast } from 'sonner'
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  ExternalLink,
  FlaskConical,
  Loader2,
  PowerOff,
  RefreshCw,
  Webhook,
  XCircle,
} from 'lucide-react'
import { navigate } from '@/lib/router'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { cn, formatDateTime, timeAgo } from '@/lib/utils'

import { useJustdial } from './useJustdial'
import type { SyncJobStatus } from './types'

// Just Dial push integration card — mirror of IndiamartCard. The supplier
// pastes our webhook URL into their Just Dial Lead Manager; every new lead
// then lands in /crm/leads automatically. Dedup is by Just Dial's lead id.

const STATUS_LABEL: Record<SyncJobStatus, string> = {
  RUNNING: 'Processing',
  SUCCESS: 'Saved',
  FAILED: 'Failed',
  RATE_LIMITED: 'Rate limited',
  NO_NEW_LEADS: 'Duplicate',
}

const STATUS_TONE: Record<
  SyncJobStatus,
  'success' | 'destructive' | 'warning' | 'info' | 'secondary'
> = {
  RUNNING: 'info',
  SUCCESS: 'success',
  FAILED: 'destructive',
  RATE_LIMITED: 'warning',
  NO_NEW_LEADS: 'secondary',
}

export function JustdialCard() {
  const {
    status,
    jobs,
    generating,
    testing,
    error,
    generateWebhook,
    rotateWebhook,
    disconnect,
    sendTestPush,
  } = useJustdial()

  const [copied, setCopied] = useState(false)
  // Which confirm dialog is open (replaces native window.confirm()).
  const [confirmAction, setConfirmAction] = useState<null | 'rotate' | 'disconnect'>(null)
  const connected = !!status?.connected
  const url = status?.webhookUrl ?? null

  const handleGenerate = async () => {
    try {
      await generateWebhook()
      toast.success('Webhook URL generated.')
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      toast.error(e?.response?.data?.message ?? 'Failed to generate URL')
    }
  }

  const handleRotate = async () => {
    try {
      await rotateWebhook()
      toast.success('Webhook URL rotated. Paste the new one into Just Dial.')
    } catch {
      toast.error('Rotate failed')
    } finally {
      setConfirmAction(null)
    }
  }

  const handleTestPush = async () => {
    try {
      const r = await sendTestPush()
      toast.success(
        r.unique_query_id
          ? `Test lead created (lead id ${r.unique_query_id}). Check /crm/leads.`
          : 'Test payload accepted.',
        {
          duration: 6000,
          action: { label: 'Open Leads', onClick: () => navigate('/crm/leads') },
        },
      )
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      toast.error(e?.response?.data?.message ?? 'Test push failed')
    }
  }

  const handleDisconnect = async () => {
    try {
      await disconnect()
      toast.success('Just Dial disconnected.')
    } catch {
      toast.error('Failed to disconnect')
    } finally {
      setConfirmAction(null)
    }
  }

  const handleCopy = async () => {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      toast.success('Webhook URL copied.')
    } catch {
      toast.error('Could not copy — select and copy manually')
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Webhook className="h-4 w-4 text-primary" />
              Just Dial (Leads API)
            </CardTitle>
            <CardDescription className="mt-1">
              Receives leads from your Just Dial account in real-time. Every new
              enquiry / call lands in /crm/leads within seconds. Dedup is automatic.
            </CardDescription>
          </div>
          <StatusPill connected={connected} stale={status?.stale ?? false} />
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {connected && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            {status?.lastReceivedAt ? (
              <span>
                Last lead{' '}
                <span className="text-foreground">{timeAgo(status.lastReceivedAt)}</span>
              </span>
            ) : (
              <span>Awaiting first push from Just Dial…</span>
            )}
            {status?.createdAt && (
              <span>
                Connected{' '}
                <span className="text-foreground">{timeAgo(status.createdAt)}</span>
              </span>
            )}
            {status?.lastJob && (
              <span>
                Last result{' '}
                <span className="text-foreground">{STATUS_LABEL[status.lastJob.status]}</span>
              </span>
            )}
          </div>
        )}

        {connected && status?.stale && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-300/60 bg-amber-500/[0.07] px-3 py-2.5 text-xs text-amber-800 dark:border-amber-700/40 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">No leads received in 7+ days</p>
              <p className="mt-0.5 text-amber-700/80 dark:text-amber-400/80">
                Just Dial may not be configured yet. Double-check the URL is
                pasted correctly in your Just Dial Lead Manager.
              </p>
            </div>
          </div>
        )}

        {!connected && (
          <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-6 text-center">
            <Webhook className="mx-auto h-8 w-8 text-muted-foreground/50" />
            <p className="mt-2 text-sm font-medium">No webhook configured</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Click below to mint a unique URL for this branch. Then paste it
              into your Just Dial Lead Manager.
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <Button type="button" onClick={handleGenerate} disabled={generating} className="gap-1.5">
                {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Webhook className="h-3.5 w-3.5" />}
                Generate webhook URL
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleTestPush}
                disabled={testing}
                className="gap-1.5"
                title="Mints a URL (if missing) then runs a sample lead through the receiver — no Just Dial account needed."
              >
                {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FlaskConical className="h-3.5 w-3.5" />}
                Send test push
              </Button>
            </div>
          </div>
        )}

        {connected && url && (
          <div className="space-y-3">
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Your webhook URL
              </Label>
              <div className="mt-1.5 flex gap-2">
                <Input
                  readOnly
                  value={url}
                  onFocus={(e) => e.currentTarget.select()}
                  className="font-mono text-xs"
                />
                <Button type="button" variant="outline" size="sm" onClick={handleCopy} className="shrink-0 gap-1.5">
                  {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
            </div>

            <details className="rounded-lg border border-border/60 bg-muted/20 p-3 text-xs">
              <summary className="cursor-pointer font-semibold text-foreground">
                How to activate it on Just Dial (one-time)
              </summary>
              <ol className="mt-2 space-y-1.5 pl-4 list-decimal text-muted-foreground">
                <li>
                  Open your{' '}
                  <a
                    href="https://www.justdial.com/"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-0.5 text-primary hover:underline"
                  >
                    Just Dial Lead Manager
                    <ExternalLink className="h-3 w-3" />
                  </a>{' '}
                  (or ask your Just Dial account manager to enable the Leads API webhook).
                </li>
                <li>Paste the URL above into the lead webhook / push URL field.</li>
                <li>Save. New leads start flowing immediately.</li>
                <li>Leads from before activation are not sent — only new ones.</li>
              </ol>
            </details>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button type="button" variant="default" size="sm" onClick={handleTestPush} disabled={testing} className="gap-1.5">
                {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FlaskConical className="h-3.5 w-3.5" />}
                Send test push
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setConfirmAction('rotate')} disabled={generating} className="gap-1.5">
                {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Rotate URL
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setConfirmAction('disconnect')}
                disabled={generating}
                className="gap-1.5 text-rose-700 hover:bg-rose-500/10 hover:text-rose-800 dark:text-rose-400"
              >
                <PowerOff className="h-3.5 w-3.5" />
                Disconnect
              </Button>
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-rose-300/40 bg-rose-500/5 px-3 py-2 text-xs text-rose-700 dark:text-rose-400">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {jobs.length > 0 && (
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Recent pushes ({jobs.length})
            </Label>
            <div className="overflow-hidden rounded-lg border border-border/60">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">When</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-left">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {jobs.map((job) => (
                    <tr key={job.id} className="hover:bg-muted/30">
                      <td className="px-3 py-2">
                        <div className="font-medium text-foreground">{timeAgo(job.startedAt)}</div>
                        <div className="text-[10px] text-muted-foreground">{formatDateTime(job.startedAt)}</div>
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant={STATUS_TONE[job.status]} size="sm" className="gap-1">
                          {job.status === 'SUCCESS' && <CheckCircle2 className="h-3 w-3" />}
                          {job.status === 'FAILED' && <XCircle className="h-3 w-3" />}
                          {STATUS_LABEL[job.status]}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {job.errorMessage ? (
                          <span className="text-rose-700 dark:text-rose-400">
                            {job.errorCode ? `${job.errorCode}: ` : ''}
                            {job.errorMessage}
                          </span>
                        ) : job.status === 'NO_NEW_LEADS' ? (
                          <span className="text-[11px]">Duplicate — already in CRM</span>
                        ) : job.status === 'SUCCESS' ? (
                          <span className="text-[11px] text-emerald-700 dark:text-emerald-400">New lead saved</span>
                        ) : (
                          <span className="text-[11px]">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <ConfirmDialog
          open={confirmAction !== null}
          onOpenChange={(o) => { if (!o) setConfirmAction(null) }}
          destructive={confirmAction === 'disconnect'}
          icon={confirmAction === 'disconnect' ? PowerOff : RefreshCw}
          title={confirmAction === 'disconnect' ? 'Disconnect Just Dial?' : 'Rotate the webhook URL?'}
          description={
            confirmAction === 'disconnect'
              ? <>New leads will stop arriving until you re-activate.</>
              : <>The current URL stops working immediately — you'll need to paste the new one into Just Dial again.</>
          }
          confirmLabel={confirmAction === 'disconnect' ? 'Disconnect' : 'Rotate URL'}
          busyLabel={confirmAction === 'disconnect' ? 'Disconnecting…' : 'Rotating…'}
          onConfirm={confirmAction === 'disconnect' ? handleDisconnect : handleRotate}
        />
      </CardContent>
    </Card>
  )
}

function StatusPill({ connected, stale }: { connected: boolean; stale: boolean }) {
  if (!connected) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-1 text-[11px] font-semibold text-muted-foreground">
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
        Not connected
      </span>
    )
  }
  if (stale) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2 py-1 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
        <AlertTriangle className="h-3 w-3" />
        Stale
      </span>
    )
  }
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400')}>
      <CheckCircle2 className="h-3 w-3" />
      Connected
    </span>
  )
}
