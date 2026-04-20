import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User, UserRole } from '@/types'

import api from '@/lib/api'

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
  mobileSidebarOpen: boolean
  language: Language
  hasCompletedOnboarding: boolean

  // Actions
  login: (email: string, password: string) => Promise<boolean>
  logout: () => void
  setTheme: (theme: Theme) => void
  resolvedTheme: () => 'light' | 'dark'
  toggleSidebar: () => void
  toggleMobileSidebar: () => void
  setMobileSidebarOpen: (open: boolean) => void
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
      mobileSidebarOpen: false,
      language: 'en' as Language,
      hasCompletedOnboarding: false,

      // Auth actions
      login: async (email: string, password: string): Promise<boolean> => {
        try {
          const response = await api.post('/auth/login', { email, password });
          if (response.data && response.data.data) {
            const { user, accessToken } = response.data.data;

            localStorage.setItem('auth_token', accessToken.token);

            set({
              user: {
                ...user,
                lastLogin: new Date().toISOString(),
              },
              isAuthenticated: true,
            });

            // If user has an assigned branch, lock the active branch to it
            if (user.branchId) {
              try {
                const { useBranchStore } = await import('@/stores/branchStore');
                const branchStore = useBranchStore.getState();
                await branchStore.fetchBranches();
                branchStore.setActiveBranch(user.branchId);
              } catch { /* ignore */ }
            }

            return true;
          }
          return false;
        } catch (error) {
          console.error("Login failed:", error);
          return false;
        }
      },

      logout: () => {
        localStorage.removeItem('auth_token');
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

      toggleMobileSidebar: () => {
        set((state) => ({ mobileSidebarOpen: !state.mobileSidebarOpen }))
      },

      setMobileSidebarOpen: (open: boolean) => {
        set({ mobileSidebarOpen: open })
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
