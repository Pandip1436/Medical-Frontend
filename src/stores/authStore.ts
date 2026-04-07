import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User, UserRole } from '@/types'

interface MockCredential {
  email: string
  password: string
  user: User
}

const mockCredentials: MockCredential[] = [
  {
    email: 'admin@hospitalsuppliers.com',
    password: 'Admin@123',
    user: {
      id: 'USR-001',
      name: 'Administrator',
      email: 'admin@hospitalsuppliers.com',
      phone: '9876543210',
      role: 'admin' as UserRole,
      avatar: undefined,
      isActive: true,
    },
  },
  {
    email: 'ravi@hospitalsuppliers.com',
    password: 'Pharma@123',
    user: {
      id: 'USR-002',
      name: 'Ravi Kumar',
      email: 'ravi@hospitalsuppliers.com',
      phone: '9876543211',
      role: 'pharmacist' as UserRole,
      avatar: undefined,
      isActive: true,
    },
  },
  {
    email: 'kumar@hospitalsuppliers.com',
    password: 'Stock@123',
    user: {
      id: 'USR-003',
      name: 'Kumar S',
      email: 'kumar@hospitalsuppliers.com',
      phone: '9876543212',
      role: 'inventory_manager' as UserRole,
      avatar: undefined,
      isActive: true,
    },
  },
  {
    email: 'priya@hospitalsuppliers.com',
    password: 'Account@123',
    user: {
      id: 'USR-004',
      name: 'Priya M',
      email: 'priya@hospitalsuppliers.com',
      phone: '9876543213',
      role: 'accountant' as UserRole,
      avatar: undefined,
      isActive: true,
    },
  },
]

type Theme = 'light' | 'dark' | 'system'
type Language = 'en' | 'ta' | 'hi'

interface AuthState {
  // Auth
  user: User | null
  isAuthenticated: boolean
  sessionTimeout: number

  // Preferences
  theme: Theme
  sidebarCollapsed: boolean
  language: Language
  hasCompletedOnboarding: boolean

  // Actions
  login: (email: string, password: string) => boolean
  logout: () => void
  setTheme: (theme: Theme) => void
  resolvedTheme: () => 'light' | 'dark'
  toggleSidebar: () => void
  setLanguage: (language: Language) => void
  setOnboardingComplete: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      // Auth state
      user: null,
      isAuthenticated: false,
      sessionTimeout: 30 * 60 * 1000, // 30 minutes in milliseconds

      // Preference state
      theme: 'system' as Theme,
      sidebarCollapsed: false,
      language: 'en' as Language,
      hasCompletedOnboarding: false,

      // Auth actions
      login: (email: string, password: string): boolean => {
        const credential = mockCredentials.find(
          (c) => c.email.toLowerCase() === email.toLowerCase() && c.password === password
        )

        if (credential) {
          set({
            user: {
              ...credential.user,
              lastLogin: new Date().toISOString(),
            },
            isAuthenticated: true,
          })
          return true
        }

        return false
      },

      logout: () => {
        set({
          user: null,
          isAuthenticated: false,
        })
      },

      // Preference actions
      setTheme: (theme: Theme) => {
        set({ theme })
      },

      resolvedTheme: (): 'light' | 'dark' => {
        const { theme } = get()
        if (theme === 'system') {
          if (typeof window !== 'undefined') {
            return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
          }
          return 'light'
        }
        return theme
      },

      toggleSidebar: () => {
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed }))
      },

      setLanguage: (language: Language) => {
        set({ language })
      },

      setOnboardingComplete: () => {
        set({ hasCompletedOnboarding: true })
      },
    }),
    {
      name: 'pbims-auth-storage',
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        theme: state.theme,
        language: state.language,
        sidebarCollapsed: state.sidebarCollapsed,
        hasCompletedOnboarding: state.hasCompletedOnboarding,
      }),
    }
  )
)
