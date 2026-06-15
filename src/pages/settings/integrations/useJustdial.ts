import { useCallback, useEffect, useRef, useState } from 'react'
import api from '@/lib/api'
import type { IndiamartStatus, IndiamartSyncJob } from './types'

// Hook wrapping every JustdialController endpoint. Mirror of useIndiamart —
// the status / job shapes are identical, only the route prefix differs.
// Auto-refreshes status every 30s.

const STATUS_POLL_MS = 30_000

export function useJustdial() {
  const [status, setStatus] = useState<IndiamartStatus | null>(null)
  const [jobs, setJobs] = useState<IndiamartSyncJob[]>([])
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await api.get<IndiamartStatus>('/integrations/justdial/status')
      setStatus(res.data)
      setError(null)
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      setError(e?.response?.data?.message ?? 'Failed to load status')
    }
  }, [])

  const fetchJobs = useCallback(async () => {
    try {
      const res = await api.get<IndiamartSyncJob[]>('/integrations/justdial/jobs', {
        params: { limit: 25 },
      })
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

  const fetchStatusRef = useRef(fetchStatus)
  fetchStatusRef.current = fetchStatus

  useEffect(() => {
    refetch()
    const id = setInterval(() => fetchStatusRef.current(), STATUS_POLL_MS)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const generateWebhook = useCallback(async () => {
    setGenerating(true)
    try {
      await api.post<IndiamartStatus>('/integrations/justdial/webhook')
      await refetch()
    } finally {
      setGenerating(false)
    }
  }, [refetch])

  const rotateWebhook = useCallback(async () => {
    setGenerating(true)
    try {
      await api.post<IndiamartStatus>('/integrations/justdial/webhook/rotate')
      await refetch()
    } finally {
      setGenerating(false)
    }
  }, [refetch])

  const disconnect = useCallback(async () => {
    setGenerating(true)
    try {
      await api.delete('/integrations/justdial/credential')
      await refetch()
    } finally {
      setGenerating(false)
    }
  }, [refetch])

  const [testing, setTesting] = useState(false)
  const sendTestPush = useCallback(async () => {
    setTesting(true)
    try {
      const res = await api.post<{
        ok: boolean
        unique_query_id: string | null
        webhookUrl: string
        sampleMobile: string
      }>('/integrations/justdial/test-push')
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
