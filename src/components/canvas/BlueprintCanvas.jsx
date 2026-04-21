import { useRef, useEffect, useCallback, useState, forwardRef, useImperativeHandle } from 'react'
import styles from './BlueprintCanvas.module.css'

// Human-readable ceiling type names shown in the canvas label
const CEILING_TYPE_LABELS = {
  vaulted: 'Vaulted',
  tray: 'Tray',
  shed: 'Shed',
}

// Color palette for zones — cycles through these
const ZONE_COLORS = [
  '#2e8bff', '#22c55e', '#f59e0b', '#ef4444', '#a855f7',
  '#06b6d4', '#f97316', '#84cc16', '#ec4899', '#14b8a6',
]

// BlueprintCanvas renders the blueprint image and all drawn zones on a <canvas>.
// It handles mouse events for drawing new zones and pan/zoom navigation.
//
// Exposed via ref (forwardRef):
//   resetView() — snaps the canvas back to the initial fit-to-screen position
const BlueprintCanvas = forwardRef(function BlueprintCanvas({
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
  hiddenZoneIds,
}, ref) {
  const canvasRef = useRef(null)
  const imageRef = useRef(null)
  const transformRef = useRef({ scale: 1, offsetX: 0, offsetY: 0 })
  const initialTransformRef = useRef(null) // saved on image load, used by resetView

  // Pan tracking (left-button — disabled during drawing)
  const isPanning = useRef(false)
  const lastPan = useRef({ x: 0, y: 0 })
  const panStart = useRef({ x: 0, y: 0 })
  const didPan = useRef(false) // true once mouse moves past the drag threshold

  // Right-click pan tracking — works even while drawing a zone
  const isRightPanning = useRef(false)
  const lastRightPan = useRef({ x: 0, y: 0 })

  const [isDragging, setIsDragging] = useState(false)

  const calibPoints = useRef([])

  // ── redraw ───────────────────────────────────────────────────────────────────
  // Recreated when zones/activeZone/calibrating change. All effects that need
  // the latest redraw use redrawRef so they don't become stale dependencies.

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

    // Draw saved zones (skip hidden zones and the one being redrawn)
    zones.forEach((zone, i) => {
      if (zone.id === redrawingZoneId) return
      if (hiddenZoneIds?.has(zone.id)) return
      if (!zone.points || zone.points.filter(p => p !== null).length < 2) return
      // Use the zone's custom color if set, otherwise cycle through the palette
      const color = zone.color ?? ZONE_COLORS[i % ZONE_COLORS.length]
      drawZone(ctx, zone.points, color, zone.measurement_type, zone.name, zone.result, false, zone.description, zone.surface_type, zone.coat_count, zone.ceiling_type)
    })

    // Draw active (in-progress) zone — includes finished segments + current points
    if (activeZone && activeZone.points && activeZone.points.some(p => p !== null)) {
      const colorIdx = (activeZone.colorIndex ?? zones.length) % ZONE_COLORS.length
      const color = activeZone.color ?? ZONE_COLORS[colorIdx]
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
  }, [zones, activeZone, calibrating, redrawingZoneId, hiddenZoneIds])

  // Stable ref so effects and event listeners always call the latest redraw
  // without needing it in their dependency arrays (which would cause side-effects
  // like re-loading the image or re-registering listeners on every zone change).
  const redrawRef = useRef(redraw)
  useEffect(() => { redrawRef.current = redraw }, [redraw])

  // ── Expose resetView to parent ───────────────────────────────────────────────
  useImperativeHandle(ref, () => ({
    resetView() {
      if (initialTransformRef.current) {
        transformRef.current = { ...initialTransformRef.current }
        redrawRef.current()
      }
    }
  }), []) // stable — uses only refs

  // ── Image loading ────────────────────────────────────────────────────────────
  // Depends ONLY on imageUrl — not on redraw. Previously including redraw here
  // caused the transform to reset every time zones changed (because redraw is
  // recreated on each zone change), which locked the view in place after any edit.
  useEffect(() => {
    if (!imageUrl) return
    const img = new Image()
    img.onload = () => {
      imageRef.current = img
      const canvas = canvasRef.current
      if (!canvas) return

      const container = canvas.parentElement
      const cw = container.clientWidth
      const ch = container.clientHeight
      canvas.width = cw
      canvas.height = ch

      const scaleX = cw / img.width
      const scaleY = ch / img.height
      const fitScale = Math.min(scaleX, scaleY, 1) * 0.92

      const fitTransform = {
        scale: fitScale,
        offsetX: (cw - img.width * fitScale) / 2,
        offsetY: (ch - img.height * fitScale) / 2,
      }
      transformRef.current = { ...fitTransform }
      initialTransformRef.current = { ...fitTransform }
      redrawRef.current()
    }
    img.src = imageUrl
  }, [imageUrl]) // ← no redraw here — that was the bug

  // Redraw when zones / active zone / calibrating changes (without reloading image)
  useEffect(() => {
    redraw()
  }, [redraw])

  // ── Resize ───────────────────────────────────────────────────────────────────
  // Uses redrawRef so the listener doesn't need to be re-registered on zone changes.
  useEffect(() => {
    function onResize() {
      const canvas = canvasRef.current
      if (!canvas) return
      canvas.width = canvas.parentElement.clientWidth
      canvas.height = canvas.parentElement.clientHeight
      redrawRef.current()
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, []) // stable

  // ── Scroll-wheel zoom ────────────────────────────────────────────────────────
  // Registered as a direct DOM listener with passive:false so e.preventDefault()
  // actually works. React JSX onWheel is passive in React 17+ and can't prevent
  // the page from scrolling.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    function onWheel(e) {
      e.preventDefault()
      const factor = e.deltaY < 0 ? 1.1 : 0.9
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
      redrawRef.current()
    }

    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, []) // stable — uses only refs

  // ── Drawing helpers ──────────────────────────────────────────────────────────

  function drawZone(ctx, points, color, type, name, result, isActive, description, surfaceType, coatCount, ceilingType) {
    if (points.length === 0) return
    ctx.save()

    // Filter out null sentinels for operations that need actual point coordinates
    const nonNullPoints = points.filter(p => p !== null && p !== undefined)

    // Fill for SF zones (SF never has nulls, but filter defensively)
    if (type === 'SF' && nonNullPoints.length >= 3) {
      ctx.beginPath()
      ctx.moveTo(nonNullPoints[0].x, nonNullPoints[0].y)
      nonNullPoints.slice(1).forEach(p => ctx.lineTo(p.x, p.y))
      ctx.closePath()
      ctx.fillStyle = color + (isActive ? '28' : '22')
      ctx.fill()
    }

    // Stroke — skip for count (markers don't connect).
    // Null sentinels lift the pen so disconnected segments draw as separate lines.
    if (type !== 'count' && nonNullPoints.length >= 2) {
      ctx.beginPath()
      let penDown = false
      for (const p of points) {
        if (p === null || p === undefined) {
          penDown = false
        } else if (!penDown) {
          ctx.moveTo(p.x, p.y)
          penDown = true
        } else {
          ctx.lineTo(p.x, p.y)
        }
      }
      if (type === 'SF' && !isActive) ctx.closePath()
      ctx.strokeStyle = color
      ctx.lineWidth = 2 / transformRef.current.scale
      ctx.lineJoin = 'round'
      ctx.stroke()
    }

    // Draw points — numbered circles for count, regular dots for others.
    // Always operate on nonNullPoints so null sentinels are invisible.
    if (type === 'count') {
      const s = transformRef.current.scale
      nonNullPoints.forEach((p, idx) => {
        const r = 10 / s
        ctx.fillStyle = color
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 1.5 / s
        ctx.beginPath()
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
        ctx.fillStyle = '#fff'
        ctx.font = `bold ${r * 1.4}px Inter, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(String(idx + 1), p.x, p.y)
      })
    } else {
      nonNullPoints.forEach((p, idx) => {
        ctx.fillStyle = isActive && idx === nonNullPoints.length - 1 ? '#fff' : color
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 1.5 / transformRef.current.scale
        ctx.beginPath()
        ctx.arc(p.x, p.y, (isActive && idx === nonNullPoints.length - 1 ? 6 : 4) / transformRef.current.scale, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
      })
    }

    // Label for completed zones
    if (!isActive && name && nonNullPoints.length >= 1) {
      const cx = nonNullPoints.reduce((s, p) => s + p.x, 0) / nonNullPoints.length
      const cy = nonNullPoints.reduce((s, p) => s + p.y, 0) / nonNullPoints.length
      const unitLabel = type === 'count' ? 'each' : type
      const labelParts = [name]
      if (description) labelParts.push(description)
      // Show ceiling type alongside surface type when it's not flat (default)
      const surfaceLabel = (surfaceType === 'Ceiling' && ceilingType && CEILING_TYPE_LABELS[ceilingType])
        ? `${surfaceType} · ${CEILING_TYPE_LABELS[ceilingType]}`
        : surfaceType || null
      const metaParts = [
        surfaceLabel,
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
      const maxW = Math.max(...lines.map(l => ctx.measureText(l).width))
      const padX = 8 / transformRef.current.scale
      const padY = 5 / transformRef.current.scale
      const totalH = lines.length * lineH + 2 * padY
      ctx.fillStyle = 'rgba(15,25,35,0.82)'
      const rx = 4 / transformRef.current.scale
      roundRect(ctx, cx - maxW / 2 - padX, cy - totalH / 2, maxW + 2 * padX, totalH, rx)
      ctx.fill()
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

  // Convert a mouse event's screen coordinates to image-space coordinates,
  // accounting for the current pan offset and zoom scale.
  function toImageSpace(e) {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const { scale, offsetX, offsetY } = transformRef.current
    return {
      x: (e.clientX - rect.left - offsetX) / scale,
      y: (e.clientY - rect.top - offsetY) / scale,
    }
  }

  // ── Mouse event handlers ─────────────────────────────────────────────────────

  function handleMouseDown(e) {
    if (e.button === 2) {
      // Right-click always starts a pan, even while drawing a zone
      isRightPanning.current = true
      lastRightPan.current = { x: e.clientX, y: e.clientY }
      setIsDragging(true)
      return
    }
    if (e.button !== 0) return // Ignore middle button etc.
    // In drawing or calibrating mode, left-click places points — don't capture for pan
    if (isDrawing || calibrating) return

    isPanning.current = true
    didPan.current = false
    lastPan.current = { x: e.clientX, y: e.clientY }
    panStart.current = { x: e.clientX, y: e.clientY }
  }

  function handleMouseMove(e) {
    // Right-click pan has priority and works during drawing
    if (isRightPanning.current) {
      const dx = e.clientX - lastRightPan.current.x
      const dy = e.clientY - lastRightPan.current.y
      transformRef.current.offsetX += dx
      transformRef.current.offsetY += dy
      redrawRef.current()
      lastRightPan.current = { x: e.clientX, y: e.clientY }
      return
    }

    if (!isPanning.current) return

    const dx = e.clientX - lastPan.current.x
    const dy = e.clientY - lastPan.current.y

    // Only commit to pan mode after moving at least 4px — keeps a small click
    // from accidentally shifting the view.
    const totalDx = e.clientX - panStart.current.x
    const totalDy = e.clientY - panStart.current.y
    if (!didPan.current && Math.sqrt(totalDx * totalDx + totalDy * totalDy) > 4) {
      didPan.current = true
      setIsDragging(true) // update cursor once
    }

    if (didPan.current) {
      transformRef.current.offsetX += dx
      transformRef.current.offsetY += dy
      redrawRef.current()
    }

    lastPan.current = { x: e.clientX, y: e.clientY }
  }

  function handleMouseUp(e) {
    if (e.button === 2) {
      isRightPanning.current = false
      setIsDragging(false)
      return
    }
    isPanning.current = false
    if (isDragging) setIsDragging(false) // update cursor once
  }

  function handleMouseLeave() {
    // Stop all pan modes if the pointer leaves the canvas mid-drag
    if (isRightPanning.current) {
      isRightPanning.current = false
      setIsDragging(false)
    }
    if (isPanning.current) {
      isPanning.current = false
      if (isDragging) setIsDragging(false)
    }
  }

  function handleClick(e) {
    // If this mouseup completed a drag, eat the click — don't place a point
    if (didPan.current) {
      didPan.current = false
      return
    }

    const pt = toImageSpace(e)

    if (calibrating) {
      calibPoints.current = [...calibPoints.current, pt]
      if (calibPoints.current.length === 2) {
        onCalibrationLine(calibPoints.current[0], calibPoints.current[1])
        calibPoints.current = []
      }
      redrawRef.current()
      return
    }

    if (isDrawing) {
      onPointAdd(pt)
    }
  }

  function handleDoubleClick(e) {
    if (!isDrawing) return
    // Count zones finish with the button only — double-click adds 2 extra items
    if (activeZone?.measurement_type === 'count') return
    e.preventDefault()
    onZoneComplete()
  }

  // ── Cursor ───────────────────────────────────────────────────────────────────
  const cursor = calibrating ? 'crosshair'
    : isDrawing ? 'crosshair'
    : isDragging ? 'grabbing'
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
        onMouseLeave={handleMouseLeave}
        onContextMenu={e => e.preventDefault()}
      />
      {!imageUrl && (
        <div className={styles.placeholder}>
          Upload a blueprint to begin
        </div>
      )}
    </div>
  )
})

export default BlueprintCanvas
