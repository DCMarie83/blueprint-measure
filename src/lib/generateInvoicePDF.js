import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { hexToRgb, normalizedPrimary } from '../utils/colorUtils'
import { formatTimeOnly } from './effectiveTime'

const DARK = [27, 36, 38]
const MUTED = [138, 144, 150]
const WHITE = [255, 255, 255]
const STRIPE = [245, 245, 245]
const FALLBACK_PRIMARY = [242, 114, 67]

const UNIT_LABELS = { sf: 'SF', lf: 'LF', each: 'Each', hour: 'Hour', lump_sum: 'Lump Sum' }

function fmtMoney(val) {
  if (val == null) return '$0.00'
  return `$${Number(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

function sanitizeFilename(str) {
  return str.replace(/[^a-zA-Z0-9_\- ]/g, '').replace(/\s+/g, '_')
}

const PI_ORDER = ['check', 'zelle', 'venmo', 'cashapp', 'ach', 'card_external', 'other']

function renderPaymentInstructions(doc, pi, x, y, primaryRgb, pageWidth, pageHeight, margin, heading = 'Payment Methods') {
  if (!pi) return y
  const enabled = PI_ORDER.filter(k => pi[k]?.enabled)
  if (enabled.length === 0) return y

  if (y > pageHeight - 60) { doc.addPage(); y = margin }

  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...primaryRgb)
  doc.text(heading.toUpperCase(), x, y)
  y += 6

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...DARK)

  for (const k of enabled) {
    const d = pi[k]
    let line = ''
    if (k === 'check') line = `Check — Payable to: ${d.payable_to || ''}${d.mailing_address ? `  |  Mail to: ${d.mailing_address.replace(/\n/g, ', ')}` : ''}`
    else if (k === 'zelle') line = `Zelle: ${d.handle || ''}`
    else if (k === 'venmo') line = `Venmo: @${d.handle || ''}`
    else if (k === 'cashapp') line = `Cash App: $${d.handle || ''}`
    else if (k === 'ach') line = `ACH/Wire: ${(d.instructions || '').replace(/\n/g, ', ')}`
    else if (k === 'card_external') line = `${d.label || 'Pay with Card'}: ${d.url || ''}`
    else if (k === 'other') line = (d.instructions || '').replace(/\n/g, ', ')

    if (line) {
      const lines = doc.splitTextToSize(line, pageWidth - margin * 2)
      doc.text(lines, x, y)
      y += lines.length * 4 + 2
    }
  }
  return y + 4
}

/**
 * Generate a branded invoice PDF.
 *
 * @param {Object} opts
 * @param {Object} opts.invoice - Invoice row
 * @param {Array}  opts.lineItems - invoice_line_items rows
 * @param {Object} opts.project - { name, address }
 * @param {Object} opts.client - { display_name, business_name } (nullable)
 * @param {Object} opts.company - { name, primary_color, logo_data } (nullable)
 * @param {Array}  [opts.timeDetail] - closed clock punches backing this invoice:
 *   { work_date, clock_in_at, clock_out_at, hours }. When non-empty a "Time
 *   detail" section renders after the totals. Never carries geo.
 * @param {string} [opts.timeZone] - sub's effective zone for the in/out times.
 * @param {'blob'|'base64'|'save'} opts.returnAs - Output format
 * @returns {Blob|string|void}
 */
export function generateInvoicePDF({ invoice, lineItems, project, client, company, timeDetail = [], timeZone, returnAs = 'blob' }) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 20

  const companyName = company?.name || 'Your Contractor'
  const primaryHex = normalizedPrimary(company?.primary_color)
  const primaryRgb = hexToRgb(primaryHex) ?? FALLBACK_PRIMARY
  const invTitle = invoice.title || 'Invoice'
  const invNumber = invoice.invoice_number

  let y = margin

  // ── Header band ──────────────────────────────────────────
  let logoRendered = false
  if (company?.logo_data) {
    try {
      const logoH = 14
      const logoW = logoH * 3
      const fmtMatch = company.logo_data.match(/^data:image\/(\w+);/)
      const fmt = fmtMatch ? fmtMatch[1].toUpperCase() : 'PNG'
      if (fmt !== 'SVG' && fmt !== 'SVG+XML') {
        doc.addImage(company.logo_data, fmt, margin, y - 2, logoW, logoH)
        logoRendered = true
      }
    } catch { /* fall through to text */ }
  }

  if (!logoRendered) {
    doc.setFontSize(22)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...DARK)
    doc.text(companyName, margin, y + 7)
  }

  // Right: INVOICE label + number
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...primaryRgb)
  doc.text('INVOICE', pageWidth - margin, y + 4, { align: 'right' })
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...MUTED)
  doc.text(invNumber, pageWidth - margin, y + 10, { align: 'right' })

  y += 16

  // Date line
  doc.setFontSize(10)
  doc.setTextColor(...MUTED)
  const dateParts = [`Issued: ${fmtDate(invoice.created_at)}`]
  if (invoice.due_date) dateParts.push(`Due: ${fmtDate(invoice.due_date)}`)
  doc.text(dateParts.join('   |   '), margin, y)
  y += 8

  // Divider
  doc.setDrawColor(...MUTED)
  doc.setLineWidth(0.3)
  doc.line(margin, y, pageWidth - margin, y)
  y += 8

  // ── Client / Project block ───────────────────────────────
  doc.setFontSize(10)
  doc.setTextColor(...MUTED)
  doc.text('BILL TO:', margin, y)
  doc.setTextColor(...DARK)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  const clientName = client?.display_name || 'Client'
  const clientLine = client?.business_name ? `${clientName} / ${client.business_name}` : clientName
  doc.text(clientLine, margin + 18, y)
  y += 8

  doc.setFontSize(10)
  doc.setTextColor(...MUTED)
  doc.setFont('helvetica', 'normal')
  doc.text('PROJECT:', margin, y)
  doc.setTextColor(...DARK)
  doc.setFont('helvetica', 'bold')
  doc.text(project?.name || 'Untitled Project', margin + 22, y)
  y += 5

  if (project?.address) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(...MUTED)
    doc.text(project.address, margin + 22, y)
    y += 5
  }
  y += 8

  // ── Title ────────────────────────────────────────────────
  if (invoice.title) {
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...primaryRgb)
    doc.text(invTitle, pageWidth / 2, y, { align: 'center' })
    y += 8
  }

  // ── Line items table ─────────────────────────────────────
  const tableBody = []
  for (const li of lineItems) {
    tableBody.push([
      li.description || '',
      li.category_name || '',
      Number(li.quantity || 0).toLocaleString('en-US', { maximumFractionDigits: 2 }),
      UNIT_LABELS[li.unit] || li.unit || '',
      fmtMoney(li.unit_rate),
      fmtMoney(li.total),
    ])
  }

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Description', 'Category', 'Qty', 'Unit', 'Rate', 'Total']],
    body: tableBody,
    theme: 'grid',
    headStyles: { fillColor: DARK, textColor: WHITE, fontStyle: 'bold', fontSize: 9 },
    styles: { fontSize: 9, textColor: DARK, cellPadding: { top: 2.5, bottom: 2.5, left: 4, right: 4 } },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 30 },
      2: { halign: 'right', cellWidth: 18 },
      3: { halign: 'center', cellWidth: 16 },
      4: { halign: 'right', cellWidth: 24 },
      5: { halign: 'right', cellWidth: 26 },
    },
    alternateRowStyles: { fillColor: STRIPE },
  })

  y = doc.lastAutoTable.finalY + 6

  // ── Subtotal + Adjustment + Total ────────────────────────
  const subtotalNum = Number(invoice.subtotal) || lineItems.reduce((s, li) => s + (Number(li.total) || 0), 0)
  const adjNum = Number(invoice.adjustment_amount) || 0
  const totalNum = Number(invoice.total) || subtotalNum + adjNum

  doc.setDrawColor(200, 200, 200)
  doc.setLineWidth(0.3)
  doc.line(pageWidth - margin - 80, y, pageWidth - margin, y)
  y += 4

  // Subtotal
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...MUTED)
  doc.text('Subtotal', pageWidth - margin - 80, y + 4)
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...DARK)
  doc.text(fmtMoney(subtotalNum), pageWidth - margin, y + 4, { align: 'right' })
  y += 8

  // Adjustment
  if (adjNum !== 0) {
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...MUTED)
    doc.text(invoice.adjustment_label || (adjNum < 0 ? 'Discount' : 'Adjustment'), pageWidth - margin - 80, y + 4)
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...(adjNum < 0 ? [220, 38, 38] : DARK))
    doc.text(fmtMoney(adjNum), pageWidth - margin, y + 4, { align: 'right' })
    y += 8
  }

  // Total pill
  y += 2
  doc.setFillColor(...primaryRgb)
  doc.roundedRect(pageWidth - margin - 80, y, 80, 14, 2, 2, 'F')
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...WHITE)
  doc.text('TOTAL', pageWidth - margin - 76, y + 9)
  doc.text(fmtMoney(totalNum), pageWidth - margin - 4, y + 9, { align: 'right' })
  y += 22

  // ── Time detail (clocked punches only) ───────────────────
  // Rendered only when this invoice contains punch-backed hourly entries. One
  // row per punch — date, clock in, clock out, hours — in the sub's zone. No geo.
  if (Array.isArray(timeDetail) && timeDetail.length > 0) {
    if (y > pageHeight - 60) { doc.addPage(); y = margin }
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...primaryRgb)
    doc.text('TIME DETAIL', margin, y)
    y += 4

    const timeBody = timeDetail.map(p => [
      fmtDate(p.work_date),
      formatTimeOnly(timeZone, p.clock_in_at),
      formatTimeOnly(timeZone, p.clock_out_at),
      Number(p.hours || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    ])

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [['Date', 'Clock in', 'Clock out', 'Hours']],
      body: timeBody,
      theme: 'grid',
      headStyles: { fillColor: DARK, textColor: WHITE, fontStyle: 'bold', fontSize: 9 },
      styles: { fontSize: 9, textColor: DARK, cellPadding: { top: 2.5, bottom: 2.5, left: 4, right: 4 } },
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { halign: 'right', cellWidth: 30 },
        2: { halign: 'right', cellWidth: 30 },
        3: { halign: 'right', cellWidth: 22 },
      },
      alternateRowStyles: { fillColor: STRIPE },
    })
    y = doc.lastAutoTable.finalY + 8
  }

  // ── Payment instructions ────────────────────────────────
  y = renderPaymentInstructions(doc, company?.payment_instructions, margin, y, primaryRgb, pageWidth, pageHeight, margin)

  // ── Payment info + Notes + Terms ─────────────────────────
  const showDue = invoice.due_date
  const showNotes = invoice.notes && invoice.notes.trim()
  const showTerms = invoice.terms && invoice.terms.trim()

  if (showDue || showNotes || showTerms) {
    y += 4
    if (y > pageHeight - 80) { doc.addPage(); y = margin }

    if (showDue) {
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...DARK)
      doc.text('PAYMENT DUE', margin, y)
      y += 5
      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...primaryRgb)
      doc.text(`Pay by ${fmtDate(invoice.due_date)}`, margin, y)
      y += 8
    }

    if (showNotes) {
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...DARK)
      doc.text('NOTES', margin, y)
      y += 5
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(80, 80, 80)
      const noteLines = doc.splitTextToSize(invoice.notes, pageWidth - margin * 2)
      doc.text(noteLines, margin, y)
      y += noteLines.length * 4.2 + 6
    }

    if (showTerms) {
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...DARK)
      doc.text('TERMS & CONDITIONS', margin, y)
      y += 5
      doc.setFontSize(8.5)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(80, 80, 80)
      const termsLines = doc.splitTextToSize(invoice.terms, pageWidth - margin * 2)
      doc.text(termsLines, margin, y)
      y += termsLines.length * 4 + 4
    }
  }

  // ── Footer ───────────────────────────────────────────────
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...MUTED)
  doc.text(companyName, margin, pageHeight - 12)
  doc.text(invNumber, pageWidth - margin, pageHeight - 12, { align: 'right' })
  // Platform attribution — every client-facing output carries it (white-label
  // removal is Ultra-tier). Centered so it never collides with the edge labels.
  doc.text('Powered by RivetDog', pageWidth / 2, pageHeight - 12, { align: 'center' })

  // ── Output ───────────────────────────────────────────────
  const filename = `${sanitizeFilename(invNumber)}${client?.display_name ? '_' + sanitizeFilename(client.display_name) : ''}.pdf`

  if (returnAs === 'save') { doc.save(filename); return }
  if (returnAs === 'base64') return doc.output('datauristring').split(',')[1]
  return doc.output('blob')
}
