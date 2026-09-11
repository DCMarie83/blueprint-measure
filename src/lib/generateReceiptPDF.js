import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { hexToRgb, normalizedPrimary, brandBand } from '../utils/colorUtils'
import { drawLogo } from './logoImage'

const DARK = [27, 36, 38]
const WHITE = [255, 255, 255]
const GREEN = [22, 163, 74]

function fmtMoney(val) {
  return `$${(Number(val) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtDate(d) {
  if (!d) return ''
  const iso = String(d)
  const date = iso.length === 10 ? new Date(iso + 'T00:00:00') : new Date(iso)
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

// Branded receipt for a paid-in-full invoice: payments table, total paid,
// PAID IN FULL with the paid date, balance zero. Same brand treatment as the
// invoice PDF (logo when supplied via loadLogo, tenant primary color).
export function generateReceiptPDF({ invoice, payments = [], project, client, company, returnAs = 'blob' }) {
  const doc = new jsPDF({ unit: 'mm', format: 'letter' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 18
  const primaryRgb = hexToRgb(normalizedPrimary(company?.primary_color)) || [242, 114, 67]
  const band = brandBand(company?.primary_color)
  let y = margin

  if (company?.logo) {
    try {
      const { h } = drawLogo(doc, company.logo, { x: margin, y, maxW: 34, maxH: 14 })
      if (h > 0) y += 18
    } catch { /* logo optional */ }
  }

  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...primaryRgb)
  doc.text(company?.name || '', margin, y)
  y += 10

  doc.setFontSize(20)
  doc.setTextColor(...DARK)
  doc.text('RECEIPT', margin, y)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.text(`Invoice ${invoice?.invoice_number || ''}`, pageWidth - margin, y, { align: 'right' })
  y += 8

  doc.setFontSize(10)
  doc.setTextColor(...DARK)
  const clientName = client?.business_name || client?.display_name
  if (clientName) { doc.text(`Billed to: ${clientName}`, margin, y); y += 5 }
  if (project?.name) { doc.text(`Project: ${project.name}`, margin, y); y += 5 }
  if (project?.address) { doc.text(project.address, margin, y); y += 5 }
  y += 4

  const rows = (payments.length > 0 ? payments : []).map(p => [
    p.payment_date ? fmtDate(p.payment_date) : '',
    (p.payment_method || '').replace(/_/g, ' '),
    p.reference_number || '',
    fmtMoney(p.amount),
  ])
  if (rows.length === 0 && invoice?.paid_amount) {
    // Portal fallback when the ledger rows are not exposed: one summary line.
    rows.push([invoice.paid_at ? fmtDate(invoice.paid_at) : '', '', '', fmtMoney(invoice.paid_amount)])
  }

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Date', 'Method', 'Reference', 'Amount']],
    body: rows,
    theme: 'grid',
    headStyles: { fillColor: band.fill, textColor: band.text, fontStyle: 'bold', fontSize: 9 },
    styles: { fontSize: 9, textColor: DARK, cellPadding: { top: 2.5, bottom: 2.5, left: 4, right: 4 } },
    columnStyles: { 3: { halign: 'right' } },
  })
  y = doc.lastAutoTable.finalY + 8

  const totalPaid = payments.length > 0
    ? Math.round(payments.reduce((s, p) => s + (Number(p.amount) || 0), 0) * 100) / 100
    : Number(invoice?.paid_amount) || 0

  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...DARK)
  doc.text('Total paid', pageWidth - margin - 60, y)
  doc.text(fmtMoney(totalPaid), pageWidth - margin, y, { align: 'right' })
  y += 8

  doc.setFillColor(...GREEN)
  doc.roundedRect(margin, y, pageWidth - margin * 2, 14, 2, 2, 'F')
  doc.setTextColor(...WHITE)
  doc.setFontSize(11)
  doc.text(`PAID IN FULL${invoice?.paid_at ? ` on ${fmtDate(invoice.paid_at)}` : ''}`, margin + 5, y + 9)
  doc.text('Balance: $0.00', pageWidth - margin - 5, y + 9, { align: 'right' })
  y += 22

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(120, 120, 120)
  doc.text(`Thank you for your business.`, margin, y)

  if (returnAs === 'base64') return doc.output('datauristring').split(',')[1]
  return doc.output('blob')
}
