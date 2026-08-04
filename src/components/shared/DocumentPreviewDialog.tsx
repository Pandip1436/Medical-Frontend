import { FileText, ExternalLink, Download } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'

const isPdf = (url: string) => /\.pdf($|\?)/i.test(url)

/**
 * Shared, full-size document preview used by the customer + supplier Overview
 * cards and the Document tab. Large stage on a neutral backdrop, a header with
 * the document name, and Open-in-new-tab / Download actions. Images are
 * object-contain (never cropped or stretched); PDFs fill an iframe so the
 * browser's own viewer handles zoom/scroll instead of a tiny cramped box.
 */
export function DocumentPreviewDialog({
  url,
  title = 'Document',
  onClose,
}: {
  url: string | null
  title?: string
  onClose: () => void
}) {
  const pdf = url ? isPdf(url) : false
  return (
    <Dialog open={!!url} onOpenChange={(open) => { if (!open) onClose() }}>
      {/* md:-prefixed overrides are required — the base DialogContent pins
          md:max-w-lg / md:grid / md:p-6 on desktop, which would otherwise shrink
          and re-pad this preview. */}
      <DialogContent className="w-[95vw] max-w-5xl p-0 gap-0 overflow-hidden rounded-2xl border-border/50 md:block md:w-[92vw] md:max-w-5xl md:p-0 md:gap-0 md:rounded-2xl">
        <DialogDescription className="sr-only">Full-size preview of the uploaded document.</DialogDescription>
        {/* Header — pr-12 leaves room for the dialog's built-in close (X). */}
        <div className="flex items-center gap-2 border-b border-border/50 bg-background px-4 py-2.5 pr-12">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <FileText className="h-4 w-4" />
          </div>
          <DialogTitle className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</DialogTitle>
          {url && (
            <div className="flex items-center gap-1">
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                title="Open in new tab"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
              <a
                href={url}
                download
                title="Download"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
              >
                <Download className="h-4 w-4" />
              </a>
            </div>
          )}
        </div>
        {/* Stage */}
        <div className="flex h-[80vh] items-center justify-center bg-neutral-900">
          {url &&
            (pdf ? (
              <iframe src={url} title={title} className="h-full w-full border-0" />
            ) : (
              <img src={url} alt={title} className="max-h-full max-w-full object-contain" />
            ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
