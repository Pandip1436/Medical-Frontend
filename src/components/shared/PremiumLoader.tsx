// Premium app loading screen — shown as the Suspense fallback while lazy
// routes/chunks load. Brand logo nested inside a spinning conic ring with a
// soft pulsing glow, a shimmering label, and an indeterminate progress sweep.
// Honors prefers-reduced-motion via the .loader-* classes in index.css.

// Inline brand-pill fallback, identical to the Sidebar logo's, used when
// /logo.png is missing so the loader never shows a broken-image icon.
const LOGO_FALLBACK =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='72' height='72'%3E%3Crect width='72' height='72' rx='36' fill='%23f4515a'/%3E%3C/svg%3E"

export function PremiumLoader({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-6 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-10">
        {/* Logo + spinning ring + glow */}
        <div className="relative h-36 w-36">
          {/* Pulsing brand glow */}
          <div className="loader-glow absolute inset-0 rounded-full bg-brand/40 blur-3xl" />
          {/* Spinning conic-gradient ring */}
          <div className="loader-ring absolute inset-0 rounded-full" />
          {/* Logo disc */}
          <div className="absolute inset-[10px] flex items-center justify-center overflow-hidden rounded-full bg-card shadow-xl shadow-brand/10">
            <img
              src="/logo.png"
              alt=""
              className="loader-logo h-full w-full object-cover"
              onError={(e) => {
                const el = e.currentTarget
                el.onerror = null
                el.src = LOGO_FALLBACK
              }}
            />
          </div>
        </div>

        {/* Label + brand tag */}
        <div className="flex flex-col items-center gap-2">
          <span className="loader-text bg-clip-text text-lg font-semibold tracking-tight text-transparent">
            {label}
          </span>
          <span className="text-xs font-medium uppercase tracking-[0.4em] text-muted-foreground">
            PBIMS
          </span>
        </div>

        {/* Indeterminate progress sweep */}
        <div className="relative h-1 w-52 overflow-hidden rounded-full bg-muted">
          <div className="loader-bar absolute inset-y-0 left-0 w-1/3 rounded-full bg-brand" />
        </div>
      </div>
    </div>
  )
}

export default PremiumLoader
