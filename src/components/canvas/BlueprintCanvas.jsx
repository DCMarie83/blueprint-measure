import { useRef, useEffect, useCallback } from 'react'
import styles from './BlueprintCanvas.module.css'

// Color palette for zones — cycles through these
const ZONE_COLORS = [
  '#2e8bff', '#22c55e', '#f59e0b', '#ef4444', '#a855f7',
  '#06b6d4', '#f97316', '#84cc16', '#ec4899', '#14b8a6',
]

// BlueprintCanvas renders the blueprint image and all drawn zones on a <canvas>.
// It handles mouse events for drawing new zones.
//
// Props:
//   imageUrl      — URL of the blueprint image to display as background
//   zones         — array of saved zone objects from the database
//   activeZone    — the zone currently being drawn (has { points, measurement_type })
//   onPointAdd    — called with {x, y} (in image-space) when user clicks to add a point
//   onZoneComplete— called when user double-clicks to finish a zone
//   pixelsPerFoot — scale calibration value
//   isDrawing     — boolean: are we in drawing mode?
//   calibrating   — boolean: are we drawing the calibration line?
//   onCalibrationLine — called with two points when calibration line is complete
//   canvasTransform — { scale, offsetX, offsetY } for pan/zoom

export default function BlueprintCanvas({
  imageUrl,
  zones,
  activeZone,
  onPointAdd,
  onZoneComplete,
  pixelsPerFoot,
  isDrawing,
  calibrating,
  onCalibrationLine,
  redrawingZoneId,
}) {
  const canvasRef = useRef(null)
  const imageRef = useRef(null)
  const transformRef = useRef({ scale: 1, offsetX: 0, offsetY: 0 })
  const isPanning = useRef(false)
  const lastPan = useRef({ x: 0, y: 0 })
  const calibPoints = useRef([])

  // Draw everything onto the canvas
  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const { scale, offsetX, offsetY } = transformRef.current

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.save()
    ctx.translate(offsetX, offsetY)
    ctx.scale(scale, scale)

    // Draw blueprint image
    if (imageRef.current && imageRef.current.complete) {
      ctx.drawImage(imageRef.current, 0, 0)
    }

    // Draw saved zones (skip the one currently being redrawn)
    zones.forEach((zone, i) => {
      if (zone.id === redrawingZoneId) return
      if (!zone.points || zone.points.length < 2) return
      const color = ZONE_COLORS[i % ZONE_COLORS.length]
      drawZone(ctx, zone.points, color, zone.measurement_type, zone.name, zone.result, false, zone.description, zone.surface_type, zone.coat_count)
    })

    // Draw active (in-progress) zone — use colorIndex if provided (preserves color on redraw)
    if (activeZone && activeZone.points && activeZone.points.length > 0) {
      const colorIdx = (activeZone.colorIndex ?? zones.length) % ZONE_COLORS.length
      const color = ZONE_COLORS[colorIdx]
      drawZone(ctx, activeZone.points, color, activeZone.measurement_type, '', null, true, null, null, null)
    }

    // Draw calibration points
    if (calibrating && calibPoints.current.length > 0) {
      ctx.strokeStyle = '#f59e0b'
      ctx.lineWidth = 2 / scale
      ctx.setLineDash([6 / scale, 4 / scale])
      const pts = calibPoints.current
      ctx.beginPath()
      ctx.moveTo(pts[0].x, pts[0].y)
      if (pts[1]) ctx.lineTo(pts[1].x, pts[1].y)
      ctx.stroke()
      ctx.setLineDash([])
      pts.forEach(p => {
        ctx.fillStyle = '#f59e0b'
        ctx.beginPath()
        ctx.arc(p.x, p.y, 5 / scale, 0, Math.PI * 2)
        ctx.fill()
      })
    }

    ctx.restore()
  }, [zones, activeZone, calibrating])

  function drawZone(ctx, points, color, type, name, result, isActive, description, surfaceType, coatCount) {
    if (points.length === 0) return

    ctx.save()

    // Fill for SF zones
    if (type === 'SF' && points.length >= 3) {
      ctx.beginPath()
      ctx.moveTo(points[0].x, points[0].y)
      points.slice(1).forEach(p => ctx.lineTo(p.x, p.y))
      ctx.closePath()
      ctx.fillStyle = color + (isActive ? '28' : '22')
      ctx.fill()
    }

    // Stroke — skip for count (markers don't connect)
    if (type !== 'count' && points.length >= 2) {
      ctx.beginPath()
      ctx.moveTo(points[0].x, points[0].y)
      points.slice(1).forEach(p => ctx.lineTo(p.x, p.y))
      if (type === 'SF' && !isActive) ctx.closePath()
      ctx.strokeStyle = color
      ctx.lineWidth = 2 / transformRef.current.scale
      ctx.lineJoin = 'round'
      ctx.stroke()
    }

    // Draw points — numbered circles for count, regular dots for others
    if (type === 'count') {
      const s = transformRef.current.scale
      points.forEach((p, idx) => {
        const r = 10 / s
        // Filled circle
        ctx.fillStyle = color
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 1.5 / s
        ctx.beginPath()
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
        // Number label inside
        ctx.fillStyle = '#fff'
        ctx.font = `bold ${r * 1.4}px Inter, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(String(idx + 1), p.x, p.y)
      })
    } else {
      points.forEach((p, idx) => {
        ctx.fillStyle = isActive && idx === points.length - 1 ? '#fff' : color
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 1.5 / transformRef.current.scale
        ctx.beginPath()
        ctx.arc(p.x, p.y, (isActive && idx === points.length - 1 ? 6 : 4) / transformRef.current.scale, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
      })
    }

    // Label for completed zones
    if (!isActive && name && points.length >= 1) {
      const cx = points.reduce((s, p) => s + p.x, 0) / points.length
      const cy = points.reduce((s, p) => s + p.y, 0) / points.length
      const unitLabel = type === 'count' ? 'each' : type
      const labelParts = [name]
      if (description) labelParts.push(description)
      // Combine surface type and coat count onto one line if either is set
      const metaParts = [
        surfaceType || null,
        coatCount > 1 ? `${coatCount} coats` : null,
      ].filter(Boolean)
      if (metaParts.length > 0) labelParts.push(metaParts.join(' · '))
      if (result != null) labelParts.push(`${result} ${unitLabel}`)
      const lines = labelParts
      const fs = 13 / transformRef.current.scale
      ctx.font = `bold ${fs}px Inter, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const lineH = fs * 1.3

      // Background pill
      const maxW = Math.max(...lines.map(l => ctx.measureText(l).width))
      const padX = 8 / transformRef.current.scale
      const padY = 5 / transformRef.current.scale
      const totalH = lines.length * lineH + 2 * padY
      ctx.fillStyle = 'rgba(15,25,35,0.82)'
      const rx = 4 / transformRef.current.scale
      roundRect(ctx, cx - maxW / 2 - padX, cy - totalH / 2, maxW + 2 * padX, totalH, rx)
      ctx.fill()

      // Text
      lines.forEach((line, i) => {
        ctx.fillStyle = i === 0 ? '#e8edf2' : color
        ctx.fillText(line, cx, cy + (i - (lines.length - 1) / 2) * lineH)
      })
    }

    ctx.restore()
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.lineTo(x + w - r, y)
    ctx.arcTo(x + w, y, x + w, y + r, r)
    ctx.lineTo(x + w, y + h - r)
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
    ctx.lineTo(x + r, y + h)
    ctx.arcTo(x, y + h, x, y + h - r, r)
    ctx.lineTo(x, y + r)
    ctx.arcTo(x, y, x + r, y, r)
    ctx.closePath()
  }

  // Convert mouse event coords to image-space coords
  function toImageSpace(e) {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const { scale, offsetX, offsetY } = transformRef.current
    const x = (e.clientX - rect.left - offsetX) / scale
    const y = (e.clientY - rect.top - offsetY) / scale
    return { x, y }
  }

  // Load image and fit to canvas on mount / imageUrl change
  useEffect(() => {
    if (!imageUrl) return
    const img = new Image()
    img.onload = () => {
      imageRef.current = img
      const canvas = canvasRef.current
      if (!canvas) return

      // Fit image to canvas container
      const container = canvas.parentElement
      const cw = container.clientWidth
      const ch = container.clientHeight
      canvas.width = cw
      canvas.height = ch

      const scaleX = cw / img.width
      const scaleY = ch / img.height
      const fitScale = Math.min(scaleX, scaleY, 1) * 0.92

      transformRef.current = {
        scale: fitScale,
        offsetX: (cw - img.width * fitScale) / 2,
        offsetY: (ch - img.height * fitScale) / 2,
      }
      redraw()
    }
    img.src = imageUrl
  }, [imageUrl, redraw])

  // Redraw whenever zones or active zone changes
  useEffect(() => {
    redraw()
  }, [redraw])

  // Resize canvas when window resizes
  useEffect(() => {
    function onResize() {
      const canvas = canvasRef.current
      if (!canvas) return
      canvas.width = canvas.parentElement.clientWidth
      canvas.height = canvas.parentElement.clientHeight
      redraw()
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [redraw])

  function handleClick(e) {
    if (isPanning.current) return
    const pt = toImageSpace(e)

    if (calibrating) {
      calibPoints.current = [...calibPoints.current, pt]
      if (calibPoints.current.length === 2) {
        onCalibrationLine(calibPoints.current[0], calibPoints.current[1])
        calibPoints.current = []
      }
      redraw()
      return
    }

    if (isDrawing) {
      onPointAdd(pt)
    }
  }

  function handleDoubleClick(e) {
    if (!isDrawing) return
    // Count zones are finished with the Finish Zone button only —
    // double-click would accidentally add 2 extra items first.
    if (activeZone?.measurement_type === 'count') return
    e.preventDefault()
    onZoneComplete()
  }

  // Pan with middle mouse or space+drag
  function handleMouseDown(e) {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      isPanning.current = true
      lastPan.current = { x: e.clientX, y: e.clientY }
      e.preventDefault()
    }
  }

  function handleMouseMove(e) {
    if (!isPanning.current) return
    const dx = e.clientX - lastPan.current.x
    const dy = e.clientY - lastPan.current.y
    transformRef.current.offsetX += dx
    transformRef.current.offsetY += dy
    lastPan.current = { x: e.clientX, y: e.clientY }
    redraw()
  }

  function handleMouseUp() {
    isPanning.current = false
  }

  // Zoom with scroll wheel
  function handleWheel(e) {
    e.preventDefault()
    const factor = e.deltaY < 0 ? 1.1 : 0.9
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top

    const { scale, offsetX, offsetY } = transformRef.current
    const newScale = Math.max(0.1, Math.min(10, scale * factor))

    transformRef.current = {
      scale: newScale,
      offsetX: mx - (mx - offsetX) * (newScale / scale),
      offsetY: my - (my - offsetY) * (newScale / scale),
    }
    redraw()
  }

  const cursor = calibrating ? 'crosshair'
    : isDrawing ? 'crosshair'
    : 'grab'

  return (
    <div className={styles.container}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        style={{ cursor }}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
      />
      {!imageUrl && (
        <div className={styles.placeholder}>
          Upload a blueprint to begin
        </div>
      )}
    </div>
  )
}
