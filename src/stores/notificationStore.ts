import { create } from 'zustand'
import type { Notification } from '@/types'

interface NotificationState {
  notifications: Notification[]
  unreadCount: () => number

  // Actions
  addNotification: (notification: Notification) => void
  removeNotification: (id: string) => void
  markAsRead: (id: string) => void
  markAllAsRead: () => void
}

export const useNotificationStore = create<NotificationState>()((set, get) => ({
  notifications: [],

  unreadCount: (): number => {
    return get().notifications.filter((n) => !n.isRead).length
  },

  addNotification: (notification: Notification) => {
    set((state) => ({
      notifications: [notification, ...state.notifications],
    }))
  },

  removeNotification: (id: string) => {
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    }))
  },

  markAsRead: (id: string) => {
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, isRead: true } : n
      ),
    }))
  },

  markAllAsRead: () => {
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, isRead: true })),
    }))
  },
}))
