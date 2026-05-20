import { useCallback, useEffect, useRef, useState } from 'react'
import api from '@/lib/api'
import type { IndiamartStatus, IndiamartSyncJob } from './types'

// Hook wrapping every IndiamartController endpoint. Auto-refreshes status
// every 30 s so the "Last received" timestamp + stale warning stay live
// while the card is on screen.

const STATUS_POLL_MS = 30_000

export function useIndiamart() {
  const [status, setStatus] = useState<IndiamartStatus | null>(null)
  const [jobs, setJobs] = useState<IndiamartSyncJob[]>([])
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await api.get<IndiamartStatus>(
        '/integrations/indiamart/status',
      )
      setStatus(res.data)
      setError(null)
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      setError(e?.response?.data?.message ?? 'Failed to load status')
    }
  }, [])

  const fetchJobs = useCallback(async () => {
    try {
      const res = await api.get<IndiamartSyncJob[]>(
        '/integrations/indiamart/jobs',
        { params: { limit: 25 } },
      )
      setJobs(res.data ?? [])
    } catch {
      /* non-fatal */
    }
  }, [])

  const refetch = useCallback(async () => {
    setLoading(true)
    await Promise.all([fetchStatus(), fetchJobs()])
    setLoading(false)
  }, [fetchStatus, fetchJobs])

  // Pin the latest fetchStatus in a ref so the polling interval is bound
  // exactly once (otherwise the interval re-creates on every render and old
  // intervals can stack up, hammering the API). Same pattern as
  // useKeyboardShortcuts.
  const fetchStatusRef = useRef(fetchStatus)
  fetchStatusRef.current = fetchStatus

  useEffect(() => {
    refetch()
    const id = setInterval(() => fetchStatusRef.current(), STATUS_POLL_MS)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Idempotent: returns existing webhook URL if already generated.
  const generateWebhook = useCallback(async () => {
    setGenerating(true)
    try {
      await api.post<IndiamartStatus>('/integrations/indiamart/webhook')
      await refetch()
    } finally {
      setGenerating(false)
    }
  }, [refetch])

  // Mints a new token; old URL stops working immediately. Useful if the URL
  // leaked or the user pasted it in the wrong panel.
  const rotateWebhook = useCallback(async () => {
    setGenerating(true)
    try {
      await api.post<IndiamartStatus>('/integrations/indiamart/webhook/rotate')
      await refetch()
    } finally {
      setGenerating(false)
    }
  }, [refetch])

  const disconnect = useCallback(async () => {
    setGenerating(true)
    try {
      await api.delete('/integrations/indiamart/credential')
      await refetch()
    } finally {
      setGenerating(false)
    }
  }, [refetch])

  // Synthesizes a sample IndiaMART payload server-side and runs it through
  // the real receiver pipeline. Verifies token lookup, lead upsert, contact
  // dedup, audit logging, and notification flow — all without an IndiaMART
  // account or public URL.
  const [testing, setTesting] = useState(false)
  const sendTestPush = useCallback(async () => {
    setTesting(true)
    try {
      const res = await api.post<{
        ok: boolean
        unique_query_id: string | null
        webhookUrl: string
        sampleMobile: string
      }>('/integrations/indiamart/test-push')
      await refetch()
      return res.data
    } finally {
      setTesting(false)
    }
  }, [refetch])

  return {
    status,
    jobs,
    loading,
    generating,
    testing,
    error,
    refetch,
    generateWebhook,
    rotateWebhook,
    disconnect,
    sendTestPush,
  }
}
