// Shared free-text pagination for the jsPDF generators (estimate, invoice).
//
// Long notes and terms used to reach doc.text() as one wrapped array, which
// jsPDF draws straight down past the page edge: every line below the bottom
// of the page is silently lost, and a line that straddles the edge loses the
// glyphs that sit low on the baseline. drawPaginatedText writes line by line
// and opens a new page before a line would cross the bottom limit, and
// stampFooters draws the footer with a page count on every page once the
// document is complete.

/**
 * Prepare stored free text for a jsPDF standard font (Helvetica, WinAnsi).
 *
 * This is not a character stripper. It does exactly two things:
 *   1. normalizes line endings (CRLF and CR to LF) so paragraphs and numbered
 *      lists keep their separation when the text is split on "\n";
 *   2. rewrites the few characters the standard fonts cannot encode into the
 *      nearest renderable equivalent: tab (no glyph) and the Unicode hyphen
 *      and minus variants that fall outside WinAnsi (U+2010, U+2011, U+2012,
 *      U+2212). A single one of those makes jsPDF switch the whole line to a
 *      two-byte encoding the standard font cannot display.
 * Ordinary punctuation (".", "-", "x", quotes, "#", "$", "@", "/", "&") and
 * WinAnsi symbols (en dash, em dash, bullet, curly quotes) pass through as is.
 *
 * @param {string|null|undefined} text
 * @returns {string}
 */
export function normalizePdfText(text) {
  return String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, '    ')
    .replace(/[‐‑‒−]/g, '-')
}

/**
 * Wrap `text` at `width` and write it line by line from baseline `y`.
 *
 * Every line break in the source is kept, and a blank source line becomes a
 * one-line gap, so numbered lists keep their numbers and separation. Before
 * each line the helper checks whether the baseline would pass `bottom`; when
 * it would, it calls `onNewPage`, which must call doc.addPage(), draw the page
 * chrome (header band, divider) and return the y where text may resume. The
 * font, size and text color in effect when the helper was called are restored
 * after every page break, so the chrome's own fonts never leak into the body.
 *
 * @param {import('jspdf').jsPDF} doc
 * @param {string} text - stored notes or terms
 * @param {Object} opts
 * @param {number} opts.x - left edge in mm
 * @param {number} opts.y - first baseline in mm
 * @param {number} opts.width - wrap width in mm
 * @param {number} opts.lineHeight - baseline to baseline distance in mm
 * @param {number} opts.bottom - last baseline a line may occupy, in mm
 * @param {() => number} opts.onNewPage - opens the next page, returns its content y
 * @returns {number} y cursor just below the last written line
 */
export function drawPaginatedText(doc, text, { x, y, width, lineHeight, bottom, onNewPage }) {
  const font = doc.getFont()
  const fontSize = doc.getFontSize()
  const textColor = doc.getTextColor()
  const restoreBodyFont = () => {
    doc.setFont(font.fontName, font.fontStyle)
    doc.setFontSize(fontSize)
    doc.setTextColor(textColor)
  }

  for (const paragraph of normalizePdfText(text).split('\n')) {
    if (paragraph.trim() === '') {
      // Blank source line: a gap, never a reason to open a page on its own.
      // If it lands past the bottom, the page break that follows is the gap.
      y += lineHeight
      continue
    }
    for (const line of doc.splitTextToSize(paragraph, width)) {
      if (y > bottom) {
        y = onNewPage()
        restoreBodyFont()
      }
      doc.text(line, x, y)
      y += lineHeight
    }
  }
  return y
}

/**
 * Section heading styled like a category row of the line-item table: a light
 * fill band across the content width with a bold 9pt label in the brand
 * color, same padding as the table's section rows.
 *
 * @param {import('jspdf').jsPDF} doc
 * @param {string} label
 * @param {{ x: number, y: number, width: number, textColor: number[] }} opts
 * @returns {number} y just below the band
 */
export function drawSectionHeading(doc, label, { x, y, width, textColor }) {
  const height = 9.65
  doc.setFillColor(240, 240, 240)
  doc.setDrawColor(200, 200, 200)
  doc.setLineWidth(0.1)
  doc.rect(x, y, width, height, 'FD')
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...textColor)
  doc.text(label, x + 4, y + 5.7)
  return y + height
}

/**
 * Draw the footer on every page of a finished document: `left` at the left
 * margin, `right` followed by "Page n of N" at the right margin, and an
 * optional `center` label. Call once after all content is placed so N counts
 * every page the content produced, including notes and terms pages.
 *
 * @param {import('jspdf').jsPDF} doc
 * @param {Object} opts
 * @param {string} opts.left - company name
 * @param {string} opts.right - document number
 * @param {string|null} [opts.center] - optional centered label
 * @param {number} opts.pageWidth
 * @param {number} opts.pageHeight
 * @param {number} opts.margin
 * @param {number[]} opts.color - RGB text color
 */
export function stampFooters(doc, { left, right, center = null, pageWidth, pageHeight, margin, color }) {
  const total = doc.getNumberOfPages()
  for (let n = 1; n <= total; n++) {
    doc.setPage(n)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...color)
    doc.text(left, margin, pageHeight - 12)
    doc.text(`${right}   |   Page ${n} of ${total}`, pageWidth - margin, pageHeight - 12, { align: 'right' })
    if (center) doc.text(center, pageWidth / 2, pageHeight - 12, { align: 'center' })
  }
}
