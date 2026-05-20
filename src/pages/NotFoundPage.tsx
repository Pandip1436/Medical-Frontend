import { navigate } from '@/lib/router'

export default function NotFoundPage({ path }: { path: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 px-4 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-amber-500/10">
        <svg className="h-10 w-10 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121zM21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Page not found</h2>
        <p className="mt-2 max-w-sm text-muted-foreground">
          The path <span className="font-mono text-foreground">{path}</span> doesn't exist.
        </p>
      </div>
      <button
        onClick={() => navigate('/dashboard')}
        className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow transition-all hover:bg-primary/90"
      >
        ← Back to Dashboard
      </button>
    </div>
  )
}
