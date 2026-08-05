// Human wording for the `reason` code POST /billing/:id/send-whatsapp returns
// (see InvoiceCreatedListener's SendOutcome on the backend).
//
// This used to be one hardcoded sentence — "no phone, opted out, or auto-send
// is disabled" — shown for every non-send. When the real cause was none of
// those three (a stalled run holding the invoice's in-flight guard), the toast
// actively pointed the operator at the wrong thing. Each cause now names itself.
const SEND_SKIP_REASONS: Record<string, string> = {
  ALREADY_IN_PROGRESS: 'A send for this invoice is already running — wait a few seconds and try again',
  THROTTLED: 'Just sent moments ago — wait 30 seconds before resending',
  AUTO_SEND_DISABLED: 'WhatsApp sending is switched off on the server (WHATSAPP_AUTO_SEND_ENABLED)',
  NOT_AN_INVOICE: 'Only invoices can be sent over WhatsApp',
  INVOICE_NOT_ELIGIBLE: 'Draft and cancelled invoices are not sent',
  INVOICE_NOT_FOUND: 'Invoice no longer exists',
  NO_CUSTOMER: 'This invoice has no linked customer',
  CUSTOMER_OPTED_OUT: 'Customer has opted out of WhatsApp messages',
  NO_PHONE: 'Customer has no phone number on file',
  ALREADY_SENT: 'Already delivered to this customer',
  PDF_FAILED: 'Could not generate the invoice PDF',
  SEND_FAILED: 'WhatsApp provider rejected the message',
  TIMED_OUT: 'The send timed out on the server — try again',
  RECEIPT_QUEUED: 'Invoice is fully paid — a receipt was queued instead',
}

// `detail` carries the underlying error text when there is one; it's the part
// that actually tells you what to fix, so keep it in the message.
export function describeSendSkip(reason?: string, detail?: string): string {
  const base = (reason && SEND_SKIP_REASONS[reason]) ?? 'Not sent — the server did not report a reason'
  return detail ? `${base} (${detail})` : base
}
