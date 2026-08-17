/**
 * Shared clamping for money / quantity `<input type="number">` fields.
 *
 * Why this isn't just `Math.min(value, max)` in an onChange handler: a
 * controlled input silently desyncs from its state when the clamped result
 * equals the value the state already holds. React sees no state change, skips
 * the re-render, and the DOM keeps whatever the user typed — so a field parked
 * at its maximum goes on swallowing digits, growing without bound while the
 * state behind it stays put. Writing the accepted value back onto the element
 * closes that gap, so the field genuinely stops taking input at the cap.
 */

/** Money to 2 decimals, killing float noise like 100 × 4200.23 = 420022.99999999994. */
export function roundMoney(n: unknown): number {
  const num = Number(n)
  if (!Number.isFinite(num)) return 0
  return Math.round(num * 100) / 100
}

export interface ClampedAmount {
  /** The accepted value, or null when the user cleared the field. */
  value: number | null
  /** True when the typed value was rejected and the field was pulled back. */
  clamped: boolean
}

/**
 * Clamp a numeric input's change to [min, max] and keep the DOM in step.
 *
 * Pass the event's `currentTarget`. An empty field returns `{ value: null }` so
 * callers can keep their own "cleared" representation (`''` or `0`) rather than
 * having one forced on them.
 */
export function clampAmountInput(
  el: HTMLInputElement,
  { min = 0, max, maxDecimals = 2 }: { min?: number; max?: number; maxDecimals?: number } = {},
): ClampedAmount {
  const raw = el.value
  if (raw.trim() === '') return { value: null, clamped: false }

  const typed = Number(raw)
  // `type="number"` already blanks most junk, but a lone "-" or "e" parses to
  // NaN — hold the field at its floor instead of writing NaN into state.
  if (!Number.isFinite(typed)) {
    el.value = String(min)
    return { value: min, clamped: true }
  }

  // Trim to paise first. Money has no third decimal, and digits past it are
  // exactly where a double stops registering the change — the point at which a
  // controlled field would otherwise take input forever without its state
  // moving. Truncate rather than round so the digits already typed survive.
  let text = raw
  const dot = text.indexOf('.')
  if (dot >= 0 && text.length - dot - 1 > maxDecimals) {
    text = maxDecimals === 0 ? text.slice(0, dot) : text.slice(0, dot + 1 + maxDecimals)
  }

  let value = Number(text)
  if (value < min) value = min
  if (max !== undefined && Number.isFinite(max) && value > roundMoney(max)) value = roundMoney(max)

  const clamped = value !== typed || text !== raw
  if (clamped) el.value = String(value)
  return { value, clamped }
}
