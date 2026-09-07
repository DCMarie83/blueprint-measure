// One content model for payment options. The React block, the invoice PDF,
// and the estimate PDF all render from buildPaymentMethods(); the Deno twin at
// supabase/functions/_shared/paymentMethods.ts feeds the three email
// functions. Keep the two files' logic and the fixture below identical.
//
// FIXTURE (keep byte-identical in src/lib/paymentMethods.js and
// supabase/functions/_shared/paymentMethods.ts — drift here means the app and
// the emails disagree):
//   buildPaymentMethods({
//     zelle: { enabled: true, handle: 'a@b.c', qr_path: 'co/zelle.png' },
//     ach: { enabled: true, bank_name: 'B', routing_number: '1', account_number: '2', account_type: 'checking' },
//   }, { surface: 'app' })
//   => [
//     { key: 'zelle', lines: [{ label: null, value: 'a@b.c' }], link: null, qr_path: 'co/zelle.png', linkLabel: null },
//     { key: 'ach', lines: [
//       { label: 'bank', value: 'B' }, { label: 'routing', value: '1' },
//       { label: 'account', value: '2' }, { label: 'accountType', value: 'checking' },
//     ], link: null, qr_path: null, linkLabel: null },
//   ]
//   Same input with { surface: 'portal' } and ach.has_details true
//   => the ach entry becomes { key: 'ach', lines: [], revealable: true, ... }
//   Same input with { surface: 'pdf' } or { surface: 'email' }
//   => the ach entry becomes the single pointer
//      { key: 'bank_pointer', pointer: true, lines: [{ label: null,
//        value: 'Bank transfer details are available on your secure invoice page.' }] }

export const METHOD_ORDER = ['check', 'zelle', 'venmo', 'cashapp', 'ach', 'wire', 'card_external', 'other']

// English strings for renderers without i18n (PDF, email). The React block
// translates the same keys through invoices:payment.* instead.
export const EN_METHOD_LABELS = {
  check: 'Check',
  zelle: 'Zelle',
  venmo: 'Venmo',
  cashapp: 'Cash App',
  ach: 'ACH transfer',
  wire: 'Wire transfer',
  card_external: 'Pay by card',
  other: 'Other',
}

export const EN_LINE_LABELS = {
  payableTo: 'Payable to',
  mailTo: 'Mail to',
  bank: 'Bank',
  routing: 'Routing number',
  account: 'Account number',
  accountType: 'Account type',
  swift: 'SWIFT/BIC',
}

export const BANK_POINTER_TEXT = 'Bank transfer details are available on your secure invoice page.'

const trimmed = (v) => String(v ?? '').trim()

function lines(pairs) {
  return pairs.filter(p => trimmed(p.value) !== '').map(p => ({ label: p.label, value: trimmed(p.value) }))
}

// surface: 'app' (contractor screens, full bank lines) | 'portal' (bank
// methods collapse to a revealable row when details exist) | 'pdf' | 'email'
// (bank methods collapse to ONE pointer line; numbers never render).
export function buildPaymentMethods(pi, { surface = 'app' } = {}) {
  if (!pi || typeof pi !== 'object') return []
  const out = []
  let pointerEmitted = false
  const push = (key, methodLines, extra = {}) => {
    const link = trimmed(extra.link) || null
    const qr = trimmed(extra.qr_path) || null
    if (methodLines.length === 0 && !link && !qr) return
    out.push({ key, lines: methodLines, link, qr_path: qr, linkLabel: extra.linkLabel || null })
  }

  for (const key of METHOD_ORDER) {
    const d = pi[key]
    if (!d?.enabled) continue
    if (key === 'check') {
      push(key, lines([
        { label: 'payableTo', value: d.payable_to },
        { label: 'mailTo', value: d.mailing_address },
      ]))
    } else if (key === 'zelle' || key === 'venmo' || key === 'cashapp') {
      const prefix = key === 'venmo' ? '@' : key === 'cashapp' ? '$' : ''
      push(key, lines([{ label: null, value: trimmed(d.handle) ? prefix + trimmed(d.handle) : '' }]),
        { link: d.link, qr_path: d.qr_path })
    } else if (key === 'ach' || key === 'wire') {
      const hasDetails = d.has_details === true ||
        trimmed(d.routing_number) !== '' || trimmed(d.account_number) !== '' || trimmed(d.swift) !== ''
      if (surface === 'pdf' || surface === 'email') {
        if (!pointerEmitted && (hasDetails || trimmed(d.bank_name) || trimmed(d.instructions))) {
          out.push({ key: 'bank_pointer', pointer: true, lines: [{ label: null, value: BANK_POINTER_TEXT }], link: null, qr_path: null, linkLabel: null })
          pointerEmitted = true
        }
        continue
      }
      if (surface === 'portal' && hasDetails) {
        out.push({ key, lines: [], link: null, qr_path: null, linkLabel: null, revealable: true })
        continue
      }
      // app surface (full details from the company row), or a portal shape
      // that carries no numbers at all: plain lines, numbers only if present.
      push(key, lines([
        { label: 'bank', value: d.bank_name },
        { label: 'routing', value: d.routing_number },
        { label: 'account', value: d.account_number },
        key === 'ach' ? { label: 'accountType', value: d.account_type } : { label: 'swift', value: d.swift },
        // Legacy free-text ACH stays visible until replaced with fields.
        { label: null, value: d.instructions },
      ]))
    } else if (key === 'card_external') {
      push(key, [], { link: d.url, linkLabel: trimmed(d.label) || null })
    } else if (key === 'other') {
      push(key, lines([{ label: null, value: d.instructions }]))
    }
  }
  return out
}
