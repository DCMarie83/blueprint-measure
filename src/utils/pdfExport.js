import { jsPDF } from 'jspdf'

// Must match BlueprintCanvas zone color palette exactly
const ZONE_COLORS = [
  '#2e8bff', '#22c55e', '#f59e0b', '#ef4444', '#a855f7',
  '#06b6d4', '#f97316', '#84cc16', '#ec4899', '#14b8a6',
  '#8b5cf6', '#f43f5e', '#64748b', '#0ea5e9',
]

// Fetch a URL and return a base64 data URL (handles cross-origin Supabase storage URLs)
function toDataUrl(url) {
  if (url.startsWith('data:')) return Promise.resolve(url)
  return fetch(url)
    .then(r => r.blob())
    .then(blob => new Promise((res, rej) => {
      const reader = new FileReader()
      reader.onload = () => res(reader.result)
      reader.onerror = rej
      reader.readAsDataURL(blob)
    }))
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

// Draw one zone onto the offscreen canvas using the same rendering logic as BlueprintCanvas.
// Points are in the rendered-image coordinate space (no transform needed).
function drawZoneOnCanvas(ctx, zone, colorIndex) {
  const { points, measurement_type: type, result, name } = zone
  if (!points || points.length === 0) return

  const color = zone.color ?? ZONE_COLORS[colorIndex % ZONE_COLORS.length]
  const nonNull = points.filter(p => p !== null && p !== undefined)
  if (nonNull.length === 0) return

  ctx.save()

  // Semi-transparent fill for SF (polygon) zones
  if (type === 'SF') {
    ctx.beginPath()
    let penDown = false
    for (const p of points) {
      if (p === null || p === undefined) { penDown = false }
      else if (!penDown) { ctx.moveTo(p.x, p.y); penDown = true }
      else { ctx.lineTo(p.x, p.y) }
    }
    ctx.closePath()
    ctx.fillStyle = color
    ctx.globalAlpha = 0.14
    ctx.fill()
  }

  // Stroke — lifts pen at null sentinels (multi-segment LF/count zones)
  ctx.beginPath()
  let penDown = false
  for (const p of points) {
    if (p === null || p === undefined) { penDown = false }
    else if (!penDown) { ctx.moveTo(p.x, p.y); penDown = true }
    else { ctx.lineTo(p.x, p.y) }
  }
  ctx.strokeStyle = color
  ctx.lineWidth = 2.5
  ctx.globalAlpha = 0.9
  ctx.stroke()

  // Label — centroid of all non-null points
  const cx = nonNull.reduce((s, p) => s + p.x, 0) / nonNull.length
  const cy = nonNull.reduce((s, p) => s + p.y, 0) / nonNull.length
  const unit = type === 'LF' ? ' lf' : type === 'count' ? ' items' : ' sf'
  const label = `${name}: ${result}${unit}`

  ctx.globalAlpha = 1
  ctx.font = 'bold 12px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  const tw = ctx.measureText(label).width + 14
  const th = 20
  ctx.fillStyle = 'rgba(0,0,0,0.68)'
  ctx.fillRect(cx - tw / 2, cy - th / 2, tw, th)
  ctx.fillStyle = '#ffffff'
  ctx.fillText(label, cx, cy)

  ctx.restore()
}

// Generate and save a PDF where each page is the blueprint with zone outlines
// drawn over it. For multi-page PDFs each source page becomes one PDF page.
//
// Parameters:
//   session    — session record (used for the filename)
//   zones      — all zones across all pages
//   renderPage — async fn(pageNum, scale) → data URL (from usePdf hook)
//   pageCount  — total pages in the PDF (1 for image blueprints)
//   isPdf      — true if the blueprint is a PDF
//   blueprintUrl — storage URL for image blueprints
export async function downloadPdfWithMeasurements({
  session, zones, renderPage, pageCount, isPdf, blueprintUrl,
}) {
  // ── 1. Render all source pages ───────────────────────────────────────────────
  // PDF pages are rendered at 1.5× — the same scale used in the app — so zone
  // point coordinates (which are in the rendered image's pixel space) align
  // correctly with the image data.
  const pageImages = []

  if (isPdf) {
    const total = pageCount || 1
    for (let n = 1; n <= total; n++) {
      const rawUrl = await renderPage(n, 1.5)
      const dataUrl = await toDataUrl(rawUrl)
      const img = await loadImage(dataUrl)
      pageImages.push({ dataUrl, img, pageNum: n })
    }
  } else {
    const dataUrl = await toDataUrl(blueprintUrl)
    const img = await loadImage(dataUrl)
    pageImages.push({ dataUrl, img, pageNum: 1 })
  }

  // ── 2. Initialise jsPDF from the first page's dimensions ────────────────────
  const { img: first } = pageImages[0]
  const doc = new jsPDF({
    orientation: first.width >= first.height ? 'landscape' : 'portrait',
    unit: 'px',
    format: [first.width, first.height],
    compress: true,
  })

  // ── 3. Composite image + zone overlays for each page ────────────────────────
  for (let i = 0; i < pageImages.length; i++) {
    const { img, pageNum } = pageImages[i]

    // Offscreen canvas at the exact rendered dimensions
    const canvas = document.createElement('canvas')
    canvas.width = img.width
    canvas.height = img.height
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0)

    // Get zones scoped to this page
    const pageZones = isPdf
      ? zones.filter(z => (z.page_number ?? 1) === pageNum)
      : zones
    pageZones.forEach((zone, zi) => drawZoneOnCanvas(ctx, zone, zi))

    const composite = canvas.toDataURL('image/jpeg', 0.92)

    if (i > 0) doc.addPage([img.width, img.height])
    doc.addImage(composite, 'JPEG', 0, 0, img.width, img.height)
  }

  // ── 4. Trigger download ──────────────────────────────────────────────────────
  const name = (session?.project_name || 'blueprint').replace(/[^a-z0-9_-]/gi, '_')
  doc.save(`${name}_measurements.pdf`)
}
