import { useEffect, useState } from 'react'
import { FileText, Eye } from 'lucide-react'
import { DocumentPreviewDialog } from '@/components/shared/DocumentPreviewDialog'
import api, { API_SERVER_URL } from '@/lib/api'
import { formatDate } from '@/lib/utils'

export interface OverviewDoc {
  id: string
  imageUrl?: string | null
  doctorName?: string | null // used as the document title
  notes?: string | null
  createdAt?: string | null
}

// New uploads store an absolute R2 URL; legacy records store a relative
// /uploads/… path that still needs the API host prefix.
function resolveUrl(imageUrl?: string | null): string | null {
  if (!imageUrl) return null
  return /^https?:\/\//i.test(imageUrl) ? imageUrl : `${API_SERVER_URL}${imageUrl}`
}
const isPdf = (url: string) => /\.pdf($|\?)/i.test(url)

/**
 * Compact documents viewer for the Overview tab of a customer or supplier.
 * Either pass a pre-loaded `documents` list (customer detail already has it) or
 * a `customerId` to fetch from `/prescriptions` (supplier detail reads its twin
 * customer's docs). Click a tile to preview the image / PDF.
 */
export function DocumentsOverviewCard({
  documents,
  customerId,
  title = 'Documents',
}: {
  documents?: OverviewDoc[]
  customerId?: string | null
  title?: string
}) {
  const [fetched, setFetched] = useState<OverviewDoc[] | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewTitle, setPreviewTitle] = useState('Document')

  useEffect(() => {
    if (documents !== undefined || !customerId) return
    let cancelled = false
    api
      .get(`/prescriptions?customerId=${customerId}`)
      .then((res) => {
        if (cancelled) return
        const list = (res.data?.data ?? res.data ?? []) as OverviewDoc[]
        setFetched(Array.isArray(list) ? list : [])
      })
      .catch(() => { if (!cancelled) setFetched([]) })
    return () => { cancelled = true }
  }, [documents, customerId])

  // Nothing to show for a supplier with no linked customer twin.
  if (documents === undefined && !customerId) return null

  const docs = documents ?? fetched ?? []
  const loading = documents === undefined && fetched === null

  return (
    <div className="mt-4 rounded-xl border border-border/40 bg-muted/10 p-4">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
          <FileText className="h-3.5 w-3.5" />
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</span>
        {docs.length > 0 && (
          <span className="ml-auto text-[11px] text-muted-foreground">{docs.length} file{docs.length !== 1 ? 's' : ''}</span>
        )}
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : docs.length === 0 ? (
        <p className="text-xs text-muted-foreground">No documents uploaded yet. Upload from the form or the Document tab.</p>
      ) : (
        <div className="flex flex-wrap gap-3">
          {docs.map((d) => {
            const url = resolveUrl(d.imageUrl)
            const showImg = url && !isPdf(url)
            return (
              <button
                key={d.id}
                type="button"
                disabled={!url}
                onClick={() => { if (url) { setPreviewUrl(url); setPreviewTitle(d.doctorName || 'Document') } }}
                className="group relative flex w-28 flex-col overflow-hidden rounded-lg border border-border/50 bg-background text-left shadow-sm transition hover:border-primary/50 disabled:cursor-default disabled:opacity-70"
                title={url ? 'Click to preview' : 'No file attached'}
              >
                <div className="relative flex h-20 items-center justify-center bg-muted/40">
                  {showImg ? (
                    <img src={url} alt={d.doctorName ?? 'Document'} className="h-full w-full object-cover" />
                  ) : (
                    <FileText className="h-7 w-7 text-muted-foreground/50" />
                  )}
                  {url && (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/40 group-hover:opacity-100">
                      <Eye className="h-5 w-5 text-white" />
                    </span>
                  )}
                </div>
                <div className="px-2 py-1.5">
                  <p className="truncate text-[11px] font-medium">{d.doctorName || 'Document'}</p>
                  <p className="truncate text-[10px] text-muted-foreground">{d.createdAt ? formatDate(d.createdAt) : ''}</p>
                </div>
              </button>
            )
          })}
        </div>
      )}

      <DocumentPreviewDialog url={previewUrl} title={previewTitle} onClose={() => setPreviewUrl(null)} />
    </div>
  )
}
