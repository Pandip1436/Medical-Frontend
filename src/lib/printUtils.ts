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

  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus()
      iframe.contentWindow?.print()
    } catch {
      // Fallback: open in same tab if iframe print fails (e.g. strict CSP)
      window.location.href = blobUrl
    }
    // Clean up after print dialog closes
    setTimeout(() => {
      URL.revokeObjectURL(blobUrl)
      iframe.remove()
    }, 60000)
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

  iframe.onload = () => {
    try {
      win.focus()
      win.print()
    } catch {
      // no-op
    }
    setTimeout(() => iframe.remove(), 60000)
  }
}
