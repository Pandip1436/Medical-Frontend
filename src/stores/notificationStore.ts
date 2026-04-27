import { create } from 'zustand'
import type { Notification } from '@/types'
import api from '@/lib/api'

// Strip internal dedup markers like [productId:xxx] [batchId:xxx] [invoiceId:xxx]
function cleanMessage(msg: string): string {
  return msg.replace(/\s*\[\w+Id:[^\]]+\]/g, '').trim()
}

function mapRaw(n: any): Notification {
  return {
    ...n,
    timestamp: n.createdAt ?? n.timestamp ?? new Date().toISOString(),
    message: cleanMessage(n.message ?? ''),
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
  markAsRead: (id: string) => Promise<void>
  markAllAsRead: () => Promise<void>
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

  markAsRead: async (id: string) => {
    set((state) => ({
      notifications: state.notifications.map((n) => n.id === id ? { ...n, isRead: true } : n),
    }))
    try { await api.patch(`/notifications/${id}/read`) } catch { /* optimistic update already applied */ }
  },

  markAllAsRead: async () => {
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, isRead: true })),
    }))
    try { await api.patch('/notifications/read-all') } catch { /* optimistic update already applied */ }
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
