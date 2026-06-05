import { useRef, useEffect, useCallback, useState, forwardRef, useImperativeHandle } from 'react'
import { formatLF } from '../../utils/fractions'
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
// It handles mouse events for drawing new zones, pan/zoom navigation, and
// dragging zone labels to reposition them.
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
  onLabelOffsetChange,
  orthoMode = false,
  enabledFeatures = {},
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
  const cursorImgPos = useRef(null) // { x, y } in image space, for rubber-band line

  const calibPoints = useRef([])

  // ── Label drag state ────────────────────────────────────────────────────────
  // Local offsets that haven't been saved to the DB yet. Keyed by zone ID.
  // Values are the TOTAL offset (not delta from saved) — when present, they
  // override zone.label_offset_x/y until the save round-trips.
  const labelOffsetsRef = useRef({})

  // Active label drag. null when not dragging.
  const draggingLabelRef = useRef(null) // { zoneId, startImgX, startImgY, startOx, startOy }
  const didDragLabel = useRef(false)

  // Last resolved (post-overlap) label positions — used for hit testing so the
  // user clicks on the label where it actually appears, not where it would be
  // before overlap resolution.
  const resolvedLabelsRef = useRef([]) // [{ zoneId, x, y }]

  // Snap a point to horizontal/vertical if within 5° of axis from lastPt
  function applyOrthoSnap(lastPt, pt) {
    if (!lastPt) return pt
    const dx = pt.x - lastPt.x
    const dy = pt.y - lastPt.y
    const angle = Math.abs(Math.atan2(dy, dx) * 180 / Math.PI)
    // Within 5° of horizontal (0° or 180°)
    if (angle < 5 || angle > 175) return { x: pt.x, y: lastPt.y }
    // Within 5° of vertical (90°)
    if (Math.abs(angle - 90) < 5) return { x: lastPt.x, y: pt.y }
    return pt
  }

  // ── redraw ───────────────────────────────────────────────────────────────────
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

    // ── 1. Compute label positions for all visible saved zones ───────────────
    const visibleZones = []
    const labelPositions = []

    zones.forEach((zone, i) => {
      if (zone.id === redrawingZoneId) return
      if (hiddenZoneIds?.has(zone.id)) return
      if (!zone.points || zone.points.filter(p => p !== null).length < 2) return

      const pts = zone.points.filter(p => p !== null && p !== undefined)
      const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length
      const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length

      // Use local override if present, otherwise fall back to DB values
      const local = labelOffsetsRef.current[zone.id]
      const ox = local ? local.x : (zone.label_offset_x ?? 0)
      const oy = local ? local.y : (zone.label_offset_y ?? 0)

      const lp = { zoneId: zone.id, x: cx + ox, y: cy + oy, centX: cx, centY: cy }
      labelPositions.push(lp)
      visibleZones.push({ zone, colorIdx: i, lp })
    })

    // ── 2. Resolve label overlaps ────────────────────────────────────────────
    const minDist = 30 / scale
    for (let i = 0; i < labelPositions.length; i++) {
      for (let j = i + 1; j < labelPositions.length; j++) {
        const a = labelPositions[i]
        const b = labelPositions[j]
        const dx = b.x - a.x
        const dy = b.y - a.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < minDist && dist > 0) {
          // Nudge the later label downward
          b.y += minDist - dist + 2 / scale
        } else if (dist === 0) {
          b.y += minDist
        }
      }
    }

    // Store resolved positions for hit testing
    resolvedLabelsRef.current = labelPositions.map(lp => ({
      zoneId: lp.zoneId, x: lp.x, y: lp.y,
    }))

    // ── 3. Draw saved zones with resolved label positions ────────────────────
    visibleZones.forEach(({ zone, colorIdx, lp }) => {
      const color = zone.color ?? ZONE_COLORS[colorIdx % ZONE_COLORS.length]
      drawZone(ctx, zone.points, color, zone.measurement_type, zone.name, zone.result, false,
        zone.description, zone.surface_type, zone.coat_count, zone.ceiling_type,
        lp.x, lp.y, lp.centX, lp.centY)
    })

    // ── 3b. Draw canvas-measured deductions (dashed outline + translucent fill) ──
    const DEDUCT_COLOR = '#1b2426'
    visibleZones.forEach(({ zone }) => {
      if (!Array.isArray(zone.deductions)) return
      zone.deductions.forEach(ded => {
        if ((ded.source || 'manual') !== 'canvas') return
        if (!Array.isArray(ded.points) || ded.points.length < 2) return
        const nonNull = ded.points.filter(p => p !== null && p !== undefined)
        if (nonNull.length < 2) return

        ctx.save()
        const s = transformRef.current.scale

        if (zone.measurement_type === 'SF' && nonNull.length >= 3) {
          // Filled dashed polygon
          ctx.beginPath()
          ctx.moveTo(nonNull[0].x, nonNull[0].y)
          nonNull.slice(1).forEach(p => ctx.lineTo(p.x, p.y))
          ctx.closePath()
          ctx.fillStyle = 'rgba(27, 36, 38, 0.25)'
          ctx.fill()
          ctx.strokeStyle = DEDUCT_COLOR
          ctx.lineWidth = 2 / s
          ctx.setLineDash([6 / s, 4 / s])
          ctx.stroke()
          ctx.setLineDash([])
        } else if (zone.measurement_type === 'LF') {
          // Dashed polyline with null-sentinel segment breaks
          ctx.beginPath()
          let penDown = false
          for (const p of ded.points) {
            if (p === null || p === undefined) { penDown = false }
            else if (!penDown) { ctx.moveTo(p.x, p.y); penDown = true }
            else { ctx.lineTo(p.x, p.y) }
          }
          ctx.strokeStyle = DEDUCT_COLOR
          ctx.lineWidth = 2 / s
          ctx.setLineDash([6 / s, 4 / s])
          ctx.stroke()
          ctx.setLineDash([])
        }

        // Label at centroid
        const label = ded.name ? (ded.name.length > 14 ? ded.name.slice(0, 14) + '…' : ded.name) : ''
        if (label && nonNull.length >= 2) {
          const cx = nonNull.reduce((sum, p) => sum + p.x, 0) / nonNull.length
          const cy = nonNull.reduce((sum, p) => sum + p.y, 0) / nonNull.length
          ctx.font = `${12 / s}px Inter, system-ui, sans-serif`
          ctx.fillStyle = DEDUCT_COLOR
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(label, cx, cy)
        }

        ctx.restore()
      })
    })

    // Draw active (in-progress) zone — includes finished segments + current points
    if (activeZone && activeZone.points && activeZone.points.some(p => p !== null)) {
      const colorIdx = (activeZone.colorIndex ?? zones.length) % ZONE_COLORS.length
      const color = activeZone.color ?? ZONE_COLORS[colorIdx]
      drawZone(ctx, activeZone.points, color, activeZone.measurement_type, '', null, true,
        null, null, null, null, null, null, null, null)
    }

    // Rubber-band line from last placed point to cursor position
    if (isDrawing && cursorImgPos.current && activeZone?.points?.length > 0) {
      const pts = activeZone.points.filter(p => p !== null && p !== undefined)
      if (pts.length > 0 && activeZone.measurement_type !== 'count') {
        const lastPt = pts[pts.length - 1]
        let target = cursorImgPos.current
        if (orthoMode) target = applyOrthoSnap(lastPt, target)
        const colorIdx = (activeZone.colorIndex ?? zones.length) % ZONE_COLORS.length
        const color = activeZone.color ?? ZONE_COLORS[colorIdx]
        ctx.strokeStyle = color
        ctx.globalAlpha = 0.5
        ctx.lineWidth = 2 / scale
        ctx.setLineDash([4 / scale, 4 / scale])
        ctx.beginPath()
        ctx.moveTo(lastPt.x, lastPt.y)
        ctx.lineTo(target.x, target.y)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.globalAlpha = 1
      }
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
  }, [zones, activeZone, calibrating, redrawingZoneId, hiddenZoneIds, isDrawing, orthoMode])

  // Stable ref so effects and event listeners always call the latest redraw
  const redrawRef = useRef(redraw)
  useEffect(() => { redrawRef.current = redraw }, [redraw])

  // ── Expose resetView to parent ───────────────────────────────────────────────
  useImperativeHandle(ref, () => ({
    resetView() {
      if (initialTransformRef.current) {
        transformRef.current = { ...initialTransformRef.current }
        redrawRef.current()
      }
    },
    getImageDimensions() {
      const img = imageRef.current
      if (img && img.complete) return { width: img.naturalWidth, height: img.naturalHeight }
      return null
    },
  }), [])

  // ── Image loading ────────────────────────────────────────────────────────────
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
  }, [imageUrl])

  // Redraw when zones / active zone / calibrating changes
  useEffect(() => {
    redraw()
  }, [redraw])

  // ── Resize ───────────────────────────────────────────────────────────────────
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
  }, [])

  // ── Scroll-wheel zoom ────────────────────────────────────────────────────────
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
  }, [])

  // ── Drawing helpers ──────────────────────────────────────────────────────────

  // Draw a zone's shape (polygon/polyline/point markers) and optionally its label.
  // labelX/labelY: resolved position for the label (null to skip label).
  // centX/centY: the zone centroid (used to draw connector line when label is offset).
  function drawZone(ctx, points, color, type, name, result, isActive,
    description, surfaceType, coatCount, ceilingType, labelX, labelY, centX, centY) {
    if (points.length === 0) return
    ctx.save()

    const nonNullPoints = points.filter(p => p !== null && p !== undefined)

    // Fill for SF zones
    if (type === 'SF' && nonNullPoints.length >= 3) {
      ctx.beginPath()
      ctx.moveTo(nonNullPoints[0].x, nonNullPoints[0].y)
      nonNullPoints.slice(1).forEach(p => ctx.lineTo(p.x, p.y))
      ctx.closePath()
      ctx.fillStyle = color + (isActive ? '28' : '22')
      ctx.fill()
    }

    // Stroke — null sentinels lift the pen for multi-segment zones
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

    // Point markers
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

    // ── Label for completed zones ────────────────────────────────────────────
    if (!isActive && name && nonNullPoints.length >= 1 && labelX != null && labelY != null) {
      const s = transformRef.current.scale

      // Connector line from centroid to label when offset
      if (centX != null && centY != null) {
        const connDist = Math.sqrt((labelX - centX) ** 2 + (labelY - centY) ** 2) * s
        if (connDist > 8) {
          ctx.strokeStyle = color
          ctx.globalAlpha = 0.3
          ctx.lineWidth = 1 / s
          ctx.setLineDash([3 / s, 2 / s])
          ctx.beginPath()
          ctx.moveTo(centX, centY)
          ctx.lineTo(labelX, labelY)
          ctx.stroke()
          ctx.setLineDash([])
          ctx.globalAlpha = 1
        }
      }

      const labelParts = [name]
      if (description) labelParts.push(description)
      const surfaceLabel = (surfaceType === 'Ceiling' && ceilingType && CEILING_TYPE_LABELS[ceilingType])
        ? `${surfaceType} · ${CEILING_TYPE_LABELS[ceilingType]}`
        : surfaceType || null
      const metaParts = [
        surfaceLabel,
        enabledFeatures.paint_calculator && coatCount > 1 ? `${coatCount} coats` : null,
      ].filter(Boolean)
      if (metaParts.length > 0) labelParts.push(metaParts.join(' · '))
      if (result != null) {
        if (type === 'SF') {
          labelParts.push(`${result >= 10 ? Math.round(result) : result.toFixed(1)} SF`)
        } else if (type === 'count') {
          labelParts.push(`${Math.round(result)} each`)
        } else if (type === 'LF') {
          labelParts.push(formatLF(result))
        } else {
          labelParts.push(`${result} ${type}`)
        }
      }
      const lines = labelParts
      const fs = 13 / s
      ctx.font = `bold ${fs}px Inter, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const lineH = fs * 1.3
      const maxW = Math.max(...lines.map(l => ctx.measureText(l).width))
      const padX = 8 / s
      const padY = 5 / s
      const totalH = lines.length * lineH + 2 * padY
      ctx.fillStyle = 'rgba(15,25,35,0.82)'
      const rx = 4 / s
      roundRect(ctx, labelX - maxW / 2 - padX, labelY - totalH / 2, maxW + 2 * padX, totalH, rx)
      ctx.fill()
      lines.forEach((line, i) => {
        ctx.fillStyle = i === 0 ? '#e8edf2' : color
        ctx.fillText(line, labelX, labelY + (i - (lines.length - 1) / 2) * lineH)
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

  // Convert screen coordinates to image-space coordinates
  function toImageSpace(e) {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const { scale, offsetX, offsetY } = transformRef.current
    return {
      x: (e.clientX - rect.left - offsetX) / scale,
      y: (e.clientY - rect.top - offsetY) / scale,
    }
  }

  // Check if an image-space point is within 20 screen-px of any zone label.
  // Uses the last resolved (post-overlap) positions so the hit area matches
  // what the user sees on screen.
  function findLabelHit(imgPt) {
    const threshold = 20 / transformRef.current.scale
    const resolved = resolvedLabelsRef.current
    // Check in reverse order so topmost (last drawn) labels are hit first
    for (let i = resolved.length - 1; i >= 0; i--) {
      const lp = resolved[i]
      const dx = imgPt.x - lp.x
      const dy = imgPt.y - lp.y
      if (Math.sqrt(dx * dx + dy * dy) <= threshold) {
        return zones.find(z => z.id === lp.zoneId) ?? null
      }
    }
    return null
  }

  // ── Mouse event handlers ─────────────────────────────────────────────────────

  function handleMouseDown(e) {
    if (e.button === 2) {
      isRightPanning.current = true
      lastRightPan.current = { x: e.clientX, y: e.clientY }
      setIsDragging(true)
      return
    }
    if (e.button !== 0) return

    // In drawing or calibrating mode, left-click places points — no label drag or pan
    if (isDrawing || calibrating) return

    // Check if the click is on a zone label
    const pt = toImageSpace(e)
    const hitZone = findLabelHit(pt)
    if (hitZone) {
      const local = labelOffsetsRef.current[hitZone.id]
      const currentOx = local ? local.x : (hitZone.label_offset_x ?? 0)
      const currentOy = local ? local.y : (hitZone.label_offset_y ?? 0)
      draggingLabelRef.current = {
        zoneId: hitZone.id,
        startImgX: pt.x,
        startImgY: pt.y,
        startOx: currentOx,
        startOy: currentOy,
      }
      didDragLabel.current = false
      setIsDragging(true)
      return
    }

    // Regular left-click pan
    isPanning.current = true
    didPan.current = false
    lastPan.current = { x: e.clientX, y: e.clientY }
    panStart.current = { x: e.clientX, y: e.clientY }
  }

  function handleMouseMove(e) {
    // Track cursor for rubber-band line during drawing
    if (isDrawing) {
      cursorImgPos.current = toImageSpace(e)
      redrawRef.current()
    }

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

    // Label drag — update offset and redraw
    if (draggingLabelRef.current) {
      const pt = toImageSpace(e)
      const d = draggingLabelRef.current
      didDragLabel.current = true
      labelOffsetsRef.current = {
        ...labelOffsetsRef.current,
        [d.zoneId]: {
          x: d.startOx + (pt.x - d.startImgX),
          y: d.startOy + (pt.y - d.startImgY),
        },
      }
      redrawRef.current()
      return
    }

    // Hard-block left-click panning during draw or calibration — prevents race
    // conditions where isPanning.current got set from a prior interaction
    if (isDrawing || calibrating) {
      isPanning.current = false
      return
    }

    if (!isPanning.current) return

    const dx = e.clientX - lastPan.current.x
    const dy = e.clientY - lastPan.current.y

    const totalDx = e.clientX - panStart.current.x
    const totalDy = e.clientY - panStart.current.y
    if (!didPan.current && Math.sqrt(totalDx * totalDx + totalDy * totalDy) > 4) {
      didPan.current = true
      setIsDragging(true)
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

    // Finish label drag — auto-save offset to DB
    if (draggingLabelRef.current) {
      if (didDragLabel.current) {
        const d = draggingLabelRef.current
        const offset = labelOffsetsRef.current[d.zoneId]
        if (offset) {
          onLabelOffsetChange?.(d.zoneId, offset.x, offset.y)
        }
      }
      draggingLabelRef.current = null
      didDragLabel.current = false
      setIsDragging(false)
      return
    }

    isPanning.current = false
    if (isDragging) setIsDragging(false)
  }

  function handleMouseLeave() {
    cursorImgPos.current = null
    // Save and stop any label drag in progress
    if (draggingLabelRef.current) {
      if (didDragLabel.current) {
        const d = draggingLabelRef.current
        const offset = labelOffsetsRef.current[d.zoneId]
        if (offset) {
          onLabelOffsetChange?.(d.zoneId, offset.x, offset.y)
        }
      }
      draggingLabelRef.current = null
      didDragLabel.current = false
      setIsDragging(false)
    }
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
    // Eat the click after a drag (pan or label) so it doesn't place a point
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
      // Apply ortho snap unless Shift is held
      if (orthoMode && !e.shiftKey && activeZone?.measurement_type !== 'count') {
        const activePts = activeZone?.points?.filter(p => p !== null && p !== undefined) ?? []
        if (activePts.length > 0) {
          const snapped = applyOrthoSnap(activePts[activePts.length - 1], pt)
          onPointAdd(snapped)
          return
        }
      }
      onPointAdd(pt)
    }
  }

  function handleDoubleClick(e) {
    if (!isDrawing) return
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
