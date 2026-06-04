import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User, UserRole } from '@/types'

import api from '@/lib/api'

type Theme = 'light' | 'dark' | 'system'
type Language = 'en' | 'ta' | 'hi'

// Display-scale factor, applied as a root font-size multiplier (see
// src/hooks/useUiScale.ts). 'auto' partially counteracts OS display-scaling;
// a number is a fixed factor (e.g. 0.8 = 80%). Per-device — see resolvedUiScale.
type UiScale = 'auto' | number

// Lower bound for auto mode. Auto only PARTIALLY counteracts OS scaling:
// fully cancelling it (e.g. 1/1.5 = 0.667 at Windows 150%) renders the app at
// 100%-density, which is too small to read comfortably — 150% exists so text
// is a comfortable size. The 0.8 floor relieves the "oversized/congested"
// feeling (≈120% effective at 150% scaling) while staying readable. Users who
// want larger/smaller pick a fixed value in Settings → General → Display Scale.
const UI_SCALE_AUTO_MIN = 0.8

interface AuthState {
  // Auth
  user: User | null
  isAuthenticated: boolean

  // Preferences
  theme: Theme
  sidebarCollapsed: boolean
  expandedSection: string | null
  mobileSidebarOpen: boolean
  language: Language
  uiScale: UiScale
  hasCompletedOnboarding: boolean

  // Actions
  login: (email: string, password: string) => Promise<boolean>
  logout: () => void
  setTheme: (theme: Theme) => void
  resolvedTheme: () => 'light' | 'dark'
  toggleSidebar: () => void
  toggleSection: (title: string) => void
  toggleMobileSidebar: () => void
  setMobileSidebarOpen: (open: boolean) => void
  setLanguage: (language: Language) => void
  setUiScale: (scale: UiScale) => void
  resolvedUiScale: () => number
  setOnboardingComplete: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      // Auth state
      user: null,
      isAuthenticated: false,

      // Preference state
      // Default to the light (Zoho-style) look; users can switch via the header toggle.
      theme: 'light' as Theme,
      sidebarCollapsed: false,
      expandedSection: null,
      mobileSidebarOpen: false,
      language: 'en' as Language,
      uiScale: 'auto' as UiScale,
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

          // Pick the active branch: the user's home branch, else the first of
          // their allowed set. Super Admins (no assigned branches) fall through
          // to branchStore's default-branch auto-select. `skipNavigate` keeps
          // the post-login redirect in App.tsx in charge of the landing route
          // (role-aware) — without it, setActiveBranch's soft-switch redirect to
          // /dashboard would race in and override it. See BUGS.md SEV-3.
          const homeBranch: string | undefined =
            user.branchId || (Array.isArray(user.branchIds) ? user.branchIds[0] : undefined);
          try {
            const { useBranchStore } = await import('@/stores/branchStore');
            const branchStore = useBranchStore.getState();
            await branchStore.fetchBranches();
            if (homeBranch) {
              branchStore.setActiveBranch(homeBranch, { skipNavigate: true });
            }
          } catch { /* ignore */ }

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

      // Accordion: opening a section replaces the previously open one;
      // clicking the open section again collapses everything (null).
      toggleSection: (title: string) => {
        set((state) => ({ expandedSection: state.expandedSection === title ? null : title }))
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

      setUiScale: (scale: UiScale) => {
        set({ uiScale: scale })
      },

      resolvedUiScale: (): number => {
        const { uiScale } = get()
        if (uiScale === 'auto') {
          if (typeof window === 'undefined') return 1
          // Only counteract on desktop. On touch/mobile a high devicePixelRatio
          // is genuine screen density (retina), NOT Windows oversizing — scaling
          // it down would shrink the UI (e.g. the customer-facing pay page).
          const isDesktop =
            window.matchMedia('(pointer: fine)').matches && window.innerWidth >= 1024
          if (!isDesktop) return 1
          const dpr = window.devicePixelRatio || 1
          // Counteract OS scaling; clamp so it never drops below the floor.
          return Math.min(1, Math.max(UI_SCALE_AUTO_MIN, 1 / dpr))
        }
        return uiScale
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
        expandedSection: state.expandedSection,
        uiScale: state.uiScale,
        hasCompletedOnboarding: state.hasCompletedOnboarding,
      }),
    }
  )
)
