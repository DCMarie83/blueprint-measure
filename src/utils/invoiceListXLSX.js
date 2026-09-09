// Invoice list export — CSV and Excel of the CURRENTLY filtered and sorted
// rows, exactly as the screen shows them, plus client email and job address.
// Excel styling follows the Job Costing export (the closest existing helper;
// that one is report-shaped so this list export is its own file, same
// patterns). Headers stay English like every other export.
import { paidOf, balanceOf } from '../components/invoices/invoiceListShared'

const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B2426' } }
const HEADER_FONT = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
const CURRENCY_FMT = '$#,##0.00'

const HEADERS = [
  'Invoice Number', 'Client', 'Client Email', 'Job', 'Job Address',
  'Invoice Date', 'Due Date', 'Total', 'Paid', 'Balance', 'Status', 'Last Reminded',
]

const day = (d) => (d ? String(d).slice(0, 10) : '')

function exportRow(inv, { paidMap, clientNameOf }) {
  return [
    inv.invoice_number ?? '',
    clientNameOf(inv) || '',
    inv.projects?.clients?.primary_email || '',
    inv.projects?.name || '',
    inv.projects?.address || '',
    day(inv.created_at),
    day(inv.due_date),
    Number(inv.total) || 0,
    paidOf(inv, paidMap),
    balanceOf(inv, paidMap),
    inv.status ?? '',
    day(inv.last_reminded_at),
  ]
}

function slugName(name) {
  return String(name || 'Company').trim().replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'Company'
}

export function invoiceExportFilename(company, ext) {
  const today = new Date().toISOString().slice(0, 10)
  return `Invoices_${slugName(company?.name)}_${today}.${ext}`
}

function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function exportInvoicesCSV({ rows, ctx, company }) {
  const esc = (v) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [HEADERS.map(esc).join(',')]
  for (const inv of rows) {
    lines.push(exportRow(inv, ctx).map(esc).join(','))
  }
  // BOM so Excel opens it as UTF-8.
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  triggerBlobDownload(blob, invoiceExportFilename(company, 'csv'))
}

export async function exportInvoicesXLSX({ rows, ctx, company }) {
  const ExcelJS = (await import('exceljs')).default
  const workbook = new ExcelJS.Workbook()
  const ws = workbook.addWorksheet('Invoices')

  let currentRow = 1
  const nameCell = ws.getCell(currentRow, 1)
  nameCell.value = company?.name || 'Company'
  nameCell.font = { bold: true, size: 16 }
  currentRow += 1

  const titleCell = ws.getCell(currentRow, 1)
  titleCell.value = 'Invoices'
  titleCell.font = { bold: true, size: 12 }
  currentRow += 1

  const dateCell = ws.getCell(currentRow, 1)
  dateCell.value = new Date().toISOString().slice(0, 10)
  dateCell.font = { size: 10, italic: true, color: { argb: 'FF666666' } }
  currentRow += 2

  const headerRowNum = currentRow
  const headerRow = ws.getRow(headerRowNum)
  HEADERS.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1)
    cell.value = h
    cell.font = HEADER_FONT
    cell.fill = HEADER_FILL
    cell.alignment = { vertical: 'middle' }
  })
  headerRow.commit()
  currentRow += 1

  ws.views = [{ state: 'frozen', ySplit: headerRowNum, xSplit: 0 }]
  const widths = [16, 22, 26, 24, 26, 12, 12, 12, 12, 12, 10, 13]
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w })

  const moneyCols = new Set([7, 8, 9]) // 0-based: Total, Paid, Balance

  for (const inv of rows) {
    const vals = exportRow(inv, ctx)
    const row = ws.getRow(currentRow)
    vals.forEach((v, i) => {
      const cell = row.getCell(i + 1)
      cell.value = v
      if (moneyCols.has(i) && v != null && v !== '') cell.numFmt = CURRENCY_FMT
    })
    row.commit()
    currentRow += 1
  }

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  triggerBlobDownload(blob, invoiceExportFilename(company, 'xlsx'))
}
