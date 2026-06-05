import { useEffect, useState } from 'react'
import {
  Calendar,
  Edit2,
  Mail,
  MapPin,
  Phone,
  Save,
  Trash2,
  User as UserIcon,
  X,
} from 'lucide-react'
import { toast } from 'sonner'

import api from '@/lib/api'
import {
  USE_MOCK_DATA,
  mockContactById,
  mockDeleteContact,
  mockPatchContact,
} from '../mockData'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { cn, formatDate } from '@/lib/utils'

interface ContactDetail {
  id: string
  firstName: string
  lastName?: string | null
  phoneCountryCode: string
  phone: string
  email?: string | null
  jobTitle?: string | null
  address?: string | null
  city?: string | null
  state?: string | null
  country?: string | null
  countryIso?: string | null
  source: string
  status: 'ACTIVE' | 'INACTIVE'
  notes?: string | null
  createdAt: string
  updatedAt: string
  ownerUser?: { id: string; name: string; email: string }
  company?: { id: string; name: string } | null
}

interface ContactDetailsDrawerProps {
  contactId: string | null
  onOpenChange: (open: boolean) => void
}

/**
 * Right-side Sheet showing a contact's full profile — opened from the
 * "View Full Profile →" link inside the Lead Details tab's Contact card.
 *
 * Layout (top → bottom):
 *   Header: "Contact Details" + Edit + Delete + X
 *   Body:
 *     - Name + status badge
 *     - Email + Phone (clickable links with icons)
 *     - ADDRESS block with pin icon
 *     - SOURCE label + badge
 *     - OWNER label + name with person icon
 *     - Created/Updated timestamps
 *
 * Edit and Delete are wired through to the contact API. Edit currently
 * surfaces a toast hint to the F8 edit-flow — the inline edit form goes
 * out of scope for this drawer (the same form lives in AddLeadDrawer's
 * Mode B and is reused for editing in a later iteration).
 */
export function ContactDetailsDrawer({
  contactId,
  onOpenChange,
}: ContactDetailsDrawerProps) {
  const open = contactId !== null
  const [contact, setContact] = useState<ContactDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  // Local form draft — copied from `contact` when entering edit mode.
  // Save commits it back to the server (or to the local state in mock mode).
  const [draft, setDraft] = useState<ContactDetail | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!contactId) {
      setContact(null)
      setError(null)
      setEditing(false)
      setDraft(null)
      return
    }

    // Mock-data short circuit — resolve from MOCK_LEADS' embedded contact
    // rather than hitting /contacts/:id (which wouldn't know mock IDs).
    if (USE_MOCK_DATA) {
      const hit = mockContactById(contactId) as ContactDetail | null
      setContact(hit)
      setError(hit ? null : 'Contact not found')
      setLoading(false)
      setEditing(false)
      setDraft(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)
    api
      .get(`/contacts/${contactId}`)
      .then((res) => {
        if (!cancelled) setContact(res.data)
      })
      .catch((err: { response?: { data?: { message?: string } } }) => {
        if (!cancelled)
          setError(err?.response?.data?.message ?? 'Failed to load contact')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [contactId])

  const enterEditMode = () => {
    if (!contact) return
    setDraft({ ...contact })
    setEditing(true)
  }

  const cancelEdit = () => {
    setDraft(null)
    setEditing(false)
  }

  const saveEdit = async () => {
    if (!draft) return
    setSaving(true)
    try {
      // Only send fields the backend cares about — strip ownerUser, company
      // objects (those are FK-linked, not editable here) and timestamps.
      const payload = {
        firstName: draft.firstName.trim(),
        lastName: draft.lastName?.trim() || null,
        phoneCountryCode: draft.phoneCountryCode,
        phone: draft.phone.trim(),
        email: draft.email?.trim() || null,
        jobTitle: draft.jobTitle?.trim() || null,
        address: draft.address?.trim() || null,
        city: draft.city?.trim() || null,
        state: draft.state?.trim() || null,
        country: draft.country?.trim() || null,
      }
      if (USE_MOCK_DATA) {
        // Mock mode: also push the patch into MOCK_LEADS so the lead list
        // reflects the change (every lead carries a denormalised copy of
        // the contact). Without this, the rail still shows the old name.
        mockPatchContact(draft.id, payload)
        const updated: ContactDetail = {
          ...draft,
          ...payload,
          updatedAt: new Date().toISOString(),
        }
        setContact(updated)
        toast.success('Contact updated')
      } else {
        const res = await api.patch(`/contacts/${draft.id}`, payload)
        setContact(res.data)
        toast.success('Contact updated')
      }
      setEditing(false)
      setDraft(null)
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string | string[] } } }
      const raw = e?.response?.data?.message
      toast.error(
        Array.isArray(raw) ? raw.join(' • ') : (raw ?? 'Failed to update contact'),
      )
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!contact) return
    const name =
      `${contact.firstName} ${contact.lastName ?? ''}`.trim() || 'this contact'
    if (
      !window.confirm(
        `Delete ${name}? This will fail if any leads are still linked.`,
      )
    )
      return
    try {
      if (USE_MOCK_DATA) {
        // Mock contacts are embedded inside leads — deleting a contact
        // removes every lead that references it. Real backend handles the
        // FK constraint and rejects if linked leads exist, so the message
        // here matches that behaviour conceptually.
        mockDeleteContact(contact.id)
      } else {
        await api.delete(`/contacts/${contact.id}`)
      }
      toast.success('Contact deleted')
      onOpenChange(false)
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      toast.error(e?.response?.data?.message ?? 'Failed to delete contact')
    }
  }

  const fullName =
    `${contact?.firstName ?? ''} ${contact?.lastName ?? ''}`.trim() ||
    (contact ? 'Unnamed Contact' : '')
  const phone = contact?.phone
    ? `${contact.phoneCountryCode ?? ''}${contact.phone}`
    : ''
  const address = [
    contact?.address,
    [contact?.city, contact?.state].filter(Boolean).join(', '),
    contact?.country,
  ]
    .filter(Boolean)
    .join('\n')

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full p-0 sm:max-w-110"
      >
        {/* pr-12 reserves space for the Sheet primitive's built-in
            absolute-positioned close X at right-4 top-4 — otherwise Edit/
            Delete buttons slide under it. */}
        <SheetHeader className="border-b border-border/40 px-5 py-3.5 pr-12">
          <div className="flex items-center justify-between gap-3">
            <SheetTitle className="text-base font-semibold">
              Contact Details
            </SheetTitle>
            <div className="flex items-center gap-1.5">
              {editing ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={cancelEdit}
                    disabled={saving}
                  >
                    <X className="h-3.5 w-3.5" />
                    <span>Cancel</span>
                  </Button>
                  <Button
                    size="sm"
                    className="gap-1.5"
                    onClick={saveEdit}
                    disabled={saving}
                  >
                    <Save className="h-3.5 w-3.5" />
                    <span>{saving ? 'Saving…' : 'Save'}</span>
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    disabled={!contact}
                    onClick={enterEditMode}
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                    <span>Edit</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 border-rose-300 text-rose-700 hover:bg-rose-500/10 hover:text-rose-800 dark:border-rose-800/60 dark:text-rose-400"
                    disabled={!contact}
                    onClick={handleDelete}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Delete</span>
                  </Button>
                </>
              )}
            </div>
          </div>
        </SheetHeader>

        {loading && !contact ? (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">
            Loading…
          </div>
        ) : error && !contact ? (
          <div className="px-5 py-10 text-center text-sm text-rose-600 dark:text-rose-400">
            {error}
          </div>
        ) : !contact ? null : editing && draft ? (
          // ── Edit form ──
          <div className="overflow-y-auto px-5 py-4">
            <p className="mb-4 text-xs text-muted-foreground">
              Update contact details. Required fields are marked with{' '}
              <span className="text-rose-500">*</span>.
            </p>

            <div className="space-y-4">
              <div className="grid grid-cols-1 xs:grid-cols-2 gap-3">
                <Field label="First Name" required>
                  <Input
                    value={draft.firstName}
                    onChange={(e) =>
                      setDraft({ ...draft, firstName: e.target.value })
                    }
                    placeholder="John"
                  />
                </Field>
                <Field label="Last Name">
                  <Input
                    value={draft.lastName ?? ''}
                    onChange={(e) =>
                      setDraft({ ...draft, lastName: e.target.value })
                    }
                    placeholder="Doe"
                  />
                </Field>
              </div>

              <Field label="Phone" required>
                <div className="grid grid-cols-[80px_1fr] gap-2">
                  <Input
                    value={draft.phoneCountryCode}
                    onChange={(e) =>
                      setDraft({ ...draft, phoneCountryCode: e.target.value })
                    }
                    placeholder="+91"
                  />
                  <Input
                    value={draft.phone}
                    inputMode="numeric"
                    onChange={(e) =>
                      setDraft({ ...draft, phone: e.target.value })
                    }
                    placeholder="9999999999"
                  />
                </div>
              </Field>

              <Field label="Email">
                <Input
                  type="email"
                  value={draft.email ?? ''}
                  onChange={(e) =>
                    setDraft({ ...draft, email: e.target.value })
                  }
                  placeholder="john@example.com"
                />
              </Field>

              <Field label="Job Title">
                <Input
                  value={draft.jobTitle ?? ''}
                  onChange={(e) =>
                    setDraft({ ...draft, jobTitle: e.target.value })
                  }
                  placeholder="Sales Manager"
                />
              </Field>

              <Field label="Address">
                <Input
                  value={draft.address ?? ''}
                  onChange={(e) =>
                    setDraft({ ...draft, address: e.target.value })
                  }
                  placeholder="Street, area"
                />
              </Field>

              <div className="grid grid-cols-1 xs:grid-cols-2 gap-3">
                <Field label="City">
                  <Input
                    value={draft.city ?? ''}
                    onChange={(e) =>
                      setDraft({ ...draft, city: e.target.value })
                    }
                  />
                </Field>
                <Field label="State">
                  <Input
                    value={draft.state ?? ''}
                    onChange={(e) =>
                      setDraft({ ...draft, state: e.target.value })
                    }
                  />
                </Field>
              </div>

              <Field label="Country">
                <Input
                  value={draft.country ?? ''}
                  onChange={(e) =>
                    setDraft({ ...draft, country: e.target.value })
                  }
                  placeholder="India"
                />
              </Field>
            </div>
          </div>
        ) : (
          <div className="overflow-y-auto px-5 py-4">
            {/* ── Identity card: avatar + name + role + status ── */}
            <div className="mb-4 flex items-start gap-3 rounded-lg border border-border/40 bg-muted/15 p-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/15 text-base font-bold text-primary">
                {fullName.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-lg font-semibold leading-tight">
                    {fullName}
                  </h2>
                  <Badge
                    size="sm"
                    className={cn(
                      'font-medium',
                      contact.status === 'ACTIVE'
                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {contact.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
                {(contact.jobTitle || contact.company?.name) && (
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {[contact.jobTitle, contact.company?.name]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                )}
              </div>
            </div>

            {/* ── Quick contact: Email + Phone in side-by-side tiles ── */}
            <div className="mb-4 grid grid-cols-2 gap-2">
              <ContactTile
                icon={Mail}
                label="Email"
                href={contact.email ? `mailto:${contact.email}` : undefined}
                value={contact.email ?? '—'}
                tone="violet"
              />
              <ContactTile
                icon={Phone}
                label="Phone"
                href={phone ? `tel:${phone}` : undefined}
                value={phone || '—'}
                tone="emerald"
              />
            </div>

            {/* ── Address (full width, only when populated) ── */}
            {address && (
              <DetailBlock label="Address" icon={MapPin}>
                <p className="whitespace-pre-line text-sm leading-relaxed">
                  {address}
                </p>
              </DetailBlock>
            )}

            {/* ── Source + Owner side-by-side ── */}
            <div className="mb-4 grid grid-cols-2 gap-3">
              <DetailBlock label="Source" inline>
                <Badge variant="outline" size="sm" className="font-mono">
                  {capitalize(contact.source)}
                </Badge>
              </DetailBlock>
              <DetailBlock label="Owner" icon={UserIcon} inline>
                <p className="truncate text-sm font-medium">
                  {contact.ownerUser?.name ?? '—'}
                </p>
              </DetailBlock>
            </div>

            {/* Notes — surfaces when present, full width */}
            {contact.notes && (
              <DetailBlock label="Notes">
                <p className="whitespace-pre-wrap text-sm leading-relaxed">
                  {contact.notes}
                </p>
              </DetailBlock>
            )}

            {/* ── Footer: Created / Updated side-by-side ── */}
            <div className="mt-2 grid grid-cols-2 gap-3 border-t border-border/40 pt-3 text-[11px] text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Calendar className="h-3 w-3 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[9px] font-semibold uppercase tracking-wider">
                    Created
                  </p>
                  <p className="truncate">{formatDate(contact.createdAt)}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <Calendar className="h-3 w-3 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[9px] font-semibold uppercase tracking-wider">
                    Updated
                  </p>
                  <p className="truncate">{formatDate(contact.updatedAt)}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function DetailBlock({
  label,
  icon: Icon,
  inline,
  children,
}: {
  label: string
  icon?: typeof MapPin
  /** When true, no margin-bottom — used inside grid cells. */
  inline?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={cn('space-y-1', inline ? '' : 'mb-4')}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <div className="flex items-start gap-2">
        {Icon && <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  )
}

// Side-by-side Email / Phone tiles. Compact card look with an icon chip,
// the label on top and the value below — fills the drawer's horizontal
// width without making either field feel oversized.
function ContactTile({
  icon: Icon,
  label,
  value,
  href,
  tone,
}: {
  icon: typeof Mail
  label: string
  value: string
  href?: string
  tone: 'emerald' | 'violet'
}) {
  const toneClass =
    tone === 'emerald'
      ? 'bg-emerald-500/10 text-emerald-600'
      : 'bg-violet-500/10 text-violet-600'
  const body = (
    <>
      <span
        className={cn(
          'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
          toneClass,
        )}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p className="truncate text-sm font-medium text-foreground">{value}</p>
      </div>
    </>
  )
  const className =
    'flex items-center gap-2 rounded-lg border border-border/40 bg-background p-2.5 transition-colors hover:border-border'
  return href ? (
    <a href={href} className={className}>
      {body}
    </a>
  ) : (
    <div className={className}>{body}</div>
  )
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}

// Edit-mode label + input wrapper. Keeps the form fields visually
// consistent with AddLeadDrawer's contact section.
function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label} {required && <span className="text-rose-500">*</span>}
      </Label>
      {children}
    </div>
  )
}
