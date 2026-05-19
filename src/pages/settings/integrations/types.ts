// Shapes mirroring the backend IndiamartController response payloads.

export type SyncJobStatus =
  | 'RUNNING'
  | 'SUCCESS'
  | 'FAILED'
  | 'RATE_LIMITED'
  | 'NO_NEW_LEADS'

export interface IndiamartLastJob {
  id: string
  status: SyncJobStatus
  startedAt: string
  finishedAt: string | null
  newLeadsCount: number
  dupeSkippedCount: number
  errorCode: number | null
  errorMessage: string | null
}

export interface IndiamartStatus {
  connected: boolean
  isActive: boolean
  // Full webhook URL the seller should paste into IndiaMART → Lead Manager →
  // Push API. Present only when an active token exists.
  webhookUrl: string | null
  lastReceivedAt: string | null
  createdAt: string | null
  // Set when >7 days have passed since the last push — likely an indicator
  // that the seller never finished OTP or pasted a wrong URL.
  stale: boolean
  lastJob: IndiamartLastJob | null
}

export interface IndiamartSyncJob {
  id: string
  status: SyncJobStatus
  startTime: string
  endTime: string
  startedAt: string
  finishedAt: string | null
  totalRecords: number
  newLeadsCount: number
  dupeSkippedCount: number
  errorCode: number | null
  errorMessage: string | null
}
