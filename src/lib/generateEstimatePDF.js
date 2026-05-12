import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

const ORANGE = [242, 114, 67]   // #f27243
const DARK = [27, 36, 38]       // #1b2426
const MUTED = [138, 144, 150]   // #8a9096
const WHITE = [255, 255, 255]
const STRIPE = [245, 245, 245]

const VARIANTS = [
  { key: 'good', label: 'GOOD', rateField: 'rate_good', totalField: 'total_good', grandTotal: 'good_total' },
  { key: 'better', label: 'BETTER', rateField: 'rate_better', totalField: 'total_better', grandTotal: 'better_total' },
  { key: 'best', label: 'BEST', rateField: 'rate_best', totalField: 'total_best', grandTotal: 'best_total' },
]

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

/**
 * Generate a branded estimate PDF.
 *
 * @param {Object} opts
 * @param {Object} opts.estimate - Estimate row
 * @param {Array}  opts.lineItems - estimate_line_items rows
 * @param {Object} opts.project - { name, address }
 * @param {Object} opts.client - { display_name, business_name, address } (nullable)
 * @param {Object} opts.company - { name } (nullable)
 * @param {'good'|'better'|'best'|null} opts.variant - Single variant (Send flow) or null for all 3 (Download flow)
 * @param {'blob'|'base64'|'save'} opts.returnAs - Output format
 * @returns {Blob|string|void}
 */
export function generateEstimatePDF({ estimate, lineItems, project, client, company, variant = null, returnAs = 'blob' }) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 20

  const companyName = company?.name || 'Your Contractor'
  const estTitle = estimate.title || estimate.estimate_number
  const estNumber = estimate.estimate_number

  // Determine which variants to render
  const variantsToRender = variant
    ? VARIANTS.filter(v => v.key === variant)
    : VARIANTS
  const totalPages = variantsToRender.length
  const isSingleVariant = totalPages === 1

  variantsToRender.forEach((v, vi) => {
    if (vi > 0) doc.addPage()

    let y = margin

    // ── Header band ──────────────────────────────────────────
    // TODO: Add company logo when companies.logo_url is available
    doc.setFontSize(22)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...DARK)
    doc.text(companyName, margin, y + 7)

    // Right-aligned: title or estimate number
    doc.setFontSize(13)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...MUTED)
    doc.text(estTitle, pageWidth - margin, y + 4, { align: 'right' })

    // Always show estimate number below title if title exists
    if (estimate.title) {
      doc.setFontSize(10)
      doc.text(estNumber, pageWidth - margin, y + 10, { align: 'right' })
    }

    y += 16

    // Date line
    doc.setFontSize(10)
    doc.setTextColor(...MUTED)
    const dateParts = [`Issued: ${fmtDate(estimate.created_at)}`]
    if (estimate.expires_at) dateParts.push(`Expires: ${fmtDate(estimate.expires_at)}`)
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
    doc.text('TO:', margin, y)
    doc.setTextColor(...DARK)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    const clientName = client?.display_name || 'Client'
    const clientLine = client?.business_name ? `${clientName} / ${client.business_name}` : clientName
    doc.text(clientLine, margin + 12, y)
    y += 5

    // TODO: Add client address when consistently available
    if (client?.address) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      doc.setTextColor(...MUTED)
      doc.text(client.address, margin + 12, y)
      y += 5
    }

    // Project
    doc.setFontSize(10)
    doc.setTextColor(...MUTED)
    doc.setFont('helvetica', 'normal')
    y += 3
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
    y += 6

    // ── Variant title ────────────────────────────────────────
    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...ORANGE)
    const pageHeading = isSingleVariant
      ? (estimate.title || 'Project Estimate')
      : v.label
    doc.text(pageHeading, pageWidth / 2, y, { align: 'center' })
    y += 10

    // ── Line items table ─────────────────────────────────────
    const groups = {}
    const catOrder = []
    for (const li of lineItems) {
      const cat = li.category_name || 'General'
      if (!groups[cat]) { groups[cat] = []; catOrder.push(cat) }
      groups[cat].push(li)
    }

    const tableBody = []
    for (const cat of catOrder) {
      tableBody.push([{
        content: cat,
        colSpan: 5,
        styles: {
          fontStyle: 'bold',
          fillColor: [240, 240, 240],
          textColor: ORANGE,
          fontSize: 9,
          cellPadding: { top: 3, bottom: 3, left: 4, right: 4 },
        },
      }])
      for (const li of groups[cat]) {
        tableBody.push([
          li.description || '',
          Number(li.quantity || 0).toLocaleString('en-US', { maximumFractionDigits: 2 }),
          UNIT_LABELS[li.unit] || li.unit || '',
          fmtMoney(li[v.rateField]),
          fmtMoney(li[v.totalField]),
        ])
      }
    }

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [['Description', 'Qty', 'Unit', 'Rate', 'Total']],
      body: tableBody,
      theme: 'grid',
      headStyles: {
        fillColor: DARK,
        textColor: WHITE,
        fontStyle: 'bold',
        fontSize: 9,
      },
      styles: {
        fontSize: 9,
        textColor: DARK,
        cellPadding: { top: 2.5, bottom: 2.5, left: 4, right: 4 },
      },
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { halign: 'right', cellWidth: 22 },
        2: { halign: 'center', cellWidth: 18 },
        3: { halign: 'right', cellWidth: 25 },
        4: { halign: 'right', cellWidth: 28 },
      },
      alternateRowStyles: { fillColor: STRIPE },
    })

    y = doc.lastAutoTable.finalY + 6

    // ── Subtotal line + prominent total ──────────────────────
    // Compute total from estimate or from line items as fallback
    let grandTotalNum = Number(estimate[v.grandTotal]) || 0
    if (!grandTotalNum && lineItems.length > 0) {
      grandTotalNum = lineItems.reduce((sum, li) => sum + (Number(li[v.totalField]) || 0), 0)
    }
    const grandTotalStr = fmtMoney(grandTotalNum)

    // Separator line
    doc.setDrawColor(200, 200, 200)
    doc.setLineWidth(0.3)
    doc.line(pageWidth - margin - 80, y, pageWidth - margin, y)
    y += 4

    // Subtotal label + value
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...MUTED)
    doc.text('Subtotal', pageWidth - margin - 80, y + 4)

    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...DARK)
    doc.text(grandTotalStr, pageWidth - margin, y + 4, { align: 'right' })
    y += 10

    // Dark pill with variant total
    doc.setFillColor(...DARK)
    doc.roundedRect(pageWidth - margin - 80, y, 80, 14, 2, 2, 'F')
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...WHITE)
    const totalPillLabel = isSingleVariant ? 'TOTAL' : `${v.label} TOTAL`
    doc.text(totalPillLabel, pageWidth - margin - 76, y + 9)
    doc.text(grandTotalStr, pageWidth - margin - 4, y + 9, { align: 'right' })
    y += 22

    // ── Notes ────────────────────────────────────────────────
    if (estimate.notes) {
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...DARK)
      doc.text('Notes', margin, y)
      y += 5
      doc.setFont('helvetica', 'italic')
      doc.setFontSize(9)
      doc.setTextColor(...MUTED)
      const noteLines = doc.splitTextToSize(estimate.notes, pageWidth - margin * 2)
      doc.text(noteLines, margin, y)
      y += noteLines.length * 4.5
    }

    // ── Footer ───────────────────────────────────────────────
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...MUTED)
    // TODO: Add company address when companies.address is available
    doc.text(companyName, margin, pageHeight - 12)
    doc.text(`${estNumber}  |  Page ${vi + 1} of ${totalPages}`, pageWidth - margin, pageHeight - 12, { align: 'right' })
  })

  // ── Output ─────────────────────────────────────────────────
  const filename = `${sanitizeFilename(estTitle)}_${sanitizeFilename(estNumber)}${client?.display_name ? '_' + sanitizeFilename(client.display_name) : ''}.pdf`

  if (returnAs === 'save') {
    doc.save(filename)
    return
  }
  if (returnAs === 'base64') {
    return doc.output('datauristring').split(',')[1]
  }
  // default: blob
  return doc.output('blob')
}
