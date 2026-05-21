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
          const payload = response.data?.data;
          const user = payload?.user;
          const token = payload?.accessToken?.token;

          // Defensive: the backend response shape must include a non-empty
          // token + user. If it shifts (e.g. `accessToken` becomes a string),
          // we want a clean false instead of storing the literal "undefined".
          if (!user || !token || typeof token !== 'string') {
            return false;
          }

          localStorage.setItem('auth_token', token);

          set({
            user: {
              ...user,
              lastLogin: new Date().toISOString(),
            },
            isAuthenticated: true,
          });

          // If user has an assigned branch, lock the active branch to it.
          // `skipNavigate` keeps the post-login redirect in App.tsx in charge
          // of the landing route (role-aware) — without it, setActiveBranch's
          // soft-switch redirect to /dashboard would race in and override the
          // role-aware destination. See BUGS.md SEV-3.
          if (user.branchId) {
            try {
              const { useBranchStore } = await import('@/stores/branchStore');
              const branchStore = useBranchStore.getState();
              await branchStore.fetchBranches();
              branchStore.setActiveBranch(user.branchId, { skipNavigate: true });
            } catch { /* ignore */ }
          }

          return true;
        } catch {
          // Global error toast already shown by the axios response interceptor.
          return false;
        }
      },

      logout: () => {
        localStorage.removeItem('auth_token');
        set({
          user: null,
          isAuthenticated: false,
        })
        // Best-effort: clear in-memory data from sibling stores so a fresh
        // login doesn't briefly flash the previous user's data.
        void Promise.all([
          import('@/stores/notificationStore').then(({ useNotificationStore }) => {
            useNotificationStore.setState({ notifications: [] })
          }),
          import('@/stores/masterDataStore').then(({ useMasterDataStore }) => {
            useMasterDataStore.setState({
              products: [], customers: [], suppliers: [], purchaseOrders: [],
              batches: [], categories: [], hasLoaded: false,
            })
          }),
        ]).catch(() => { /* sibling clear is best-effort */ })
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
