import { createWorker, PSM } from 'tesseract.js'
import type { DeliveryStatus } from '@/types'

// ─── Courier receipt OCR ─────────────────────────────────────────────────────
// Reads an ST Courier / Professional Courier (or any) receipt image with
// Tesseract.js and best-effort extracts the courier name, tracking/AWB number
// and dispatch date. All heuristics are forgiving — the user always reviews and
// can correct the auto-filled fields before saving.

export const COURIERS = [
  'ST Courier',
  'The Professional Couriers',
  'Shree Tirupati Courier',
  'DTDC',
  'Blue Dart',
  'Delhivery',
  'India Post',
  'Trackon',
  'Gati',
  'Other',
] as const

export interface OcrResult {
  rawText: string
  courierName?: string
  trackingId?: string
  dispatchDate?: string // ISO yyyy-mm-dd
}

// Secondary signals: text that isn't the brand NAME but only ever appears on
// that brand's stationery. These matter because a courier's logo is usually set
// in a stylised italic/script face that OCR mangles or misses entirely, while
// the plain-text strapline printed beside it reads cleanly.
//
// "DOMESTIC, INTERNATIONAL & SAARC" is The Professional Couriers' strapline —
// taken from the raw OCR of a real receipt, where the logo came out as
// "Frorzssiona" but the strapline survived as "(DOMESTIC, INTERNATIONAL & SARC".
const COURIER_SIGNALS: { match: RegExp; name: string }[] = [
  { match: /domestic\W{0,6}international\W{0,8}(?:&\W{0,3})?sa{1,2}rc/i, name: 'The Professional Couriers' },
]

// Last-resort signal: the letter prefix of the consignment number. Couriers use
// their own AWB prefixes, so the number itself identifies the brand when neither
// the logo nor the strapline survives OCR.
//
// NOTE: this table is built from the receipts seen in this deployment, not from
// any published carrier spec — extend it as new couriers show up, and remove an
// entry if a different carrier turns out to use the same prefix.
const AWB_PREFIX_BRAND: Record<string, string> = {
  IXM: 'The Professional Couriers',
}

// Map of detectable keywords → canonical courier name.
const COURIER_KEYWORDS: { match: RegExp; name: string }[] = [
  { match: /professional\s*couri?er/i, name: 'The Professional Couriers' },
  { match: /shree\s*tirupati|tirupati\s*couri?er/i, name: 'Shree Tirupati Courier' },
  { match: /\bst\s*couri?er/i, name: 'ST Courier' },
  { match: /\bdtdc\b/i, name: 'DTDC' },
  { match: /blue\s*dart/i, name: 'Blue Dart' },
  { match: /delhivery/i, name: 'Delhivery' },
  { match: /india\s*post|speed\s*post/i, name: 'India Post' },
  { match: /trackon/i, name: 'Trackon' },
  { match: /\bgati\b/i, name: 'Gati' },
]

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

// ─── Fuzzy brand matching ────────────────────────────────────────────────────
// A photographed courier label rarely OCRs cleanly — "PROFESSIONAL" comes back
// as "Frorzssiona", "DELHIVERY" as "DELHIVERV". Exact regexes miss all of those,
// so as a last resort we retry with an edit-distance match against the words in
// the text. This is the weakest evidence detectCourier uses, hence last.

/** Levenshtein distance, abandoned early once it exceeds `max` (returns max+1). */
function boundedLevenshtein(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    let best = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost)
      if (row[j] < best) best = row[j]
    }
    if (best > max) return max + 1 // no cell in this row can lead to a match
    prev = row
  }
  return prev[b.length]
}

/**
 * Words to compare brand names against: every 4+ letter token, plus each pair of
 * adjacent tokens joined ("blue dart" → "bluedart", "india post" → "indiapost").
 *
 * Comparing against TOKENS rather than sliding a window over the whole text
 * matters: a receipt squashes down to hundreds of letters, and among the
 * thousands of arbitrary windows in that soup something will land a couple of
 * edits from any 8-letter brand purely by chance — which is how a label reading
 * PROFESSIONAL got tagged "Shree Tirupati Courier". A false positive now needs a
 * real word that looks like the brand, which is a far higher bar.
 */
function candidateTokens(text: string): string[] {
  const words = text.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 4)
  const joined: string[] = []
  for (let i = 0; i < words.length - 1; i++) joined.push(words[i] + words[i + 1])
  return [...words, ...joined]
}

// Distinctive word per brand plus its error budget. The budget is NOT derived
// from word length — it's capped by each word's nearest lookalike in the text
// that actually appears on a courier label:
//   • "delhivery" is 1 edit from "delivery", which is on every label ("Delivery
//     Address", "Out for Delivery") — so no budget at all, exact match only.
//   • "trackon" is 2 edits from "tracking" — budget 1.
//   • short brands ("dtdc", "gati") collide with noise at any budget — 0.
// "professional" has no such neighbour, so it gets the room it needs: OCR read
// it as "Frorzssiona" on a real receipt, 4 edits out.
const COURIER_FUZZY: { word: string; name: string; maxErrors: number }[] = [
  { word: 'professional', name: 'The Professional Couriers', maxErrors: 4 },
  { word: 'tirupati', name: 'Shree Tirupati Courier', maxErrors: 2 },
  { word: 'bluedart', name: 'Blue Dart', maxErrors: 2 },
  { word: 'indiapost', name: 'India Post', maxErrors: 2 },
  { word: 'speedpost', name: 'India Post', maxErrors: 2 },
  { word: 'delhivery', name: 'Delhivery', maxErrors: 0 },
  // "trackon" is 2 edits from "tracking", which is on nearly every label — so it
  // gets 1, enough for a single misread character but not enough to swallow it.
  { word: 'trackon', name: 'Trackon', maxErrors: 1 },
  { word: 'dtdc', name: 'DTDC', maxErrors: 0 },
  { word: 'gati', name: 'Gati', maxErrors: 0 },
]

/**
 * Detect a courier brand from free OCR text, in descending order of certainty:
 * the brand name itself → a strapline only that brand prints → the AWB prefix →
 * a fuzzy match on a mangled brand name.
 */
export function detectCourier(text: string, trackingId?: string): string | undefined {
  for (const { match, name } of COURIER_KEYWORDS) {
    if (match.test(text)) return name
  }
  for (const { match, name } of COURIER_SIGNALS) {
    if (match.test(text)) return name
  }
  // The AWB prefix beats a fuzzy name match: a known prefix is exact, whereas
  // fuzzy matching is guesswork by construction.
  const prefix = (trackingId ?? '').match(/^([A-Z]{2,4})\d/)?.[1]
  if (prefix && AWB_PREFIX_BRAND[prefix]) return AWB_PREFIX_BRAND[prefix]

  // Fuzzy fallback. Every brand is scored against every token and the CLOSEST
  // match wins — first-match-wins would let a loose 2-error brand beat the exact
  // word sitting further down the list.
  const tokens = candidateTokens(text)
  if (!tokens.length) return undefined
  let best: { name: string; distance: number } | undefined
  for (const { word, name, maxErrors } of COURIER_FUZZY) {
    for (const token of tokens) {
      if (Math.abs(token.length - word.length) > maxErrors) continue
      const distance = boundedLevenshtein(token, word, maxErrors)
      if (distance <= maxErrors && (!best || distance < best.distance)) {
        best = { name, distance }
      }
    }
  }
  return best?.name
}

/**
 * Detect a tracking / AWB / consignment number. Strategy, in priority order:
 *  1. A value sitting next to an explicit label (AWB / Tracking / Consignment /
 *     Docket / POD No).
 *  2. A "letters+digits" token like IXM510357808 (common ST format).
 *  3. The longest standalone digit run (9–14 digits — typical AWB length).
 */
export function detectTrackingId(text: string): string | undefined {
  // "AWB / Consignment No. / Docket #" followed by the value. The optional
  // no/number/id word is matched separately so "Consignment No : IXM…" works.
  const labelled = text.match(
    /(?:awb|a\.w\.b|tracking|consignment|docket|pod|waybill|track(?:ing)?)\s*(?:no|number|id|#)?\s*[.:#-]?\s*([A-Z0-9-]{6,18})/i,
  )
  if (labelled?.[1]) return tidyTrackingId(labelled[1])

  // Letters+digits, e.g. IXM510357807.
  const alnum = text.match(/\b([A-Z]{2,4}\d{6,12})\b/i)
  if (alnum?.[1]) return tidyTrackingId(alnum[1])

  // Same shape, but tolerating the letters Tesseract substitutes for digits in
  // the tail (IXM51O3578O7). The tail must still be mostly real digits, so an
  // ordinary word can't qualify.
  const confusable = text.match(/\b([A-Z]{2,4})([0-9OILSBZ]{6,12})\b/)
  if (confusable) {
    const digits = confusable[2].replace(/\D/g, '').length
    if (digits >= Math.ceil(confusable[2].length * 0.6)) {
      return tidyTrackingId(confusable[1] + confusable[2])
    }
  }

  // Same, but with the prefix split off the barcode digits ("IXM 510357807") —
  // a common OCR split. Held to uppercase and a longer digit run so it doesn't
  // swallow things like "Rs 123456".
  const split = text.match(/\b([A-Z]{2,4})[ -](\d{8,12})\b/)
  if (split) return tidyTrackingId(split[1] + split[2])

  // Longest standalone digit run, skipping anything sitting in a phone / GST /
  // PIN context — those are the same length as an AWB and would otherwise win.
  const runs: string[] = []
  const re = /\d{9,14}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const before = text.slice(Math.max(0, m.index - 16), m.index)
    if (/(?:ph|mob(?:ile)?|cell|tel|phone|contact|gst(?:in)?|pin(?:code)?|\+91)\W{0,4}$/i.test(before)) continue
    runs.push(m[0])
  }
  if (runs.length) return runs.sort((a, b) => b.length - a.length)[0]
  return undefined
}

// Normalise a detected tracking ID: strip separators, uppercase, and repair the
// digit-for-letter confusions Tesseract makes inside the numeric tail (O→0,
// I/L→1, S→5, B→8, Z→2). Only the tail is touched — the leading letters of a
// prefix like "IXM" are legitimate.
function tidyTrackingId(raw: string): string {
  const cleaned = raw.replace(/[^A-Z0-9]/gi, '').toUpperCase()
  const split = cleaned.match(/^([A-Z]{0,4})(.*)$/)
  if (!split) return cleaned
  const [, prefix, tail] = split
  const fixedTail = tail.replace(/[OILSBZ]/g, (c) =>
    ({ O: '0', I: '1', L: '1', S: '5', B: '8', Z: '2' })[c] ?? c,
  )
  return prefix + fixedTail
}

/**
 * Detect a dispatch date and normalise to ISO (yyyy-mm-dd). Handles:
 *  - 05/06/2026, 05-06-2026, 05.06.2026  (dd/mm/yyyy)
 *  - 05 June 2026, 5 Jun 26, June 05 2026
 */
export function detectDispatchDate(text: string): string | undefined {
  // dd Month yyyy  /  Month dd yyyy
  const named = text.match(
    /\b(\d{1,2})\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*,?\s*(\d{2,4})\b/i,
  )
  if (named) {
    const day = Number(named[1])
    const mon = MONTHS[named[2].toLowerCase().slice(0, 3)]
    let year = Number(named[3])
    if (year < 100) year += 2000
    if (mon && day >= 1 && day <= 31) return `${year}-${pad(mon)}-${pad(day)}`
  }

  // dd/mm/yyyy and friends
  const numeric = text.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/)
  if (numeric) {
    const day = Number(numeric[1])
    const mon = Number(numeric[2])
    let year = Number(numeric[3])
    if (year < 100) year += 2000
    if (mon >= 1 && mon <= 12 && day >= 1 && day <= 31) {
      return `${year}-${pad(mon)}-${pad(day)}`
    }
  }
  return undefined
}

// ─── Image preprocessing ─────────────────────────────────────────────────────
// Tesseract is trained on ~300 DPI scans, not phone snaps of a courier label.
// Two cheap canvas steps make the difference between usable text and noise:
//   • upscale, so small print carries enough pixels per glyph to be recognised;
//   • greyscale + contrast stretch, which flattens the grey cast and uneven
//     lighting of a photo so the print separates cleanly from the paper.

const OCR_MIN_EDGE = 1800 // px — upscale until the short edge reaches this
const OCR_MAX_EDGE = 3200 // px — but never blow past this (wasm memory + time)

/** Greyscale in place, then linearly stretch the 2nd–98th percentile to 0–255. */
function greyscaleAndStretch(data: Uint8ClampedArray): void {
  const hist = new Uint32Array(256)
  const pixels = data.length / 4
  for (let i = 0; i < data.length; i += 4) {
    const g = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0
    data[i] = data[i + 1] = data[i + 2] = g
    hist[g]++
  }
  // Percentile clip rather than min/max: a single blown-out highlight or dark
  // speck would otherwise pin the range and undo the stretch.
  const clip = pixels * 0.02
  let acc = 0
  let lo = 0
  let hi = 255
  for (let v = 0; v < 256; v++) {
    acc += hist[v]
    if (acc >= clip) { lo = v; break }
  }
  acc = 0
  for (let v = 255; v >= 0; v--) {
    acc += hist[v]
    if (acc >= clip) { hi = v; break }
  }
  const range = Math.max(1, hi - lo)
  const lut = new Uint8Array(256)
  for (let v = 0; v < 256; v++) {
    lut[v] = Math.min(255, Math.max(0, Math.round(((v - lo) / range) * 255)))
  }
  for (let i = 0; i < data.length; i += 4) {
    const g = lut[data[i]]
    data[i] = data[i + 1] = data[i + 2] = g
  }
}

/** Otsu threshold → hard black/white. Sharpens worn thermal print dramatically. */
function binarise(data: Uint8ClampedArray): void {
  const hist = new Uint32Array(256)
  for (let i = 0; i < data.length; i += 4) hist[data[i]]++
  const total = data.length / 4
  let sum = 0
  for (let v = 0; v < 256; v++) sum += v * hist[v]
  let sumB = 0
  let wB = 0
  let best = 0
  let threshold = 128
  for (let v = 0; v < 256; v++) {
    wB += hist[v]
    if (!wB) continue
    const wF = total - wB
    if (!wF) break
    sumB += v * hist[v]
    const mB = sumB / wB
    const mF = (sum - sumB) / wF
    const between = wB * wF * (mB - mF) * (mB - mF)
    if (between > best) { best = between; threshold = v }
  }
  for (let i = 0; i < data.length; i += 4) {
    const v = data[i] > threshold ? 255 : 0
    data[i] = data[i + 1] = data[i + 2] = v
  }
}

/** 3×3 unsharp mask — recovers edges softened by upscaling a small photo. */
function sharpen(data: Uint8ClampedArray, w: number, h: number): void {
  const src = new Uint8ClampedArray(data)
  const at = (x: number, y: number) => src[(y * w + x) * 4]
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const v =
        5 * at(x, y) - at(x - 1, y) - at(x + 1, y) - at(x, y - 1) - at(x, y + 1)
      const g = v < 0 ? 0 : v > 255 ? 255 : v
      const i = (y * w + x) * 4
      data[i] = data[i + 1] = data[i + 2] = g
    }
  }
}

// The three renderings we OCR. They fail differently, which is the whole point —
// a digit that one variant misreads (an 8 whose left loop is faint reads as a 3)
// is usually read correctly by another, and the vote settles it.
type Variant = 'contrast' | 'binary' | 'sharp'

interface PreparedImage {
  /** Render one variant as a PNG blob, or the untouched original as fallback. */
  render: (variant: Variant) => Promise<File | Blob>
}

/** Decode + upscale once, then derive each OCR variant from the same pixels. */
async function prepareImage(image: File | Blob): Promise<PreparedImage> {
  const passthrough: PreparedImage = { render: async () => image }
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return passthrough

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(image, { imageOrientation: 'from-image' })
  } catch {
    return passthrough
  }

  try {
    const { width, height } = bitmap
    if (!width || !height) return passthrough
    let scale = Math.max(1, OCR_MIN_EDGE / Math.min(width, height))
    if (Math.max(width, height) * scale > OCR_MAX_EDGE) {
      scale = OCR_MAX_EDGE / Math.max(width, height)
    }
    const w = Math.max(1, Math.round(width * scale))
    const h = Math.max(1, Math.round(height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return passthrough
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, 0, 0, w, h)

    const base = ctx.getImageData(0, 0, w, h)
    greyscaleAndStretch(base.data)
    const grey = new Uint8ClampedArray(base.data)

    return {
      async render(variant) {
        const frame = new ImageData(new Uint8ClampedArray(grey), w, h)
        if (variant === 'binary') binarise(frame.data)
        if (variant === 'sharp') sharpen(frame.data, w, h)
        ctx.putImageData(frame, 0, 0)
        // PNG, not JPEG — JPEG ringing around high-contrast print is exactly
        // the artefact that costs characters.
        const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
        return out ?? image
      },
    }
  } catch {
    return passthrough
  } finally {
    bitmap.close()
  }
}

// ─── Barcode ─────────────────────────────────────────────────────────────────
// Every courier label carries the AWB as a barcode as well as printed digits.
// A barcode read is exact and self-checking, so when the browser exposes the
// Shape Detection API we trust it over anything OCR produces. Support is
// platform-dependent (absent on desktop Windows today), hence the feature test
// and the silent fallback to OCR.
interface DetectedBarcode { rawValue?: string }
interface BarcodeDetectorLike { detect(source: ImageBitmapSource): Promise<DetectedBarcode[]> }
interface BarcodeDetectorCtor {
  new (options?: { formats?: string[] }): BarcodeDetectorLike
  getSupportedFormats?: () => Promise<string[]>
}

// Linear symbologies couriers actually print; QR/DataMatrix are excluded because
// they usually encode a tracking URL or payload, not the bare AWB.
const BARCODE_FORMATS = ['code_128', 'code_39', 'codabar', 'itf', 'ean_13']

async function readBarcode(image: File | Blob): Promise<string | undefined> {
  const Ctor = (globalThis as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector
  if (!Ctor || typeof createImageBitmap !== 'function') return undefined
  try {
    const supported = (await Ctor.getSupportedFormats?.()) ?? []
    const formats = supported.length
      ? BARCODE_FORMATS.filter((f) => supported.includes(f))
      : BARCODE_FORMATS
    if (!formats.length) return undefined
    const detector = new Ctor({ formats })
    const bitmap = await createImageBitmap(image, { imageOrientation: 'from-image' })
    try {
      const codes = await detector.detect(bitmap)
      for (const code of codes) {
        const value = (code.rawValue ?? '').replace(/[^A-Z0-9]/gi, '').toUpperCase()
        // Shape check only — no digit repair. A decoded barcode is already exact.
        if (/^[A-Z]{0,4}\d{6,}$/.test(value)) return value
      }
    } finally {
      bitmap.close()
    }
  } catch {
    // Unsupported platform or no readable barcode — OCR takes over.
  }
  return undefined
}

// ─── Candidate consensus ─────────────────────────────────────────────────────
/**
 * Pick the tracking ID the passes agree on. A plain majority wins; if every pass
 * disagrees, fall back to a per-character vote across the candidates of the most
 * common length — that repairs a single misread digit (…808 vs …803) which is
 * by far the most frequent OCR failure on a printed AWB.
 */
export function consensusTrackingId(candidates: string[]): string | undefined {
  const list = candidates.filter(Boolean)
  if (!list.length) return undefined

  const counts = new Map<string, number>()
  for (const c of list) counts.set(c, (counts.get(c) ?? 0) + 1)
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
  const [top, topCount] = ranked[0]
  if (ranked.length === 1 || topCount > ranked[1][1]) return top

  // Tied. Vote character by character among the candidates of the modal length.
  const lengths = new Map<number, number>()
  for (const c of list) lengths.set(c.length, (lengths.get(c.length) ?? 0) + 1)
  const modalLength = [...lengths.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0]
  const sameLength = list.filter((c) => c.length === modalLength)
  if (sameLength.length < 2) return top

  let voted = ''
  for (let i = 0; i < modalLength; i++) {
    const tally = new Map<string, number>()
    for (const c of sameLength) tally.set(c[i], (tally.get(c[i]) ?? 0) + 1)
    voted += [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0]
  }
  return voted
}

// ─── Recognition passes ──────────────────────────────────────────────────────
// One page-segmentation mode never fits every receipt: a printed label is a
// scatter of small text boxes (SPARSE_TEXT), while a thermal or handwritten slip
// reads as one block (SINGLE_BLOCK). Each pass also gets a different rendering
// of the image, so the passes make *different* mistakes — that independence is
// what makes the tracking-ID vote meaningful.
//
// Restricting the charset on the ID passes stops Tesseract "correcting" an AWB
// into dictionary words.
const ID_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-/'

interface Pass {
  variant: Variant
  psm: PSM
  whitelist: string
  /** ID passes only contribute tracking-ID votes, not brand/date guesses. */
  idOnly: boolean
}

const PASSES: Pass[] = [
  { variant: 'contrast', psm: PSM.SPARSE_TEXT, whitelist: '', idOnly: false },
  { variant: 'contrast', psm: PSM.SINGLE_BLOCK, whitelist: '', idOnly: false },
  { variant: 'binary', psm: PSM.SPARSE_TEXT, whitelist: ID_CHARSET, idOnly: true },
  { variant: 'sharp', psm: PSM.SPARSE_TEXT, whitelist: ID_CHARSET, idOnly: true },
]

/**
 * Run OCR over a receipt image and extract courier fields.
 * @param file  the receipt image (image/* — PDFs should be rasterised first)
 * @param onProgress  0..1 recognition progress for a progress bar
 */
export async function extractCourierReceipt(
  file: File | Blob,
  onProgress?: (pct: number) => void,
): Promise<OcrResult> {
  const prepared = await prepareImage(file)

  // Progress spans every pass; each contributes an equal slice.
  let passIndex = 0
  const report = (p: number) => onProgress?.(Math.min(1, (passIndex + p) / PASSES.length))

  // Exact when available, so it outranks every OCR vote.
  const barcodeId = await readBarcode(file)

  const worker = await createWorker('eng', undefined, {
    logger: (m) => {
      if (m.status === 'recognizing text') report(m.progress)
    },
  })

  const texts: string[] = []
  const idVotes: string[] = []
  // The courier is resolved once at the end rather than per pass: detectCourier
  // ranks its evidence (name → strapline → AWB prefix → fuzzy), and taking the
  // first pass's answer would let an early fuzzy guess outrank a later exact one.
  let dispatchDate: string | undefined

  try {
    await worker.setParameters({ user_defined_dpi: '300', preserve_interword_spaces: '1' })

    for (const pass of PASSES) {
      // Skip the extra ID passes once the barcode has already given us an exact
      // answer — they'd cost seconds and can't improve on it.
      if (barcodeId && pass.idOnly) { passIndex++; continue }

      const image = await prepared.render(pass.variant)
      await worker.setParameters({
        tessedit_pageseg_mode: pass.psm,
        tessedit_char_whitelist: pass.whitelist,
      })
      // rotateAuto deskews a tilted photo before recognition — a couple of
      // degrees of tilt is normal for a hand-held shot and measurably hurts it.
      const { data } = await worker.recognize(image, { rotateAuto: true })
      const text = data.text || ''
      passIndex++
      if (!text.trim()) continue

      if (!pass.idOnly) {
        texts.push(text)
        // First confident hit wins, so a later noisy pass can't overwrite it.
        dispatchDate ??= detectDispatchDate(text)
      }
      const id = detectTrackingId(text)
      if (id) idVotes.push(id)
    }
  } finally {
    await worker.terminate()
  }

  onProgress?.(1)

  const rawText = texts.join('\n')
  const trackingId = barcodeId ?? consensusTrackingId(idVotes) ?? detectTrackingId(rawText)
  // Final sweep over the combined text — a field can be split across passes
  // (e.g. the label word in one, the value in another). The tracking ID is
  // passed in so its prefix can identify the brand when the logo didn't survive.
  return {
    rawText,
    courierName: detectCourier(rawText, trackingId),
    trackingId,
    dispatchDate: dispatchDate ?? detectDispatchDate(rawText),
  }
}

// ─── Status presentation helpers (shared by the tracking page) ───────────────
export const DELIVERY_STATUSES: DeliveryStatus[] = [
  'BOOKED',
  'DISPATCHED',
  'IN_TRANSIT',
  'ARRIVED_AT_HUB',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'RETURNED',
]

export const STATUS_LABEL: Record<DeliveryStatus, string> = {
  // Display label only — the underlying status value stays BOOKED. This is the
  // first tracking stage, shown as "Billed" (the delivery record is created
  // when the invoice is billed with courier enabled).
  BOOKED: 'Billed',
  DISPATCHED: 'Dispatched',
  IN_TRANSIT: 'In Transit',
  ARRIVED_AT_HUB: 'Arrived at Hub',
  OUT_FOR_DELIVERY: 'Out for Delivery',
  DELIVERED: 'Delivered',
  RETURNED: 'Returned',
}

// Tailwind background classes for the per-status colour dot (shared by the
// status filter and any status pill).
export const STATUS_DOT: Record<DeliveryStatus, string> = {
  BOOKED: 'bg-blue-500',
  DISPATCHED: 'bg-indigo-500',
  IN_TRANSIT: 'bg-violet-500',
  ARRIVED_AT_HUB: 'bg-sky-500',
  OUT_FOR_DELIVERY: 'bg-amber-500',
  DELIVERED: 'bg-emerald-500',
  RETURNED: 'bg-rose-500',
}

// Ordered progress index used to render the stepper. RETURNED is terminal and
// sits outside the happy path (index -1 → rendered distinctly).
export function statusStep(status: DeliveryStatus): number {
  if (status === 'RETURNED') return -1
  return DELIVERY_STATUSES.indexOf(status)
}

// Display status for the UI: "Dispatched" is folded into "In Transit" (the
// workflow treats them as one). DISPATCHED remains the internal carrier value;
// this only affects what users see (badges, labels).
export function displayDeliveryStatus(status: DeliveryStatus): DeliveryStatus {
  return status === 'DISPATCHED' ? 'IN_TRANSIT' : status
}
