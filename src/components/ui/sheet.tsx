import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

const Sheet = DialogPrimitive.Root
const SheetTrigger = DialogPrimitive.Trigger
const SheetClose = DialogPrimitive.Close
const SheetPortal = DialogPrimitive.Portal

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      // NOTE: no backdrop-filter here on purpose. Chrome fails to repaint
      // backdrop-filter layers after a native OS dialog (file picker) closes,
      // leaving the Sheet's content painted blank-white even though it's still
      // in the DOM — the "Add Files → blank sheet" bug. A solid dim avoids the
      // buggy compositing layer entirely. Do not re-introduce backdrop-blur here.
      'fixed inset-0 z-50 bg-black/70 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className
    )}
    {...props}
  />
))
SheetOverlay.displayName = 'SheetOverlay'

const SheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { side?: 'right' | 'left' | 'top' | 'bottom'; hideClose?: boolean }
>(({ className, children, side = 'right', hideClose = false, ...props }, ref) => {
  // Chrome drops the flex-grow height of the scrollable body inside this fixed
  // side-sheet after a native OS dialog (the file picker) closes — the body
  // collapses and the content bunches at the top with blank space below the
  // footer. CSS reflow tricks proved unreliable, so instead we STOP depending on
  // flex-grow: measure the available space and pin the scroll body to an
  // explicit pixel height. An explicit height cannot be undone by a reflow bug.
  // Opt-in: a form marks its scroll region [data-sheet-body] and footer
  // [data-sheet-footer]; sheets without those markers are unaffected.
  //
  // The setup runs in the REF CALLBACK (not useEffect) so `content` is
  // guaranteed to be the real DOM node — reading a ref inside useEffect can be
  // null under StrictMode/ref-timing.
  const cleanupRef = React.useRef<(() => void) | null>(null)
  const setRefs = React.useCallback((content: HTMLDivElement | null) => {
    if (typeof ref === 'function') ref(content)
    else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = content
    cleanupRef.current?.()
    cleanupRef.current = null
    if (!content) return
    const apply = () => {
      const body = content.querySelector('[data-sheet-body]') as HTMLElement | null
      if (!body) return
      const footer = content.querySelector('[data-sheet-footer]') as HTMLElement | null
      const footerH = footer ? footer.getBoundingClientRect().height : 0
      const contentRect = content.getBoundingClientRect()
      const topOffset = body.getBoundingClientRect().top - contentRect.top
      const px = Math.max(0, Math.round(contentRect.height - topOffset - footerH)) + 'px'
      // Take the body out of flex sizing (grow/shrink can't fight the pin) and
      // disable scroll-anchoring so the browser doesn't yank the scroll position
      // back to a focused element after the picker closes. These are no-ops if
      // already set. Only WRITE height when it actually changes — a redundant
      // write can nudge the scroll position, which is what broke scroll-up.
      body.style.flex = 'none'
      body.style.overflowAnchor = 'none'
      if (body.style.height !== px) body.style.height = px
    }
    apply()
    const raf = requestAnimationFrame(apply)
    const nudged = () => { apply(); requestAnimationFrame(apply); setTimeout(apply, 60); setTimeout(apply, 200) }
    // Re-pin ONLY when the file <input> is the thing gaining focus / changing —
    // NOT on every field focus (that fired the pin constantly and disturbed
    // scrolling). change (picked) / cancel (dismissed) / focusin (focus returns
    // to the input) all fire the moment the native picker closes.
    const isFileInput = (t: EventTarget | null) => (t as HTMLInputElement | null)?.type === 'file'
    const onFileEvt = (e: Event) => { if (isFileInput(e.target)) nudged() }
    const ro = new ResizeObserver(apply)
    ro.observe(content)
    content.addEventListener('focusin', onFileEvt)
    content.addEventListener('change', onFileEvt)
    content.addEventListener('cancel', onFileEvt, true)
    window.addEventListener('focus', nudged)
    window.addEventListener('resize', apply)
    document.addEventListener('visibilitychange', nudged)
    cleanupRef.current = () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      content.removeEventListener('focusin', onFileEvt)
      content.removeEventListener('change', onFileEvt)
      content.removeEventListener('cancel', onFileEvt, true)
      window.removeEventListener('focus', nudged)
      window.removeEventListener('resize', apply)
      document.removeEventListener('visibilitychange', nudged)
    }
  }, [ref])
  return (
  <SheetPortal>
    <SheetOverlay />
    <DialogPrimitive.Content
      ref={setRefs}
      className={cn(
        'fixed z-50 bg-background shadow-xl transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out',
        // Height comes purely from inset-y-0 (top:0 + bottom:0) — a positional
        // full height that is recomputed every layout and can NEVER go stale.
        // Do NOT add h-full / h-dvh here: the `dvh` unit gets stuck at a stale
        // value after a native OS dialog (file picker) closes, collapsing the
        // sheet so content bunches at the top with blank space below.
        side === 'right' && 'inset-y-0 right-0 border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
        side === 'left' && 'inset-y-0 left-0 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left',
        side === 'top' && 'inset-x-0 top-0 border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top',
        side === 'bottom' && 'inset-x-0 bottom-0 border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
        className
      )}
      {...props}
    >
      {children}
      {!hideClose && (
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-secondary">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      )}
    </DialogPrimitive.Content>
  </SheetPortal>
  )
})
SheetContent.displayName = 'SheetContent'

const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col space-y-1.5', className)} {...props} />
)
SheetHeader.displayName = 'SheetHeader'

const SheetFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2', className)} {...props} />
)
SheetFooter.displayName = 'SheetFooter'

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('text-lg font-semibold text-foreground', className)}
    {...props}
  />
))
SheetTitle.displayName = 'SheetTitle'

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
))
SheetDescription.displayName = 'SheetDescription'

export {
  Sheet, SheetPortal, SheetOverlay, SheetTrigger, SheetClose,
  SheetContent, SheetHeader, SheetFooter, SheetTitle, SheetDescription,
}
