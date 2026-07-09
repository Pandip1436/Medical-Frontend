import { registerSW } from 'virtual:pwa-register'
import { toast } from 'sonner'

// Manual registration (vite.config.ts sets injectRegister: null) so an
// available update surfaces as a dismissible toast instead of silently
// swapping the app under an in-progress form.
export function registerPwa() {
  const updateSW = registerSW({
    onNeedRefresh() {
      toast('A new version of PBIMS is available', {
        duration: Infinity,
        action: {
          label: 'Refresh',
          onClick: () => updateSW(true),
        },
      })
    },
  })
}
