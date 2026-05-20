/**
 * Prints a jsPDF document in-page using a hidden iframe.
 * Avoids window.open/_blank which gets blocked by popup blockers
 * and violates the same-window constraint for production.
 */
export function printPdfInPage(blobUrl: string) {
  const existing = document.getElementById('__print_iframe__')
  if (existing) existing.remove()

  const iframe = document.createElement('iframe')
  iframe.id = '__print_iframe__'
  iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none;'
  iframe.src = blobUrl

  const cleanup = () => {
    try { URL.revokeObjectURL(blobUrl) } catch { /* already revoked */ }
    iframe.remove()
  }

  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus()
      iframe.contentWindow?.print()
      // Clean up as soon as the print dialog closes — works in Chrome/Firefox.
      // Safari doesn't fire afterprint reliably, so we keep a 60s safety net.
      iframe.contentWindow?.addEventListener('afterprint', cleanup, { once: true })
    } catch {
      // Fallback: open in same tab if iframe print fails (e.g. strict CSP)
      window.location.href = blobUrl
    }
    setTimeout(cleanup, 60000)
  }

  document.body.appendChild(iframe)
}

/**
 * Prints an HTML string in-page using a hidden iframe.
 * Replaces the window.open('', '_blank') pattern in printReport().
 */
export function printHtmlInPage(html: string) {
  const existing = document.getElementById('__print_iframe__')
  if (existing) existing.remove()

  const iframe = document.createElement('iframe')
  iframe.id = '__print_iframe__'
  iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none;'

  document.body.appendChild(iframe)

  const win = iframe.contentWindow
  if (!win) return
  win.document.open()
  win.document.write(html)
  win.document.close()

  const removeIframe = () => iframe.remove()
  iframe.onload = () => {
    try {
      win.focus()
      win.print()
      win.addEventListener('afterprint', removeIframe, { once: true })
    } catch {
      // no-op
    }
    setTimeout(removeIframe, 60000)
  }
}
