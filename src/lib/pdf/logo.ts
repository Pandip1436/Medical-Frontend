// Loads the business logo (/logo.png) once and caches it as a base64 data URL
// so the synchronous jsPDF generators can embed it via doc.addImage(). Preloaded
// at app startup (see main.tsx) so it's ready by the time anyone prints.

let cached: string | null | undefined // undefined = not loaded yet, null = absent/failed
let loading: Promise<void> | null = null

export function preloadPdfLogo(src = '/logo.png'): Promise<void> {
  if (loading) return loading
  loading = (async () => {
    try {
      const res = await fetch(src)
      if (!res.ok) { cached = null; return }
      const blob = await res.blob()
      cached = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(blob)
      })
    } catch {
      cached = null
    }
  })()
  return loading
}

/** Synchronous accessor for jsPDF. Returns the cached data URL, or null when the
 *  logo file isn't present (PDF then renders without it). Kicks off a load if it
 *  hasn't started, so the next document picks it up. */
export function getPdfLogo(): string | null {
  if (cached === undefined) void preloadPdfLogo()
  return cached ?? null
}
