import { z } from 'zod'

// ── Shared field validators for GSTIN + Drug License ──────────────────────
// Single source of truth so every form (Suppliers, Branches, Customers,
// Settings, New Sale quick-add, …) validates these identically.

// Highest day a monthly customer reminder can be set to. Mirrors the server-side
// cap in reminders.service.ts: 29–31 are missing from some months (Feb every
// year, the 31st in four others), so a reminder on those days wouldn't fire
// reliably. 28 is the "end of month" choice. Used by the Reminders page and the
// New Sale quick-reminder dialog.
export const MAX_REMINDER_DAY = 28

// Standard 15-char Indian GSTIN: 2-digit state code, 5 letters (PAN), 4 digits,
// 1 letter (PAN), 1 alphanumeric (entity), 'Z', 1 alphanumeric (checksum).
export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/
export const GSTIN_MESSAGE = 'Invalid GSTIN format (e.g. 33ABCDE1234F1Z5)'

// Drug licence numbers vary widely by state (e.g. "MDU/4717/20B", "20B/21B"),
// and a supplier may list a couple separated by a space/comma
// ("MDU/4717/20B MDU/4477/21B"). Exact structure isn't standardised, but a real
// licence ALWAYS carries BOTH a letter (form code 20B/21B or state/office code)
// AND a digit (the serial number). Requiring both — plus the allowed character
// set and length window — rejects all-letter ("kkkk…") and all-digit ("1111…")
// garbage while accepting genuine formats.
export const DL_REGEX = /^(?=.*[A-Za-z])(?=.*[0-9])[A-Za-z0-9\-/,\s]+$/
export const DL_MESSAGE = 'Enter a valid drug license number (e.g. MDU/4717/20B)'
export const DL_MAX = 30

// Optional GSTIN — blank is allowed, but anything typed must be a valid GSTIN.
export const optionalGstin = () =>
  z.string().trim().regex(GSTIN_REGEX, GSTIN_MESSAGE).or(z.literal('')).optional()

// Required GSTIN — must be a valid 15-char GSTIN.
export const requiredGstin = () =>
  z
    .string()
    .trim()
    .length(15, 'GSTIN must be 15 characters')
    .regex(GSTIN_REGEX, GSTIN_MESSAGE)

// Optional drug licence — blank allowed; if present, valid chars + length window.
export const optionalDrugLicense = () =>
  z
    .string()
    .trim()
    .min(4, 'Drug license number too short')
    .max(DL_MAX, `Drug license number too long (max ${DL_MAX})`)
    .regex(DL_REGEX, DL_MESSAGE)
    .or(z.literal(''))
    .optional()

// Required drug licence — non-empty, valid chars + length window.
export const requiredDrugLicense = () =>
  z
    .string()
    .trim()
    .min(4, 'Drug license number too short')
    .max(DL_MAX, `Drug license number too long (max ${DL_MAX})`)
    .regex(DL_REGEX, DL_MESSAGE)

// ── Bank detail validators (shared by Supplier + wholesale Customer forms) ──
// Indian bank account numbers are numeric and run 9–18 digits across banks.
export const BANK_ACCOUNT_REGEX = /^\d{9,18}$/
export const BANK_ACCOUNT_MESSAGE = 'Account number must be 9–18 digits'
// Standard 11-char IFSC: 4 letters (bank), '0', 6 alphanumerics (branch).
export const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/
export const IFSC_MESSAGE = 'Invalid IFSC (e.g. HDFC0001234)'
// UPI VPA: <handle>@<provider> — allow letters/digits/._- on both sides.
export const UPI_REGEX = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z0-9.\-_]{2,64}$/
export const UPI_MESSAGE = 'Invalid UPI ID (e.g. name@bank)'

// All optional — blank allowed; if present, must match the format.
export const optionalBankAccount = () =>
  z.string().trim().regex(BANK_ACCOUNT_REGEX, BANK_ACCOUNT_MESSAGE).or(z.literal('')).optional()

export const optionalIfsc = () =>
  z.string().trim().regex(IFSC_REGEX, IFSC_MESSAGE).or(z.literal('')).optional()

export const optionalUpi = () =>
  z.string().trim().regex(UPI_REGEX, UPI_MESSAGE).or(z.literal('')).optional()
