/**
 * App-wide guard against `<input type="number">` stepping its own value.
 *
 * Browsers step a focused number input on mouse-wheel / two-finger trackpad
 * scroll and on ArrowUp/ArrowDown. In a data-entry app that is silent data
 * corruption: the user scrolls a long purchase-entry or sale form with the
 * cursor still over a focused Qty / Rate / Amount Paid field and the number
 * changes underneath them, with nothing on screen to say it happened.
 *
 * The spinner buttons are already hidden app-wide (see index.css), so stepping
 * isn't a discoverable feature here at all — this removes the invisible half of
 * it. Typing, paste, min/max, and Tab/Enter navigation are untouched.
 *
 * Installed once from main.tsx as a document-level capture listener so it
 * covers every number field in the app, including ones added later, without
 * each call site having to remember.
 */

/** Widest precision any field here legitimately needs (sale rates run to 3dp). */
const MAX_INPUT_DECIMALS = 6

function isNumberInput(el: EventTarget | null): el is HTMLInputElement {
  return el instanceof HTMLInputElement && el.type === 'number'
}

export function installNumberInputGuard() {
  // Wheel — only a *focused* number input steps, so blur it and let the same
  // gesture scroll the page, which is what the user meant by it. Capture phase
  // runs before the input's default action; not calling preventDefault means
  // the scroll still goes through, and `passive` keeps it smooth.
  document.addEventListener(
    'wheel',
    (e) => {
      const el = e.target
      if (isNumberInput(el) && document.activeElement === el) el.blur()
    },
    { capture: true, passive: true },
  )

  // Arrow keys — the keyboard half of the same stepping. Only the default
  // action is cancelled; the event keeps propagating so components that use
  // ArrowUp/ArrowDown for their own navigation still receive it.
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
      if (isNumberInput(e.target)) e.preventDefault()
    },
    { capture: true },
  )

  // Runaway decimals. A number input keeps accepting digits long past what a
  // double can represent: `Number()` stops changing while the text grows, so a
  // controlled field sees no state change, React skips the re-render, and the
  // typed string runs away — 420022.99999999994 quietly becomes
  // 420022.99999999994999999999999 while the state still holds the original.
  //
  // This refuses the keystroke rather than rewriting the value, deliberately.
  // Assigning to `el.value` here would move React's internal value tracker to
  // match the DOM, and React would then decide nothing had changed and skip
  // onChange entirely — the field would stop reporting edits at all. Cancelling
  // the key never touches the tracker.
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return
      const el = e.target
      if (!isNumberInput(el)) return
      const dot = el.value.indexOf('.')
      if (dot < 0) return
      if (el.value.length - dot - 1 >= MAX_INPUT_DECIMALS) e.preventDefault()
    },
    { capture: true },
  )
}
