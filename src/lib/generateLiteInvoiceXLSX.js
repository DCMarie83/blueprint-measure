// Branded .xlsx for a single Lite invoice. Mirrors the ExcelJS branding pattern
// in utils/xlsxExport.js (logo embed, dark header band, frozen header, REAL
// numeric cells) but is scoped to one invoice's line items + totals so the
// takeoff exporter stays untouched. Money surfaces stay pun-free.

const SUPPORTED_MIME = { 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/gif': 'gif' }
const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B2426' } }
const HEADER_FONT = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }

const UNIT_LABELS = { sf: 'SF', lf: 'LF', each: 'Each', hour: 'Hour', lump_sum: 'Lump Sum' }

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

function sanitize(str) {
  return String(str || '').replace(/[^a-zA-Z0-9_\- ]/g, '').replace(/\s+/g, '_')
}

function fmtDate(d) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

/**
 * Build + download a branded XLSX for one Lite invoice.
 * @param {Object} opts
 * @param {Object} opts.invoice   invoices row
 * @param {Array}  opts.lineItems invoice_line_items rows
 * @param {Object} opts.client    GC client row ({ display_name, business_name })
 * @param {Object} opts.company   { name, logo_url }
 */
export async function generateLiteInvoiceXLSX({ invoice, lineItems, client, company }) {
  const ExcelJS = (await import('exceljs')).default
  const workbook = new ExcelJS.Workbook()
  const ws = workbook.addWorksheet('Invoice')

  const headers = ['Date', 'Description', 'Unit', 'Qty/Hrs', 'Rate', 'Amount']
  ws.columns = [
    { width: 14 }, { width: 40 }, { width: 10 }, { width: 12 }, { width: 14 }, { width: 16 },
  ]

  let currentRow = 1

  // ── Branding block ──────────────────────────────────────────────
  const logoTargetHeight = 40
  const logo = company?.logo_url ? await fetchLogoBuffer(company.logo_url) : null
  if (logo) {
    const dims = await loadImageDimensions(company.logo_url)
    if (dims && dims.height > 0) {
      const aspect = dims.width / dims.height
      const pxWidth = Math.round(logoTargetHeight * aspect)
      const imageId = workbook.addImage({ buffer: logo.buffer, extension: logo.extension })
      ws.addImage(imageId, { tl: { col: 0, row: 0 }, ext: { width: pxWidth, height: logoTargetHeight } })
    }
  }

  const nameCell = ws.getCell(currentRow, 1)
  nameCell.value = company?.name || 'Invoice'
  nameCell.font = { bold: true, size: 16 }
  currentRow += 1

  const gcName = client?.business_name
    ? `${client.display_name || 'Client'} / ${client.business_name}`
    : (client?.display_name || 'Client')
  const metaCell = ws.getCell(currentRow, 1)
  metaCell.value = `${invoice.invoice_number}  ·  ${gcName}  ·  Issued ${fmtDate(invoice.created_at)}${invoice.due_date ? `  ·  Due ${fmtDate(invoice.due_date)}` : ''}`
  metaCell.font = { size: 10, italic: true, color: { argb: 'FF666666' } }
  currentRow += 1

  currentRow += 1 // spacer

  // ── Header row ──────────────────────────────────────────────────
  const headerRowNum = currentRow
  const headerRow = ws.getRow(headerRowNum)
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1)
    cell.value = h
    cell.font = HEADER_FONT
    cell.fill = HEADER_FILL
    cell.alignment = { vertical: 'middle' }
  })
  headerRow.commit()
  currentRow += 1

  ws.views = [{ state: 'frozen', ySplit: headerRowNum, xSplit: 0 }]

  // ── Data rows — real numeric cells for Qty/Rate/Amount ──────────
  const sorted = [...lineItems].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  sorted.forEach(li => {
    const r = ws.getRow(currentRow)
    // Date is parsed off the "… - YYYY-MM-DD" suffix when present, else blank.
    const m = /(\d{4}-\d{2}-\d{2})\s*$/.exec(li.description || '')
    r.getCell(1).value = m ? m[1] : ''
    r.getCell(2).value = m ? (li.description || '').slice(0, m.index).replace(/\s*-\s*$/, '') : (li.description || '')
    r.getCell(3).value = UNIT_LABELS[li.unit] || li.unit || ''
    const qtyCell = r.getCell(4); qtyCell.value = Number(li.quantity) || 0; qtyCell.numFmt = '0.00'
    const rateCell = r.getCell(5); rateCell.value = Number(li.unit_rate) || 0; rateCell.numFmt = '$#,##0.00'
    const amtCell = r.getCell(6); amtCell.value = Number(li.total) || 0; amtCell.numFmt = '$#,##0.00'
    r.commit()
    currentRow += 1
  })

  // ── Totals ──────────────────────────────────────────────────────
  currentRow += 1
  const subtotalRow = ws.getRow(currentRow)
  subtotalRow.getCell(5).value = 'Subtotal'
  subtotalRow.getCell(5).font = { bold: true }
  const subCell = subtotalRow.getCell(6)
  subCell.value = Number(invoice.subtotal) || 0
  subCell.numFmt = '$#,##0.00'
  subtotalRow.commit()
  currentRow += 1

  if (Number(invoice.adjustment_amount) !== 0) {
    const adjRow = ws.getRow(currentRow)
    adjRow.getCell(5).value = invoice.adjustment_label || 'Adjustment'
    const adjCell = adjRow.getCell(6)
    adjCell.value = Number(invoice.adjustment_amount) || 0
    adjCell.numFmt = '$#,##0.00'
    adjRow.commit()
    currentRow += 1
  }

  const totalRow = ws.getRow(currentRow)
  totalRow.getCell(5).value = 'Total'
  totalRow.getCell(5).font = { bold: true, size: 12 }
  const totCell = totalRow.getCell(6)
  totCell.value = Number(invoice.total) || 0
  totCell.numFmt = '$#,##0.00'
  totCell.font = { bold: true, size: 12 }
  totalRow.commit()

  // ── Download ────────────────────────────────────────────────────
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${sanitize(invoice.invoice_number)}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}
