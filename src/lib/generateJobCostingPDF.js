import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { hexToRgb, normalizedPrimary } from '../utils/colorUtils'

const DARK = [27, 36, 38]
const MUTED = [138, 144, 150]
const WHITE = [255, 255, 255]
const STRIPE = [245, 245, 245]
const FALLBACK_PRIMARY = [242, 114, 67]

function fmtMoney(val) {
  if (val == null) return '$0.00'
  return `$${Number(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtPct(val) {
  if (val == null) return '-'
  return `${val >= 0 ? '+' : ''}${val.toFixed(1)}%`
}

function fmtDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

function sanitizeFilename(str) {
  return str.replace(/[^a-zA-Z0-9_\- ]/g, '').replace(/\s+/g, '_')
}

/**
 * Generate a branded Job Costing PDF (landscape).
 *
 * @param {Object} opts
 * @param {Array}  opts.rows - getJobCostingRows output
 * @param {Object} opts.totals - { quoted, billed, collected, totalCost }
 * @param {Object} opts.period - { from, to }
 * @param {Object} opts.company - { name, primary_color, logo_data }
 * @param {'blob'|'base64'|'save'} opts.returnAs
 */
export function generateJobCostingPDF({ rows, totals, period, company, returnAs = 'blob' }) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 15

  const companyName = company?.name || 'Company'
  const primaryHex = normalizedPrimary(company?.primary_color)
  const primaryRgb = hexToRgb(primaryHex) ?? FALLBACK_PRIMARY

  let y = margin

  // ── Header ───────────────────────────────────────────────
  let logoRendered = false
  if (company?.logo_data) {
    try {
      const logoH = 12
      const logoW = logoH * 3
      const fmtMatch = company.logo_data.match(/^data:image\/(\w+);/)
      const fmt = fmtMatch ? fmtMatch[1].toUpperCase() : 'PNG'
      if (fmt !== 'SVG' && fmt !== 'SVG+XML') {
        doc.addImage(company.logo_data, fmt, margin, y - 2, logoW, logoH)
        logoRendered = true
      }
    } catch { /* fall through */ }
  }

  if (!logoRendered) {
    doc.setFontSize(18)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...DARK)
    doc.text(companyName, margin, y + 6)
  }

  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...primaryRgb)
  doc.text('JOB COSTING REPORT', pageWidth - margin, y + 4, { align: 'right' })

  y += 14

  doc.setFontSize(10)
  doc.setTextColor(...MUTED)
  doc.text(`${fmtDate(period.from)} – ${fmtDate(period.to)}`, margin, y)
  y += 6

  // Divider
  doc.setDrawColor(...MUTED)
  doc.setLineWidth(0.3)
  doc.line(margin, y, pageWidth - margin, y)
  y += 6

  // ── Summary block ────────────────────────────────────────
  // Locked spec: actual margin percent over billed; cash position is a value
  // with no percentage; blocked sides render a plain dash.
  const anyCostData = rows.some(r => r.hasCostData)
  const actualBlocked = totals.billed <= 0 || !anyCostData
  const blendedPct = actualBlocked ? null : ((totals.billed - totals.totalCost) / totals.billed) * 100
  const cashBlocked = totals.collected <= 0 || !anyCostData

  doc.setFillColor(245, 245, 245)
  doc.roundedRect(margin, y, pageWidth - margin * 2, 14, 2, 2, 'F')

  const summaryItems = [
    { label: 'Quoted', value: fmtMoney(totals.quoted) },
    { label: 'Billed', value: fmtMoney(totals.billed) },
    { label: 'Collected', value: fmtMoney(totals.collected) },
    { label: 'Total Cost', value: fmtMoney(totals.totalCost) },
    { label: 'Actual Margin', value: blendedPct != null ? fmtPct(blendedPct) : '-' },
    { label: 'Cash Position', value: cashBlocked ? '-' : fmtMoney(totals.collected - totals.totalCost) },
  ]
  const colW = (pageWidth - margin * 2) / summaryItems.length
  summaryItems.forEach((s, i) => {
    const x = margin + colW * i + 4
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...MUTED)
    doc.text(s.label, x, y + 5)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...DARK)
    doc.text(s.value, x, y + 11)
  })

  y += 20

  // ── Main table ───────────────────────────────────────────
  const tableBody = rows.map(r => {
    const estBlocked = r.quoted <= 0 || !r.hasCostData
    const actBlocked = r.billed <= 0 || !r.hasCostData
    const rowCashBlocked = r.collected <= 0 || !r.hasCostData
    return [
      r.project_name,
      r.client_name,
      fmtMoney(r.quoted),
      fmtMoney(r.billed),
      fmtMoney(r.collected),
      fmtMoney(r.totalCost) + (r.hasIncompleteData ? ' *' : ''),
      estBlocked ? '-' : `${fmtMoney(r.estimatedMargin)} ${fmtPct(r.estimatedMarginPct)}`,
      actBlocked ? '-' : `${fmtMoney(r.actualMargin)} ${fmtPct(r.actualMarginPct)}`,
      rowCashBlocked ? '-' : fmtMoney(r.cashPosition),
    ]
  })

  const tableFoot = [[
    `Total (${rows.length} jobs)`, '',
    fmtMoney(totals.quoted),
    fmtMoney(totals.billed),
    fmtMoney(totals.collected),
    fmtMoney(totals.totalCost),
    '',
    actualBlocked ? '-' : `${fmtMoney(totals.billed - totals.totalCost)} ${fmtPct(blendedPct)}`,
    cashBlocked ? '-' : fmtMoney(totals.collected - totals.totalCost),
  ]]

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Job', 'Client', 'Quoted', 'Billed', 'Collected', 'Cost', 'Est. Margin', 'Actual Margin', 'Cash Position']],
    body: tableBody,
    foot: tableFoot,
    theme: 'grid',
    headStyles: { fillColor: DARK, textColor: WHITE, fontStyle: 'bold', fontSize: 8 },
    footStyles: { fillColor: DARK, textColor: WHITE, fontStyle: 'bold', fontSize: 8 },
    styles: { fontSize: 8, textColor: DARK, cellPadding: { top: 2, bottom: 2, left: 3, right: 3 } },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 28 },
      2: { halign: 'right', cellWidth: 22 },
      3: { halign: 'right', cellWidth: 22 },
      4: { halign: 'right', cellWidth: 22 },
      5: { halign: 'right', cellWidth: 24 },
      6: { halign: 'right', cellWidth: 30 },
      7: { halign: 'right', cellWidth: 30 },
      8: { halign: 'right', cellWidth: 26 },
    },
    alternateRowStyles: { fillColor: STRIPE },
  })

  y = doc.lastAutoTable.finalY + 6

  // Incomplete data note
  if (rows.some(r => r.hasIncompleteData)) {
    doc.setFontSize(7)
    doc.setFont('helvetica', 'italic')
    doc.setTextColor(...MUTED)
    doc.text('* Cost may be understated: missing labor rate, material variant, or accepted estimate.', margin, y)
  }

  // ── Footer ───────────────────────────────────────────────
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...MUTED)
  doc.text(companyName, margin, pageHeight - 8)
  doc.text(`Job Costing ${period.from} to ${period.to}`, pageWidth - margin, pageHeight - 8, { align: 'right' })

  // ── Output ───────────────────────────────────────────────
  const filename = `JobCosting_${sanitizeFilename(period.from)}_to_${sanitizeFilename(period.to)}.pdf`

  if (returnAs === 'save') { doc.save(filename); return }
  if (returnAs === 'base64') return doc.output('datauristring').split(',')[1]
  return doc.output('blob')
}
