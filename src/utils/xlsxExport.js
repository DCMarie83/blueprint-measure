// Generates and triggers a branded .xlsx download for all zones in a session.
import { buildExportData, buildExportFilename } from './exportData'

// ── Logo helpers (same fetch-and-convert pattern as pdfExport.js) ────────────

// Supported raster MIME types ExcelJS can embed.
const SUPPORTED_MIME = { 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/gif': 'gif' }

async function fetchLogoBuffer(url) {
  if (!url) return null
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    const ext = SUPPORTED_MIME[blob.type]
    if (!ext) return null // SVGs or unsupported formats — skip gracefully
    const arrayBuffer = await blob.arrayBuffer()
    return { buffer: arrayBuffer, extension: ext, width: 0, height: 0 }
  } catch {
    return null // network error — proceed without logo
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

// ── Column-width heuristics ─────────────────────────────────────────────────

const COL_WIDTHS = {
  'Zone Name': 22, 'Description': 26, 'Surface Type': 14, 'Coats': 8,
  'Surface Finish': 14, 'Type': 8, 'Result': 12, 'Unit': 8,
  'Max Reach (ft)': 14, 'Est. Paint (gal)': 16, 'Notes': 30,
}

// ── Header style constants ──────────────────────────────────────────────────

const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B2426' } }
const HEADER_FONT = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }

// ── Numeric column indices (relative to headers array) ──────────────────────

function numericIndices(headers) {
  const names = new Set(['Coats', 'Result', 'Max Reach (ft)', 'Est. Paint (gal)'])
  return headers.reduce((acc, h, i) => { if (names.has(h)) acc.push(i); return acc }, [])
}

// ── Main export ─────────────────────────────────────────────────────────────

export async function exportXLSX(session, zones, enabledFeatures, company) {
  const ExcelJS = (await import('exceljs')).default
  const { headers, rows, summary } = buildExportData(session, zones, enabledFeatures)

  const workbook = new ExcelJS.Workbook()
  const ws = workbook.addWorksheet('Takeoff')

  let currentRow = 1

  // ── Branding block ──────────────────────────────────────────────────────────

  // Attempt logo embed
  const logoTargetHeight = 40 // px
  let logoRowSpan = 3         // rows the logo occupies
  const logo = company?.logo_url ? await fetchLogoBuffer(company.logo_url) : null
  if (logo) {
    const dims = await loadImageDimensions(company.logo_url)
    if (dims && dims.height > 0) {
      const aspect = dims.width / dims.height
      const pxWidth = Math.round(logoTargetHeight * aspect)
      const imageId = workbook.addImage({ buffer: logo.buffer, extension: logo.extension })
      ws.addImage(imageId, {
        tl: { col: 0, row: 0 },
        ext: { width: pxWidth, height: logoTargetHeight },
      })
    }
  }

  // Company name — always shown, bold + larger
  const nameCell = ws.getCell(currentRow, 1)
  nameCell.value = company?.name || 'Measurement Export'
  nameCell.font = { bold: true, size: 16 }
  currentRow += 1

  // Subtitle: project name + date
  const subtitle = [session.project_name, session.description].filter(Boolean).join(' — ')
  const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  const subCell = ws.getCell(currentRow, 1)
  subCell.value = subtitle ? `${subtitle}  ·  ${dateStr}` : dateStr
  subCell.font = { size: 10, italic: true, color: { argb: 'FF666666' } }
  currentRow += 1

  // Spacer row
  currentRow += 1

  // ── Header row ──────────────────────────────────────────────────────────────

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

  // Freeze panes at the header row
  ws.views = [{ state: 'frozen', ySplit: headerRowNum, xSplit: 0 }]

  // Column widths
  headers.forEach((h, i) => {
    ws.getColumn(i + 1).width = COL_WIDTHS[h] || 14
  })

  // Identify numeric columns for formatting
  const numCols = new Set(numericIndices(headers))
  const resultIdx = headers.indexOf('Result')
  const typeIdx = headers.indexOf('Type')

  // ── Data rows ───────────────────────────────────────────────────────────────

  rows.forEach(row => {
    const exRow = ws.getRow(currentRow)
    row.forEach((cell, i) => {
      const exCell = exRow.getCell(i + 1)
      if (cell === null || cell === undefined) {
        exCell.value = null
      } else {
        exCell.value = cell
      }
      // Number format for numeric columns
      if (numCols.has(i) && typeof cell === 'number') {
        if (i === resultIdx) {
          // Check the Type column to decide format
          const measureType = row[typeIdx]
          exCell.numFmt = (measureType === 'count') ? '0' : '0.00'
        } else {
          exCell.numFmt = '0.00'
        }
      }
    })
    exRow.commit()
    currentRow += 1
  })

  // ── Summary section ─────────────────────────────────────────────────────────

  currentRow += 1 // blank spacer row

  const summaryLabel = ws.getRow(currentRow)
  summaryLabel.getCell(1).value = 'SUMMARY'
  summaryLabel.getCell(1).font = { bold: true, size: 12 }
  summaryLabel.commit()
  currentRow += 1

  const summaryLines = [
    { label: 'Total SF',    type: 'SF',    value: summary.totalSF,    unit: 'sq ft',  fmt: '0.00' },
    { label: 'Total LF',    type: 'LF',    value: summary.totalLF,    unit: 'lin ft', fmt: '0.00' },
    { label: 'Total Count', type: 'count', value: summary.totalCount, unit: 'each',   fmt: '0' },
  ]

  const resultCol = resultIdx + 1 // 1-based
  const typeCol = typeIdx + 1
  const unitCol = resultCol + 1

  summaryLines.forEach(({ label, type, value, unit, fmt }) => {
    const r = ws.getRow(currentRow)
    r.getCell(1).value = label
    r.getCell(1).font = { bold: true }
    r.getCell(typeCol).value = type
    const valCell = r.getCell(resultCol)
    valCell.value = value
    valCell.numFmt = fmt
    r.getCell(unitCol).value = unit
    r.commit()
    currentRow += 1
  })

  // ── Trigger browser download ────────────────────────────────────────────────

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = buildExportFilename(session) + '.xlsx'
  a.click()
  URL.revokeObjectURL(url)
}
