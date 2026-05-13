import { create } from 'zustand'
import type { Notification } from '@/types'
import api from '@/lib/api'

// Preserve internal markers like [productId:xxx] / [batchId:xxx] / [invoiceId:xxx]
// — display components strip them at render time, and click-time deep-link
// resolution needs the markers to extract the entity id for routing.
function mapRaw(n: any): Notification {
  return {
    ...n,
    timestamp: n.createdAt ?? n.timestamp ?? new Date().toISOString(),
    message: n.message ?? '',
  }
}

interface NotificationState {
  notifications: Notification[]
  isLoading: boolean
  unreadCount: () => number

  // Actions
  fetchNotifications: () => Promise<void>
  addNotification: (notification: Notification) => void
  removeNotification: (id: string) => Promise<void>
  removeMany: (ids: string[]) => Promise<void>
  markAsRead: (id: string) => Promise<void>
  markManyAsRead: (ids: string[]) => Promise<void>
  markAllAsRead: () => Promise<void>
  snooze: (id: string, until: Date) => Promise<void>
  resolve: (id: string) => Promise<void>
  generateAlerts: () => Promise<void>
  startPolling: () => () => void
}

export const useNotificationStore = create<NotificationState>()((set, get) => ({
  notifications: [],
  isLoading: false,

  unreadCount: (): number => {
    return get().notifications.filter((n) => !n.isRead).length
  },

  fetchNotifications: async () => {
    set({ isLoading: true })
    try {
      const res = await api.get('/notifications')
      const raw = Array.isArray(res.data) ? res.data : []
      set({ notifications: raw.map(mapRaw) })
    } catch {
      // global api interceptor already shows the toast
    } finally {
      set({ isLoading: false })
    }
  },

  addNotification: (notification: Notification) => {
    set((state) => ({
      notifications: [notification, ...state.notifications],
    }))
  },

  removeNotification: async (id: string) => {
    set((state) => ({ notifications: state.notifications.filter((n) => n.id !== id) }))
    try { await api.delete(`/notifications/${id}`) } catch { /* optimistic delete already applied */ }
  },

  removeMany: async (ids: string[]) => {
    if (!ids.length) return
    const idSet = new Set(ids)
    set((state) => ({ notifications: state.notifications.filter((n) => !idSet.has(n.id)) }))
    try { await api.post('/notifications/delete-bulk', { ids }) } catch { /* optimistic delete already applied */ }
  },

  markAsRead: async (id: string) => {
    set((state) => ({
      notifications: state.notifications.map((n) => n.id === id ? { ...n, isRead: true } : n),
    }))
    try { await api.patch(`/notifications/${id}/read`) } catch { /* optimistic update already applied */ }
  },

  markManyAsRead: async (ids: string[]) => {
    if (!ids.length) return
    const idSet = new Set(ids)
    set((state) => ({
      notifications: state.notifications.map((n) => idSet.has(n.id) ? { ...n, isRead: true } : n),
    }))
    try { await api.patch('/notifications/read-bulk', { ids }) } catch { /* optimistic update already applied */ }
  },

  markAllAsRead: async () => {
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, isRead: true })),
    }))
    try { await api.patch('/notifications/read-all') } catch { /* optimistic update already applied */ }
  },

  snooze: async (id: string, until: Date) => {
    // Snoozed items hide from the list (server filters them on next fetch).
    set((state) => ({ notifications: state.notifications.filter((n) => n.id !== id) }))
    try { await api.patch(`/notifications/${id}/snooze`, { until: until.toISOString() }) } catch { /* optimistic hide already applied */ }
  },

  resolve: async (id: string) => {
    // Mark as resolved + read in one shot. We keep the row visible so the user
    // can see the "Resolved" badge and audit info — the server returns it with resolvedAt set.
    const nowIso = new Date().toISOString()
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, isRead: true, resolvedAt: nowIso } : n,
      ),
    }))
    try { await api.patch(`/notifications/${id}/resolve`) } catch { /* optimistic update already applied */ }
  },

  generateAlerts: async () => {
    await api.post('/notifications/generate/all')
    await get().fetchNotifications()
  },

  startPolling: () => {
    const poll = () => {
      api.get('/notifications').then((res) => {
        const raw = Array.isArray(res.data) ? res.data : []
        set({ notifications: raw.map(mapRaw) })
      }).catch(() => { /* ignore background poll failures */ })
    }

    const id = setInterval(poll, 60_000)
    return () => clearInterval(id)
  },
}))
