// Frontend mirror of Medical-Backend/src/common/utils/party-phones.util.ts.
// The label set and validation rules must match on both sides — the backend
// re-normalises whatever the form sends, so a rule that exists only here would
// silently disagree with what actually gets stored.
//
// A party (customer or supplier) can hold several numbers: a mobile, an office
// landline, a residence line. The entry flagged primary is what the backend
// mirrors into the `phone` column, which is what every list row, invoice print
// and search already reads — so the primary is the number shown under the name.

export type PhoneLabel = 'MOBILE' | 'LANDLINE' | 'OFFICE' | 'HOME' | 'OTHER'

export interface PartyPhone {
  /** As entered — separators preserved, because "0431-3501965" reads better than raw digits. */
  number: string
  label: PhoneLabel
  isPrimary: boolean
}

export const PHONE_LABELS: PhoneLabel[] = ['MOBILE', 'LANDLINE', 'OFFICE', 'HOME', 'OTHER']

export const PHONE_LABEL_TEXT: Record<PhoneLabel, string> = {
  MOBILE: 'Mobile',
  LANDLINE: 'Landline',
  OFFICE: 'Office',
  HOME: 'Home',
  OTHER: 'Other',
}

/** More than this is a paste accident, not a contact list. */
export const MAX_PARTY_PHONES = 8

/** Digits only, with the +91 / 0091 / leading-0 trunk prefix stripped. */
export function phoneDigits(raw: string | null | undefined): string {
  const digits = (raw ?? '').replace(/\D/g, '')
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2)
  if (digits.length === 13 && digits.startsWith('091')) return digits.slice(3)
  return digits
}

/**
 * A WhatsApp-reachable number: a 10-digit Indian mobile. Landlines fail here,
 * which is what lets the form say plainly that a landline-only party can't be
 * messaged rather than queuing a send Meta will reject.
 */
export function isMobileNumber(raw: string | null | undefined): boolean {
  return /^[6-9]\d{9}$/.test(phoneDigits(raw))
}

/**
 * Any number we're willing to store. Deliberately loose: an Indian landline is
 * an STD code plus a subscriber number (9-12 digits together) and imported data
 * carries every separator style there is.
 */
export function isValidPhone(raw: string | null | undefined): boolean {
  const digits = (raw ?? '').replace(/\D/g, '')
  if (digits.length < 6 || digits.length > 15) return false
  return /^[+()\d\s-]+$/.test((raw ?? '').trim())
}

export function inferLabel(raw: string | null | undefined): PhoneLabel {
  return isMobileNumber(raw) ? 'MOBILE' : 'LANDLINE'
}

/**
 * Clean a list: drop blanks and invalid entries, collapse duplicates (same
 * digits, whatever the formatting), cap the count, and guarantee exactly one
 * primary — an explicit flag first, then the first mobile, then the first entry
 * so a landline-only party still has one.
 */
export function normalizePartyPhones(input: unknown): PartyPhone[] {
  if (!Array.isArray(input)) return []

  const seen = new Set<string>()
  const cleaned: PartyPhone[] = []

  for (const entry of input) {
    if (!entry || typeof entry !== 'object') continue
    const raw = (entry as PartyPhone).number
    const number = typeof raw === 'string' ? raw.trim() : ''
    if (!number || !isValidPhone(number)) continue

    const key = phoneDigits(number)
    if (seen.has(key)) continue
    seen.add(key)

    const rawLabel = (entry as PartyPhone).label
    cleaned.push({
      number,
      label: PHONE_LABELS.includes(rawLabel) ? rawLabel : inferLabel(number),
      isPrimary: (entry as PartyPhone).isPrimary === true,
    })
    if (cleaned.length >= MAX_PARTY_PHONES) break
  }

  if (cleaned.length === 0) return []

  let primaryIdx = cleaned.findIndex((p) => p.isPrimary)
  if (primaryIdx < 0) primaryIdx = cleaned.findIndex((p) => isMobileNumber(p.number))
  if (primaryIdx < 0) primaryIdx = 0

  return cleaned.map((p, i) => ({ ...p, isPrimary: i === primaryIdx }))
}

/** The number that represents the party — what the `phone` column is kept equal to. */
export function primaryOf(phones: PartyPhone[]): string | null {
  return phones.find((p) => p.isPrimary)?.number ?? phones[0]?.number ?? null
}

/** Numbers that could actually receive a WhatsApp message. */
export function whatsappCapable(phones: PartyPhone[]): PartyPhone[] {
  return phones.filter((p) => isMobileNumber(p.number))
}

/**
 * Build the list for a party saved before this feature existed, so an old
 * `phone` + `alternatePhone` pair opens in the form as a proper two-entry list
 * rather than losing the alternate.
 */
export function phonesFromLegacy(
  phone: string | null | undefined,
  alternatePhone?: string | null,
): PartyPhone[] {
  return normalizePartyPhones([
    { number: (phone ?? '').trim(), label: inferLabel(phone), isPrimary: true },
    { number: (alternatePhone ?? '').trim(), label: inferLabel(alternatePhone), isPrimary: false },
  ])
}

/**
 * What the form should start from: the stored list when there is one, else the
 * legacy flat fields, else a single blank row to type into.
 */
export function phonesForForm(party: {
  phones?: unknown
  phone?: string | null
  alternatePhone?: string | null
} | null | undefined): PartyPhone[] {
  const stored = normalizePartyPhones(party?.phones)
  if (stored.length) return stored
  const legacy = phonesFromLegacy(party?.phone, party?.alternatePhone)
  if (legacy.length) return legacy
  return [{ number: '', label: 'MOBILE', isPrimary: true }]
}

/** "9573393777 (Mobile)" — for dropdown options and summary lines. */
export function describePhone(p: PartyPhone): string {
  return `${p.number} (${PHONE_LABEL_TEXT[p.label]})`
}

// ─── Import / export ────────────────────────────────────────────────────────

/**
 * Split a spreadsheet cell that holds more than one number, e.g.
 * "9443093227 / 9443073119". Deliberately does NOT split on "-", because a
 * landline written "0431-3501965" is a single number, not two.
 */
export function splitPhoneCell(cell: string | null | undefined): string[] {
  return (cell ?? '')
    .split(/[/,;\n|]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export interface PhoneCandidate {
  value?: string | null
  /** Omit to infer from the number itself (10-digit 6-9 → Mobile, else Landline). */
  label?: PhoneLabel
}

/**
 * Build a list from the separate phone columns an ERP export spreads across a
 * row (mobile / phone1 / phone2 / resi). Pass candidates in the order you want
 * them to appear; normalizePartyPhones then drops blanks and duplicates and
 * promotes the first mobile to primary — so a row whose only number is an
 * office landline still gets a valid primary.
 */
export function collectPartyPhones(candidates: PhoneCandidate[]): PartyPhone[] {
  const entries: PartyPhone[] = []
  for (const c of candidates) {
    for (const number of splitPhoneCell(c.value)) {
      entries.push({ number, label: c.label ?? inferLabel(number), isPrimary: false })
    }
  }
  return normalizePartyPhones(entries)
}

/**
 * Round-trip format for the one `phones` column in our own import/export
 * template: "MOBILE:9573393777|OFFICE:0431-3501965", primary first. One column
 * keeps the whole list — including labels — rather than losing everything past
 * a fixed number of phone_1/phone_2 columns.
 */
export function serializePhonesCell(phones: PartyPhone[]): string {
  const list = normalizePartyPhones(phones)
  const primaryFirst = [...list].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
  return primaryFirst.map((p) => `${p.label}:${p.number}`).join('|')
}

/** Parse the above. Entries without a "LABEL:" prefix fall back to an inferred label. */
export function parsePhonesCell(cell: string | null | undefined): PartyPhone[] {
  const parts = (cell ?? '').split(/[|\n]+/).map((s) => s.trim()).filter(Boolean)
  return normalizePartyPhones(
    parts.map((part, i) => {
      const m = /^([A-Za-z]+)\s*:\s*(.+)$/.exec(part)
      const number = (m ? m[2] : part).trim()
      const raw = m ? (m[1].toUpperCase() as PhoneLabel) : undefined
      return {
        number,
        label: raw && PHONE_LABELS.includes(raw) ? raw : inferLabel(number),
        // First entry is primary — that is the order serializePhonesCell writes.
        isPrimary: i === 0,
      }
    }),
  )
}
