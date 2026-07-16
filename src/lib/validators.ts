import { z } from 'zod'

// ── Shared field validators for GSTIN + Drug License ──────────────────────
// Single source of truth so every form (Suppliers, Branches, Customers,
// Settings, New Sale quick-add, …) validates these identically.

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
