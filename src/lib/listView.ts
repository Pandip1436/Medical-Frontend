// Resolves the default view for list pages that support a two-panel "split"
// view alongside the single-column list/table.
//
// An explicit `?view=` choice always wins (so the ViewModeToggle and any
// deep-link keep working). When there's no explicit choice we open in the
// single-column LIST on narrow screens (< lg), where the split view's two
// side-by-side panels are too cramped to be usable, and in SPLIT on desktop.
export function resolveListView(viewParam: string | null): 'table' | 'split' {
  if (viewParam === 'table') return 'table'
  if (viewParam === 'split') return 'split'
  const isNarrow =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(max-width: 1023px)').matches
  return isNarrow ? 'table' : 'split'
}
