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
//   })
//   => [
//     { key: 'zelle', lines: [{ label: null, value: 'a@b.c' }], link: null, qr_path: 'co/zelle.png' },
//     { key: 'ach', lines: [
//       { label: 'bank', value: 'B' }, { label: 'routing', value: '1' },
//       { label: 'account', value: '2' }, { label: 'accountType', value: 'checking' },
//     ], link: null, qr_path: null },
//   ]

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

const trimmed = (v) => String(v ?? '').trim()

function lines(pairs) {
  return pairs.filter(p => trimmed(p.value) !== '').map(p => ({ label: p.label, value: trimmed(p.value) }))
}

export function buildPaymentMethods(pi) {
  if (!pi || typeof pi !== 'object') return []
  const out = []
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
    } else if (key === 'ach') {
      push(key, lines([
        { label: 'bank', value: d.bank_name },
        { label: 'routing', value: d.routing_number },
        { label: 'account', value: d.account_number },
        { label: 'accountType', value: d.account_type },
        // Legacy free-text ACH stays visible until replaced with fields.
        { label: null, value: d.instructions },
      ]))
    } else if (key === 'wire') {
      push(key, lines([
        { label: 'bank', value: d.bank_name },
        { label: 'routing', value: d.routing_number },
        { label: 'account', value: d.account_number },
        { label: 'swift', value: d.swift },
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
