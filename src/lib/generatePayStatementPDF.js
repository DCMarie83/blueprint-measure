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

function fmtDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

function sanitizeFilename(str) {
  return str.replace(/[^a-zA-Z0-9_\- ]/g, '').replace(/\s+/g, '_')
}

/**
 * Generate a branded per-worker pay statement PDF.
 *
 * @param {Object} opts
 * @param {Object} opts.worker - { id, name, rate }
 * @param {Object} opts.period - { from, to }
 * @param {Array}  opts.entries - [{ work_date, jobName, hours, cost_rate }]
 * @param {Array}  opts.byJob - [{ jobName, hours, pay }]
 * @param {number} opts.totalHours
 * @param {number} opts.totalPay
 * @param {Object} opts.company - { name, primary_color, logo_data, address_line1, address_line2, city, state, zip, business_phone }
 * @param {'blob'|'base64'|'save'} opts.returnAs
 */
export function generatePayStatementPDF({ worker, period, entries, byJob, totalHours, totalPay, company, returnAs = 'blob' }) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 20

  const companyName = company?.name || 'Company'
  const primaryHex = normalizedPrimary(company?.primary_color)
  const primaryRgb = hexToRgb(primaryHex) ?? FALLBACK_PRIMARY

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

  // Right: PAY STATEMENT label
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...primaryRgb)
  doc.text('PAY STATEMENT', pageWidth - margin, y + 4, { align: 'right' })

  y += 16

  // Company address block
  const addrParts = [
    company?.address_line1,
    company?.address_line2,
    [company?.city, company?.state, company?.zip].filter(Boolean).join(', '),
    company?.business_phone,
  ].filter(Boolean)
  if (addrParts.length > 0) {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...MUTED)
    for (const line of addrParts) {
      doc.text(line, margin, y)
      y += 4
    }
    y += 2
  }

  // Period line
  doc.setFontSize(10)
  doc.setTextColor(...MUTED)
  doc.text(`Period: ${fmtDate(period.from)} – ${fmtDate(period.to)}`, margin, y)
  y += 8

  // Divider
  doc.setDrawColor(...MUTED)
  doc.setLineWidth(0.3)
  doc.line(margin, y, pageWidth - margin, y)
  y += 8

  // ── Worker block ─────────────────────────────────────────
  doc.setFontSize(10)
  doc.setTextColor(...MUTED)
  doc.text('WORKER:', margin, y)
  doc.setTextColor(...DARK)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text(worker.name, margin + 20, y)
  y += 10

  // ── Summary box ──────────────────────────────────────────
  doc.setFillColor(245, 245, 245)
  doc.roundedRect(margin, y, pageWidth - margin * 2, 18, 2, 2, 'F')

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...MUTED)
  const colW = (pageWidth - margin * 2) / 3
  doc.text('Total Hours', margin + 6, y + 7)
  doc.text('Rate', margin + colW + 6, y + 7)
  doc.text('Gross Pay', margin + colW * 2 + 6, y + 7)

  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...DARK)
  doc.setFontSize(12)
  doc.text(totalHours.toFixed(2), margin + 6, y + 14)
  doc.text(fmtMoney(worker.rate) + '/hr', margin + colW + 6, y + 14)
  doc.text(fmtMoney(totalPay), margin + colW * 2 + 6, y + 14)

  y += 26

  // ── By Job table ─────────────────────────────────────────
  if (byJob.length > 0) {
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...primaryRgb)
    doc.text('BY JOB', margin, y)
    y += 4

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [['Job', 'Hours', 'Pay']],
      body: byJob.map(j => [j.jobName, j.hours.toFixed(2), fmtMoney(j.pay)]),
      foot: [['Total', totalHours.toFixed(2), fmtMoney(totalPay)]],
      theme: 'grid',
      headStyles: { fillColor: DARK, textColor: WHITE, fontStyle: 'bold', fontSize: 9 },
      footStyles: { fillColor: DARK, textColor: WHITE, fontStyle: 'bold', fontSize: 9 },
      styles: { fontSize: 9, textColor: DARK, cellPadding: { top: 2.5, bottom: 2.5, left: 4, right: 4 } },
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { halign: 'right', cellWidth: 26 },
        2: { halign: 'right', cellWidth: 30 },
      },
      alternateRowStyles: { fillColor: STRIPE },
    })

    y = doc.lastAutoTable.finalY + 8
  }

  // ── Detail table ─────────────────────────────────────────
  if (entries.length > 0) {
    if (y > pageHeight - 40) { doc.addPage(); y = margin }

    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...primaryRgb)
    doc.text('DETAIL', margin, y)
    y += 4

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [['Date', 'Job', 'Hours', 'Rate', 'Pay']],
      body: entries.map(e => [
        e.work_date,
        e.jobName,
        e.hours.toFixed(2),
        fmtMoney(e.cost_rate) + '/hr',
        fmtMoney(e.hours * e.cost_rate),
      ]),
      foot: [['', 'Total', totalHours.toFixed(2), '', fmtMoney(totalPay)]],
      theme: 'grid',
      headStyles: { fillColor: DARK, textColor: WHITE, fontStyle: 'bold', fontSize: 9 },
      footStyles: { fillColor: DARK, textColor: WHITE, fontStyle: 'bold', fontSize: 9 },
      styles: { fontSize: 9, textColor: DARK, cellPadding: { top: 2.5, bottom: 2.5, left: 4, right: 4 } },
      columnStyles: {
        0: { cellWidth: 28 },
        1: { cellWidth: 'auto' },
        2: { halign: 'right', cellWidth: 20 },
        3: { halign: 'right', cellWidth: 26 },
        4: { halign: 'right', cellWidth: 28 },
      },
      alternateRowStyles: { fillColor: STRIPE },
    })

    y = doc.lastAutoTable.finalY + 6
  }

  // ── Gross pay pill ───────────────────────────────────────
  y += 2
  if (y > pageHeight - 30) { doc.addPage(); y = margin }
  doc.setFillColor(...primaryRgb)
  doc.roundedRect(pageWidth - margin - 80, y, 80, 14, 2, 2, 'F')
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...WHITE)
  doc.text('GROSS PAY', pageWidth - margin - 76, y + 9)
  doc.text(fmtMoney(totalPay), pageWidth - margin - 4, y + 9, { align: 'right' })

  // ── Footer ───────────────────────────────────────────────
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...MUTED)
  doc.text(companyName, margin, pageHeight - 12)
  doc.text(`${worker.name} — ${period.from} to ${period.to}`, pageWidth - margin, pageHeight - 12, { align: 'right' })

  // ── Output ───────────────────────────────────────────────
  const filename = `PayStatement_${sanitizeFilename(worker.name)}_${period.from}_to_${period.to}.pdf`

  if (returnAs === 'save') { doc.save(filename); return }
  if (returnAs === 'base64') return doc.output('datauristring').split(',')[1]
  return doc.output('blob')
}
