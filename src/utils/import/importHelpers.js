// Shared helpers for the import wizards (clients / jobs / invoices).
// All normalization of enum-ish values lives here so the review step shows
// exactly what will be written and no row fails a DB CHECK on free text.

// ── Batch id ─────────────────────────────────────────────────────────────────
// Every importer run mints one batch id; every row it creates carries it in
// import_source. Auto-created placeholder parents get `<batch>:placeholder`.
const BATCH_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'

export function mintBatchId(now = new Date()) {
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  let rand = ''
  for (let i = 0; i < 6; i++) rand += BATCH_ALPHABET[Math.floor(Math.random() * BATCH_ALPHABET.length)]
  return `import-${ymd}-${rand}`
}

// Appended to import_source when a batch updates an existing row, so a row's
// history reads "import-...-abc123,import-...-def456".
export function appendBatchId(existingSource, batchId) {
  if (!existingSource) return batchId
  if (existingSource.split(',').includes(batchId)) return existingSource
  return `${existingSource},${batchId}`
}

export function isPlaceholderSource(importSource) {
  return typeof importSource === 'string' && importSource.endsWith(':placeholder')
}

// Update semantics: only mapped non-empty values overwrite; blanks never clear.
// `values` maps column → candidate value; entries that are '', null, or
// undefined are dropped from the patch.
export function buildUpdatePatch(values) {
  const patch = {}
  for (const [key, val] of Object.entries(values)) {
    if (val === '' || val == null) continue
    patch[key] = val
  }
  return patch
}

export function digitsOnly(value) {
  return String(value ?? '').replace(/\D/g, '')
}

// Reads an optional extra worksheet (e.g. "Line Items") from the parser's
// extraSheets map, returning rows with lowercased/trimmed header keys so
// lookups are tolerant of header casing.
export function extraSheetRows(extraSheets, ...names) {
  if (!extraSheets) return []
  for (const name of names) {
    const sheet = extraSheets[name]
    if (sheet?.rows?.length) {
      return sheet.rows.map(row => {
        const out = {}
        for (const [k, v] of Object.entries(row)) out[String(k).trim().toLowerCase()] = v
        return out
      })
    }
  }
  return []
}

// ── Value parsing ────────────────────────────────────────────────────────────

// Money / numeric: strips $ , and whitespace. Returns a number or null.
export function parseMoney(value) {
  const s = String(value ?? '').replace(/[$,\s]/g, '')
  if (!s) return null
  const n = Number(s)
  if (!Number.isFinite(n)) return null
  return Math.round(n * 100) / 100
}

// Dates: ISO (2026-03-04), US (3/4/2026, 03-04-26), then a Date.parse fallback
// for spreadsheet-stringified dates. Returns 'YYYY-MM-DD' or null.
export function parseDateFlexible(value) {
  const s = String(value ?? '').trim()
  if (!s) return null

  let y, mo, d
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) {
    y = Number(m[1]); mo = Number(m[2]); d = Number(m[3])
  } else {
    m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/)
    if (m) {
      mo = Number(m[1]); d = Number(m[2])
      y = Number(m[3].length === 2 ? `20${m[3]}` : m[3])
    }
  }

  if (y == null) {
    const parsed = new Date(s)
    if (Number.isNaN(parsed.getTime())) return null
    y = parsed.getFullYear(); mo = parsed.getMonth() + 1; d = parsed.getDate()
  }

  if (y < 1970 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return null
  // Round-trip to reject impossible dates like 2/30.
  const check = new Date(Date.UTC(y, mo - 1, d))
  if (check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function isValidEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
}

// ── Enum normalization ───────────────────────────────────────────────────────

// Matches the prod CHECK: residential | commercial | general_contractor.
export const VALID_CLIENT_TYPES = new Set(['residential', 'commercial', 'general_contractor'])

export function normalizeClientType(value, fallback) {
  const norm = String(value ?? '').trim().toLowerCase().replace(/\s+/g, '_')
  if (VALID_CLIENT_TYPES.has(norm)) return norm
  if (norm === 'gc' || norm === 'general contractor') return 'general_contractor'
  return fallback
}

// clients_billing_terms_check: due_on_receipt | net_15 | net_30 | net_45 | net_60 | custom.
// Unknown free text returns null (column is nullable) rather than failing the row.
export function normalizeBillingTerms(value) {
  const norm = String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (!norm) return null
  if (['due_on_receipt', 'net_15', 'net_30', 'net_45', 'net_60', 'custom'].includes(norm)) return norm
  if (['due_upon_receipt', 'on_receipt', 'receipt', 'cod', 'due'].includes(norm)) return 'due_on_receipt'
  const m = norm.match(/^(?:net_?)?(15|30|45|60)(?:_days?)?$/)
  if (m) return `net_${m[1]}`
  return null
}

// invoices.payment_method CHECK: cash | check | card | bank_transfer | other.
// Returns { method, original } — original is set when unknown text was coerced
// to 'other' so the caller can preserve it in payment_notes.
const PAYMENT_METHOD_MAP = {
  cash: 'cash',
  check: 'check', cheque: 'check', checks: 'check',
  card: 'card', credit: 'card', credit_card: 'card', debit: 'card', debit_card: 'card',
  cc: 'card', visa: 'card', mastercard: 'card', amex: 'card', discover: 'card',
  bank: 'bank_transfer', bank_transfer: 'bank_transfer', transfer: 'bank_transfer',
  ach: 'bank_transfer', wire: 'bank_transfer', wire_transfer: 'bank_transfer',
  eft: 'bank_transfer', direct_deposit: 'bank_transfer',
  other: 'other',
}

export function normalizePaymentMethod(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return { method: null, original: null }
  const norm = raw.toLowerCase().replace(/[\s-]+/g, '_')
  const method = PAYMENT_METHOD_MAP[norm]
  if (method) return { method, original: null }
  return { method: 'other', original: raw }
}

// invoices_status_check: draft | sent | viewed | partial | paid | void.
export const INVOICE_STATUSES = new Set(['draft', 'sent', 'viewed', 'partial', 'paid', 'void'])

export function normalizeInvoiceStatus(value) {
  const norm = String(value ?? '').trim().toLowerCase()
  return INVOICE_STATUSES.has(norm) ? norm : null
}

// Derive invoice status from amounts (explicit valid status always wins upstream).
export function deriveInvoiceStatus(total, paid) {
  if (paid >= total && total > 0) return 'paid'
  if (paid > 0) return 'partial'
  return 'sent'
}

// estimates_status_check: draft | sent | accepted | declined | expired | changes_requested.
export const ESTIMATE_STATUSES = new Set(['draft', 'sent', 'accepted', 'declined', 'expired', 'changes_requested'])

export function normalizeEstimateStatus(value) {
  const norm = String(value ?? '').trim().toLowerCase().replace(/\s+/g, '_')
  return ESTIMATE_STATUSES.has(norm) ? norm : null
}

// change_orders.status: proposed | approved | declined | void.
export const CHANGE_ORDER_STATUSES = new Set(['proposed', 'approved', 'declined', 'void'])

export function normalizeChangeOrderStatus(value) {
  const norm = String(value ?? '').trim().toLowerCase()
  return CHANGE_ORDER_STATUSES.has(norm) ? norm : null
}

// pricing_items.unit CHECK: sf | lf | each | hour | lump_sum.
export function normalizeUnit(value, fallback = 'each') {
  const norm = String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (!norm) return fallback
  if (['sf', 'lf', 'each', 'hour', 'lump_sum'].includes(norm)) return norm
  const map = {
    sqft: 'sf', sq_ft: 'sf', square_feet: 'sf', square_foot: 'sf', ft2: 'sf',
    lnft: 'lf', lin_ft: 'lf', linear_feet: 'lf', linear_foot: 'lf',
    ea: 'each', unit: 'each', units: 'each', count: 'each', item: 'each',
    hr: 'hour', hrs: 'hour', hours: 'hour',
    ls: 'lump_sum', lump: 'lump_sum', lumpsum: 'lump_sum', flat: 'lump_sum', job: 'lump_sum',
  }
  return map[norm] ?? fallback
}

// Invoice due date from the matched client's billing terms: net_XX adds days,
// due_on_receipt is the invoice date, anything else (custom, none, no client)
// falls back to invoice date + 30. Dates are 'YYYY-MM-DD' strings.
export function dueDateFromTerms(invoiceDate, billingTerms) {
  if (!invoiceDate) return null
  const NET_DAYS = { net_15: 15, net_30: 30, net_45: 45, net_60: 60 }
  if (billingTerms === 'due_on_receipt') return invoiceDate
  const days = NET_DAYS[billingTerms] ?? 30
  const [y, m, d] = invoiceDate.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}

// projects_status_check (prod): new_lead | estimating | estimate_sent | approved
// | in_progress | complete | archived | active.
export const PROJECT_STATUSES = new Set([
  'new_lead', 'estimating', 'estimate_sent', 'approved', 'in_progress', 'complete', 'archived', 'active',
])

export function normalizeProjectStatus(value) {
  const norm = String(value ?? '').trim().toLowerCase().replace(/\s+/g, '_')
  return PROJECT_STATUSES.has(norm) ? norm : null
}

// Blank Status derives from the resolved kanban column key.
export function deriveProjectStatusFromColumn(columnKey) {
  switch (columnKey) {
    case 'complete': return 'complete'
    case 'in_progress': return 'in_progress'
    case 'sent_to_client': return 'estimate_sent'
    case 'accepted':
    case 'deposit_received':
    case 'scheduled': return 'approved'
    default: return 'active'
  }
}

// ── Kanban column resolution ─────────────────────────────────────────────────
// Inverse of src/lib/kanbanColumnLabel.js for the 9 base columns. The label
// sets mirror jobs:kanbanColumn.* in en.json / es.json (the es bundle is
// lazy-loaded, so a static map keeps resolution language-independent).
export const BASE_COLUMN_KEYS = [
  'measurements_estimates', 'job_costing', 'review', 'sent_to_client', 'accepted',
  'deposit_received', 'scheduled', 'in_progress', 'complete',
]

const COLUMN_LABEL_TO_KEY = {
  'measurements & estimates': 'measurements_estimates',
  'measurements and estimates': 'measurements_estimates',
  'mediciones y cotizaciones': 'measurements_estimates',
  'job costing': 'job_costing',
  'costeo del trabajo': 'job_costing',
  'review': 'review',
  'revisión': 'review',
  'revision': 'review',
  'sent to client': 'sent_to_client',
  'enviado al cliente': 'sent_to_client',
  'accepted': 'accepted',
  'aceptado': 'accepted',
  'deposit received': 'deposit_received',
  'depósito recibido': 'deposit_received',
  'deposito recibido': 'deposit_received',
  'scheduled': 'scheduled',
  'programado': 'scheduled',
  'in progress': 'in_progress',
  'en progreso': 'in_progress',
  'complete': 'complete',
  'completado': 'complete',
}

export function resolveColumnKeyFromLabel(label) {
  const norm = String(label ?? '').trim().toLowerCase()
  if (!norm) return null
  const asKey = norm.replace(/\s+/g, '_')
  if (BASE_COLUMN_KEYS.includes(asKey)) return asKey
  return COLUMN_LABEL_TO_KEY[norm] ?? null
}

// Resolve a spreadsheet Column label to one of the company's kanban_columns.
// Order: base label (EN/ES) or raw key → column_key match; then exact name
// match (covers renamed/custom columns). Returns the row or null.
export function resolveKanbanColumn(label, columns) {
  const norm = String(label ?? '').trim().toLowerCase()
  if (!norm || !columns?.length) return null
  const key = resolveColumnKeyFromLabel(norm)
  if (key) {
    const byKey = columns.find(c => c.column_key === key)
    if (byKey) return byKey
  }
  return columns.find(c => (c.name ?? '').trim().toLowerCase() === norm) ?? null
}

export function lowestPositionColumn(columns) {
  if (!columns?.length) return null
  return [...columns].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))[0]
}

// ── Client matching ──────────────────────────────────────────────────────────

// One-time index over the company's clients: display_name, business_name and
// primary_email all match case-insensitively.
export function buildClientIndex(clients) {
  const index = new Map()
  for (const c of clients ?? []) {
    for (const key of [c.display_name, c.business_name, c.primary_email]) {
      const norm = String(key ?? '').trim().toLowerCase()
      if (norm && !index.has(norm)) index.set(norm, c)
    }
  }
  return index
}

export function matchClient(index, text) {
  const norm = String(text ?? '').trim().toLowerCase()
  if (!norm) return null
  return index.get(norm) ?? null
}

// Upsert matcher for the clients importer: email first, then phone digits
// (last 10), then display_name — all case-insensitive.
export function buildClientMatcher(clients) {
  const byEmail = new Map()
  const byPhone = new Map()
  const byName = new Map()
  for (const c of clients ?? []) {
    const email = String(c.primary_email ?? '').trim().toLowerCase()
    if (email && !byEmail.has(email)) byEmail.set(email, c)
    const phone = digitsOnly(c.primary_phone).slice(-10)
    if (phone.length >= 7 && !byPhone.has(phone)) byPhone.set(phone, c)
    const name = String(c.display_name ?? '').trim().toLowerCase()
    if (name && !byName.has(name)) byName.set(name, c)
  }
  return function matchClientRow({ primary_email, primary_phone, display_name }) {
    const email = String(primary_email ?? '').trim().toLowerCase()
    if (email && byEmail.has(email)) return byEmail.get(email)
    const phone = digitsOnly(primary_phone).slice(-10)
    if (phone.length >= 7 && byPhone.has(phone)) return byPhone.get(phone)
    const name = String(display_name ?? '').trim().toLowerCase()
    if (name && byName.has(name)) return byName.get(name)
    return null
  }
}

// Placeholder clients created for unmatched names: business-looking names
// become commercial, everything else residential.
const COMMERCIAL_NAME_RE = /\b(llc|inc|co|company|builders|group|construction|homes|properties|equities)\b/i

export function guessClientType(name) {
  return COMMERCIAL_NAME_RE.test(String(name ?? '')) ? 'commercial' : 'residential'
}
