import { useCallback, useEffect, useRef, useState } from 'react'
import { Eye, FileText, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { DocumentPreviewDialog } from '@/components/shared/DocumentPreviewDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import api, { API_SERVER_URL, handleApiError } from '@/lib/api'
import { formatDate } from '@/lib/utils'

// Supplier documents (GST certificate, drug licence, agreements, …) are stored
// against the supplier's LINKED CUSTOMER TWIN — the same real-world party — via
// the existing /prescriptions pipeline. SupplierFormDialog already uploads that
// way, and the Overview card already reads it; this tab is the full-size view
// of the same records, with upload + delete.
//
// `doctorName` is the document title in that schema (it predates documents being
// used for anything but prescriptions), so it is surfaced here as "Title".

interface SupplierDoc {
  id: string
  imageUrl?: string | null
  doctorName?: string | null
  notes?: string | null
  createdAt?: string | null
}

// New uploads store an absolute R2 URL; legacy rows store a relative /uploads/…
// path that still needs the API host prefix.
function resolveUrl(imageUrl?: string | null): string | null {
  if (!imageUrl) return null
  return /^https?:\/\//i.test(imageUrl) ? imageUrl : `${API_SERVER_URL}${imageUrl}`
}
const isPdf = (url: string) => /\.pdf($|\?)/i.test(url)

export function SupplierDocumentsTab({ customerId }: { customerId?: string | null }) {
  const [docs, setDocs] = useState<SupplierDoc[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [forbidden, setForbidden] = useState(false)

  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewTitle, setPreviewTitle] = useState('Document')
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const [uploadOpen, setUploadOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    if (!customerId) return
    setLoading(true)
    try {
      // suppressGlobalToast: roles that can open a supplier can't always read
      // documents (e.g. INVENTORY_MANAGER). An expected 403 shouldn't raise a
      // "Forbidden resource" toast — the tab explains itself instead.
      const res = await api.get(`/prescriptions?customerId=${customerId}`, {
        suppressGlobalToast: true,
      } as never)
      const list = (res.data?.data ?? res.data ?? []) as SupplierDoc[]
      setDocs(Array.isArray(list) ? list : [])
      setForbidden(false)
    } catch (err: unknown) {
      if ((err as { response?: { status?: number } })?.response?.status === 403) setForbidden(true)
      setDocs([])
    } finally {
      setLoading(false)
    }
  }, [customerId])

  useEffect(() => { void load() }, [load])

  const resetForm = () => {
    setFile(null)
    setTitle('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleUpload = async () => {
    if (!customerId || !file || !title.trim()) {
      toast.error('Pick a file and give the document a title')
      return
    }
    setSubmitting(true)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('customerId', customerId)
      // Schema field name — carries the document's title.
      form.append('doctorName', title.trim())
      await api.post('/prescriptions/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      toast.success('Document uploaded')
      setUploadOpen(false)
      resetForm()
      void load()
    } catch (err) {
      handleApiError(err, 'Failed to upload document')
    } finally {
      setSubmitting(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleteId) return
    try {
      await api.delete(`/prescriptions/${deleteId}`)
      toast.success('Document deleted')
      setDeleteId(null)
      void load()
    } catch (err) {
      handleApiError(err, 'Failed to delete document')
    }
  }

  // A supplier that was never linked to a customer twin has nowhere to store
  // documents. Say so plainly rather than showing an empty grid with an Upload
  // button that can only fail.
  if (!customerId) {
    return (
      <EmptyState
        icon={FileText}
        title="No document storage for this supplier"
        description="Documents attach to the supplier's linked customer record. Re-save this supplier to create that link, then upload here."
      />
    )
  }

  if (forbidden) {
    return (
      <EmptyState
        icon={FileText}
        title="Documents are restricted"
        description="Your role can't view documents for this supplier."
      />
    )
  }

  const list = docs ?? []

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/40 px-4 py-2">
        <span className="text-xs text-muted-foreground">
          {loading && docs === null
            ? 'Loading…'
            : `${list.length} document${list.length !== 1 ? 's' : ''}`}
        </span>
        <Button size="sm" className="h-7 gap-1.5" onClick={() => setUploadOpen(true)}>
          <Upload className="h-3.5 w-3.5" />
          <span className="text-xs">Upload</span>
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {loading && docs === null ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : list.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No documents yet"
            description="Upload the GST certificate, drug licence or agreements for this supplier."
          />
        ) : (
          <div className="flex flex-wrap gap-3">
            {list.map((doc) => {
              const url = resolveUrl(doc.imageUrl)
              const showImg = url && !isPdf(url)
              return (
                <div
                  key={doc.id}
                  className="group relative flex w-36 flex-col overflow-hidden rounded-lg border border-border/50 bg-background shadow-sm transition hover:border-primary/50"
                >
                  <button
                    type="button"
                    disabled={!url}
                    onClick={() => {
                      if (url) { setPreviewUrl(url); setPreviewTitle(doc.doctorName || 'Document') }
                    }}
                    className="text-left disabled:cursor-default"
                    title={url ? 'Click to preview' : 'No file attached'}
                  >
                    <div className="relative flex h-24 items-center justify-center bg-muted/40">
                      {showImg ? (
                        <img src={url} alt={doc.doctorName ?? 'Document'} className="h-full w-full object-cover" />
                      ) : (
                        <FileText className="h-8 w-8 text-muted-foreground/50" />
                      )}
                      {url && (
                        <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/40 group-hover:opacity-100">
                          <Eye className="h-5 w-5 text-white" />
                        </span>
                      )}
                    </div>
                    <div className="px-2 py-1.5">
                      <p className="truncate text-[11px] font-medium">{doc.doctorName || 'Document'}</p>
                      <p className="truncate text-[10px] text-muted-foreground">
                        {doc.createdAt ? formatDate(doc.createdAt) : ''}
                      </p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteId(doc.id)}
                    aria-label="Delete document"
                    className="absolute right-1 top-1 rounded-md bg-background/80 p-1 text-muted-foreground opacity-0 transition hover:text-destructive group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <Dialog open={uploadOpen} onOpenChange={(open) => { setUploadOpen(open); if (!open) resetForm() }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Upload document</DialogTitle>
            <DialogDescription>
              Attach a GST certificate, drug licence or agreement for this supplier.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Title *</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Drug licence 20B"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">File *</Label>
              <Input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setUploadOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleUpload} disabled={submitting || !file || !title.trim()}>
              {submitting ? 'Uploading…' : 'Upload'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this document?</AlertDialogTitle>
            <AlertDialogDescription>
              The file is removed from storage. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DocumentPreviewDialog url={previewUrl} title={previewTitle} onClose={() => setPreviewUrl(null)} />
    </div>
  )
}
