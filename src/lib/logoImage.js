// Shared tenant-logo helpers for every export surface (jsPDF generators and
// ExcelJS workbooks). One load path, one draw path: the PDF generators no
// longer inline their own addImage blocks, and the XLSX exporters no longer
// carry private copies of the fetch/dimension helpers.

// MIME types the PDF pipeline embeds. Anything else (SVG, WebP, GIF) is
// skipped: callers fall back to the text company name.
const PDF_FORMATS = { 'image/png': 'PNG', 'image/jpeg': 'JPEG' }

// Raster MIME types ExcelJS can embed.
const XLSX_MIME = { 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/gif': 'gif' }

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

function readDimensions(src) {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => resolve(null)
    img.src = src
  })
}

/**
 * Load a logo URL for PDF embedding.
 *
 * @param {string} url - public storage URL (companies.logo_url)
 * @returns {Promise<{ dataUrl: string, format: 'PNG'|'JPEG', width: number, height: number } | null>}
 *   null on any failure or unsupported format — callers keep their
 *   text-company-name fallback.
 */
export async function loadLogo(url) {
  if (!url) return null
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    const format = PDF_FORMATS[blob.type]
    if (!format) return null
    const dataUrl = await blobToDataUrl(blob)
    const dims = await readDimensions(dataUrl)
    if (!dims || !dims.width || !dims.height) return null
    return { dataUrl, format, width: dims.width, height: dims.height }
  } catch {
    return null
  }
}

/**
 * Draw a loaded logo into a jsPDF document, contain-fit inside a maxW x maxH
 * mm box, anchored top-left at (x, y). Aspect ratio is always preserved.
 *
 * @param {jsPDF} doc
 * @param {{ dataUrl, format, width, height } | null} logo - from loadLogo
 * @param {{ x: number, y: number, maxW: number, maxH: number }} box - mm
 * @returns {{ w: number, h: number }} drawn size in mm ({ w: 0, h: 0 } when nothing drew)
 */
export function drawLogo(doc, logo, { x, y, maxW, maxH }) {
  if (!logo?.dataUrl || !logo.width || !logo.height) return { w: 0, h: 0 }
  const scale = Math.min(maxW / logo.width, maxH / logo.height)
  const w = logo.width * scale
  const h = logo.height * scale
  doc.addImage({ imageData: logo.dataUrl, format: logo.format, x, y, width: w, height: h })
  return { w, h }
}

/**
 * Fetch a logo URL as an ArrayBuffer for ExcelJS embedding.
 * Ported unchanged from utils/xlsxExport.js.
 *
 * @returns {Promise<{ buffer: ArrayBuffer, extension: 'png'|'jpeg'|'gif', width: 0, height: 0 } | null>}
 */
export async function loadLogoBuffer(url) {
  if (!url) return null
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    const ext = XLSX_MIME[blob.type]
    if (!ext) return null // SVGs or unsupported formats — skip gracefully
    const arrayBuffer = await blob.arrayBuffer()
    return { buffer: arrayBuffer, extension: ext, width: 0, height: 0 }
  } catch {
    return null // network error — proceed without logo
  }
}

/**
 * Read natural pixel dimensions from an image URL.
 * Ported unchanged from utils/xlsxExport.js.
 *
 * @returns {Promise<{ width: number, height: number } | null>}
 */
export function loadImageDimensions(url) {
  return readDimensions(url)
}
