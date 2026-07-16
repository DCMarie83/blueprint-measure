// Branded multi-sheet .xlsx for the Lite Reports bookkeeper handoff. Reuses the
// exact ExcelJS branding conventions from generateLiteInvoiceXLSX.js (logo embed,
// dark header band, frozen header row, REAL numeric cells) but spans a whole
// reporting period across four tabs: Summary, Payments, Invoices, Work Log.
// This is a money surface — every label stays plain and pun-free.

const SUPPORTED_MIME = { 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/gif': 'gif' }
const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B2426' } }
const HEADER_FONT = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
const MONEY_FMT = '$#,##0.00'
const NUM_FMT = '0.00'

const UNIT_LABELS = { sf: 'SF', lf: 'LF', each: 'Each', hour: 'Hour', lump_sum: 'Lump Sum' }
const STATUS_LABELS = {
  draft: 'Draft', sent: 'Sent', viewed: 'Viewed',
  partial: 'Partial', paid: 'Paid', void: 'Void',
}

async function fetchLogoBuffer(url) {
  if (!url) return null
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    const ext = SUPPORTED_MIME[blob.type]
    if (!ext) return null // SVG / unsupported — skip gracefully
    const arrayBuffer = await blob.arrayBuffer()
    return { buffer: arrayBuffer, extension: ext }
  } catch {
    return null
  }
}

function loadImageDimensions(url) {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => resolve(null)
    img.src = url
  })
}

function fmtDate(d) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

// Write a dark-band, frozen header row and return the first data row number.
function writeHeader(ws, headers, widths) {
  ws.columns = widths.map(w => ({ width: w }))
  const headerRow = ws.getRow(1)
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1)
    cell.value = h
    cell.font = HEADER_FONT
    cell.fill = HEADER_FILL
    cell.alignment = { vertical: 'middle' }
  })
  headerRow.commit()
  ws.views = [{ state: 'frozen', ySplit: 1, xSplit: 0 }]
  return 2
}

/**
 * Build + download the branded multi-sheet bookkeeper workbook.
 * All figures are passed in pre-computed by LiteReportsPage (money math is
 * client-side everywhere in Lite — there is no DB total trigger).
 *
 * @param {Object} opts
 * @param {Object} opts.company   { name, logo_url }
 * @param {Object} opts.period    { label, from, to }  (from/to are YYYY-MM-DD)
 * @param {Object} opts.summary   { paymentsTotal, invoicedTotal, collectedTotal, outstandingTotal, unbilledTotal }
 * @param {Array}  opts.payments  [{ date, invoiceNumber, gcName, method, amount }]
 * @param {Array}  opts.invoices  [{ invoiceNumber, gcName, issuedDate, total, collected, balance, status }]
 * @param {Array}  opts.workLog   [{ workDate, jobName, gcName, item, unit, qtyOrHours, rate, amount, invoiceRef }]
 */
export async function generateLiteReportXLSX({ company, period, summary, payments, invoices, workLog }) {
  const ExcelJS = (await import('exceljs')).default
  const workbook = new ExcelJS.Workbook()

  // ── Sheet 1: Summary ────────────────────────────────────────────
  const sum = workbook.addWorksheet('Summary')
  sum.columns = [{ width: 26 }, { width: 20 }]

  let row = 1
  const logoTargetHeight = 40
  const logo = company?.logo_url ? await fetchLogoBuffer(company.logo_url) : null
  if (logo) {
    const dims = await loadImageDimensions(company.logo_url)
    if (dims && dims.height > 0) {
      const aspect = dims.width / dims.height
      const pxWidth = Math.round(logoTargetHeight * aspect)
      const imageId = workbook.addImage({ buffer: logo.buffer, extension: logo.extension })
      sum.addImage(imageId, { tl: { col: 0, row: 0 }, ext: { width: pxWidth, height: logoTargetHeight } })
      row = 3 // clear the embedded logo band
    }
  }

  const titleCell = sum.getCell(row, 1)
  titleCell.value = company?.name || 'Report'
  titleCell.font = { bold: true, size: 16 }
  row += 1

  const periodCell = sum.getCell(row, 1)
  periodCell.value = `${period.label}  ·  ${fmtDate(period.from)} – ${fmtDate(period.to)}`
  periodCell.font = { size: 10, italic: true, color: { argb: 'FF666666' } }
  row += 2

  const summaryRows = [
    ['Payments received', summary.paymentsTotal],
    ['Invoices issued', summary.invoicedTotal],
    ['Outstanding', summary.outstandingTotal],
    ['Unbilled work', summary.unbilledTotal],
  ]
  for (const [label, value] of summaryRows) {
    const r = sum.getRow(row)
    r.getCell(1).value = label
    r.getCell(1).font = { bold: true }
    const v = r.getCell(2)
    v.value = Number(value) || 0
    v.numFmt = MONEY_FMT
    r.commit()
    row += 1
  }

  // Attribution footer — Summary sheet only, mirrors the invoice exporter.
  row += 1
  const footerCell = sum.getCell(row, 1)
  footerCell.value = 'Powered by RivetDog - rivetdog.com'
  footerCell.font = { size: 9, italic: true, color: { argb: 'FF999999' } }

  // ── Sheet 2: Payments ───────────────────────────────────────────
  const pmt = workbook.addWorksheet('Payments')
  let pr = writeHeader(pmt, ['Date', 'Invoice', 'GC', 'Method', 'Amount'], [14, 16, 28, 16, 16])
  for (const p of payments) {
    const r = pmt.getRow(pr)
    r.getCell(1).value = fmtDate(p.date)
    r.getCell(2).value = p.invoiceNumber || ''
    r.getCell(3).value = p.gcName || ''
    r.getCell(4).value = p.method || '—'
    const a = r.getCell(5); a.value = Number(p.amount) || 0; a.numFmt = MONEY_FMT
    r.commit()
    pr += 1
  }
  pr += 1
  const pTot = pmt.getRow(pr)
  pTot.getCell(4).value = 'Total'
  pTot.getCell(4).font = { bold: true }
  const pTotCell = pTot.getCell(5)
  pTotCell.value = Number(summary.paymentsTotal) || 0
  pTotCell.numFmt = MONEY_FMT
  pTotCell.font = { bold: true }
  pTot.commit()

  // ── Sheet 3: Invoices ───────────────────────────────────────────
  const inv = workbook.addWorksheet('Invoices')
  let ir = writeHeader(inv, ['Invoice', 'GC', 'Issued', 'Total', 'Collected', 'Balance', 'Status'], [16, 28, 14, 14, 14, 14, 12])
  for (const v of invoices) {
    const r = inv.getRow(ir)
    r.getCell(1).value = v.invoiceNumber || ''
    r.getCell(2).value = v.gcName || ''
    r.getCell(3).value = fmtDate(v.issuedDate)
    const t = r.getCell(4); t.value = Number(v.total) || 0; t.numFmt = MONEY_FMT
    const c = r.getCell(5); c.value = Number(v.collected) || 0; c.numFmt = MONEY_FMT
    const b = r.getCell(6); b.value = Number(v.balance) || 0; b.numFmt = MONEY_FMT
    r.getCell(7).value = STATUS_LABELS[v.status] || v.status || ''
    r.commit()
    ir += 1
  }
  ir += 1
  const iTot = inv.getRow(ir)
  iTot.getCell(3).value = 'Totals'
  iTot.getCell(3).font = { bold: true }
  const iIssued = iTot.getCell(4); iIssued.value = Number(summary.invoicedTotal) || 0; iIssued.numFmt = MONEY_FMT; iIssued.font = { bold: true }
  const iColl = iTot.getCell(5); iColl.value = Number(summary.collectedTotal) || 0; iColl.numFmt = MONEY_FMT; iColl.font = { bold: true }
  const iOut = iTot.getCell(6); iOut.value = Number(summary.outstandingTotal) || 0; iOut.numFmt = MONEY_FMT; iOut.font = { bold: true }
  iTot.commit()

  // ── Sheet 4: Work Log (every entry in range, billed or not) ─────
  const wl = workbook.addWorksheet('Work Log')
  let wr = writeHeader(wl, ['Date', 'Job', 'GC', 'Item / Description', 'Unit', 'Qty/Hrs', 'Rate', 'Amount', 'Invoice'], [14, 24, 24, 34, 10, 10, 14, 14, 16])
  for (const e of workLog) {
    const r = wl.getRow(wr)
    r.getCell(1).value = fmtDate(e.workDate)
    r.getCell(2).value = e.jobName || ''
    r.getCell(3).value = e.gcName || ''
    r.getCell(4).value = e.item || ''
    r.getCell(5).value = UNIT_LABELS[e.unit] || e.unit || ''
    const q = r.getCell(6); q.value = Number(e.qtyOrHours) || 0; q.numFmt = NUM_FMT
    const rt = r.getCell(7); rt.value = Number(e.rate) || 0; rt.numFmt = MONEY_FMT
    const a = r.getCell(8); a.value = Number(e.amount) || 0; a.numFmt = MONEY_FMT
    r.getCell(9).value = e.invoiceRef || 'unbilled'
    r.commit()
    wr += 1
  }

  // ── Download ────────────────────────────────────────────────────
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `rivetdog-report-${period.from}-to-${period.to}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}
