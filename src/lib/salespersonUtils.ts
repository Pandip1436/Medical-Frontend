import { formatDistanceToNow } from 'date-fns'

// ─── Avatar helpers ───────────────────────────────────────────
// Shared by the salesperson list, the create/edit form dialog, and the detail
// page so a given salesperson always gets the same initials + colour.

const AVATAR_PALETTE = [
  'bg-blue-500/15 text-blue-700 dark:text-blue-300',
  'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  'bg-purple-500/15 text-purple-700 dark:text-purple-300',
  'bg-orange-500/15 text-orange-700 dark:text-orange-300',
  'bg-rose-500/15 text-rose-700 dark:text-rose-300',
  'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300',
  'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300',
  'bg-amber-500/15 text-amber-700 dark:text-amber-300',
]

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function getAvatarColor(name: string): string {
  const code = name.trim().charCodeAt(0) || 0
  return AVATAR_PALETTE[code % AVATAR_PALETTE.length]
}

export function formatLastLogin(iso?: string): string {
  if (!iso) return 'Never'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'Never'
  return formatDistanceToNow(d, { addSuffix: true })
}
