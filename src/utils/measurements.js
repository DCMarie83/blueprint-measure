// All measurement math lives here.
// pixelsPerFoot = how many canvas pixels equal one real-world foot.

// Human-readable labels for ceiling types (used in labels and UI)
export const CEILING_TYPE_LABELS = {
  flat: 'Flat',
  vaulted: 'Vaulted',
  tray: 'Tray',
  shed: 'Shed',
}

// Distance between two canvas points in pixels
function dist(a, b) {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2)
}

// Shoelace formula — area of a polygon defined by an array of {x, y} points
function polygonAreaPixels(points) {
  const n = points.length
  if (n < 3) return 0
  let area = 0
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    area += points[i].x * points[j].y
    area -= points[j].x * points[i].y
  }
  return Math.abs(area) / 2
}

// Total perimeter of a polygon
function polygonPerimeterPixels(points) {
  const n = points.length
  if (n < 2) return 0
  let perim = 0
  for (let i = 0; i < n; i++) {
    perim += dist(points[i], points[(i + 1) % n])
  }
  return perim
}

// Total length of an open polyline (LF measurement)
function polylineLength(points) {
  let total = 0
  for (let i = 0; i < points.length - 1; i++) {
    total += dist(points[i], points[i + 1])
  }
  return total
}

// Split a points array at null sentinels — used for multi-segment LF/count zones.
// A null entry in the array marks the boundary between two disconnected segments.
// Single-segment zones (all legacy zones) have no nulls and return [allPoints].
function splitSegments(points) {
  const segs = []
  let current = []
  for (const p of points) {
    if (p === null || p === undefined) {
      if (current.length > 0) { segs.push(current); current = [] }
    } else {
      current.push(p)
    }
  }
  if (current.length > 0) segs.push(current)
  return segs.length > 0 ? segs : [points]
}

// ---- Public API ----

// Apply deduction objects to a gross value. Returns net clamped at 0, rounded to 2 decimals.
// Safe to call unconditionally — returns grossValue unchanged when deductions is empty/missing.
export function applyDeductions(grossValue, deductions) {
  if (!Array.isArray(deductions) || deductions.length === 0) return grossValue
  const totalDeducted = deductions.reduce(
    (sum, d) => sum + (Number(d?.value) || 0),
    0
  )
  return Math.max(0, +(grossValue - totalDeducted).toFixed(2))
}

export function calculateSF(points, pixelsPerFoot) {
  const areaPixels = polygonAreaPixels(points)
  const feetPerPixel = 1 / pixelsPerFoot
  const areaFeet = areaPixels * feetPerPixel * feetPerPixel
  return Math.round(areaFeet * 100) / 100
}

// calculateLF supports multi-segment zones: sum the length of every segment,
// where segments are separated by null sentinels in the points array.
export function calculateLF(points, pixelsPerFoot) {
  const segs = splitSegments(points)
  const totalPixels = segs.reduce((sum, seg) => sum + polylineLength(seg), 0)
  return Math.round(totalPixels / pixelsPerFoot * 100) / 100
}

// Count is the number of non-null points (nulls are segment separators).
export function calculateCount(points) {
  return points.filter(p => p !== null && p !== undefined).length
}

// Bounding box of a point array, in feet.
// Used by ceiling calculations to derive room width/length from the drawn polygon.
function bboxFeet(points, pixelsPerFoot) {
  if (!points || points.length < 1) return { width: 0, length: 0 }
  const xs = points.map(p => p.x)
  const ys = points.map(p => p.y)
  return {
    width:  (Math.max(...xs) - Math.min(...xs)) / pixelsPerFoot,
    length: (Math.max(...ys) - Math.min(...ys)) / pixelsPerFoot,
  }
}

// Calculate sloped surface area from a flat footprint + pitch rise (X/12).
// Formula: slopedSF = footprintSF * sqrt(rise^2 + 12^2) / 12
export function calculateSlopedSF(footprintSF, pitchRise) {
  if (!pitchRise || pitchRise <= 0) return footprintSF
  const multiplier = Math.sqrt(pitchRise * pitchRise + 144) / 12
  return Math.round(footprintSF * multiplier * 100) / 100
}

// Adjust ceiling SF based on ceiling type.
// Returns { adjustedSF, adjustment } where:
//   adjustedSF = the final result to store on the zone
//   adjustment = how much was added/changed vs the flat footprint
//
// ceilingType: 'flat' | 'vaulted' | 'tray' | 'shed'
// params: { peakHeight, wallHeight, trayPerimeter, dropDepth, lowWallHeight, highWallHeight }
// points / pixelsPerFoot: the drawn polygon (used to derive room width + length)
export function calculateCeilingSF(baseSF, ceilingType, params, points, pixelsPerFoot) {
  if (!ceilingType || ceilingType === 'flat') {
    return { adjustedSF: baseSF, adjustment: 0 }
  }

  // Pitch-based calculation takes priority over height-based for vaulted/shed
  const { pitchRise } = params
  if (pitchRise && pitchRise > 0 && (ceilingType === 'vaulted' || ceilingType === 'shed')) {
    const adjustedSF = calculateSlopedSF(baseSF, pitchRise)
    return { adjustedSF, adjustment: Math.round((adjustedSF - baseSF) * 100) / 100 }
  }

  const { width, length } = bboxFeet(points, pixelsPerFoot)

  if (ceilingType === 'vaulted') {
    const { peakHeight = 0, wallHeight = 0 } = params
    const rise = peakHeight - wallHeight
    if (rise <= 0 || width <= 0 || length <= 0) return { adjustedSF: baseSF, adjustment: 0 }
    const slopeLength = Math.sqrt((width / 2) ** 2 + rise ** 2)
    const adjustedSF  = Math.round(2 * slopeLength * length * 100) / 100
    return { adjustedSF, adjustment: Math.round((adjustedSF - baseSF) * 100) / 100 }
  }

  if (ceilingType === 'tray') {
    const { trayPerimeter = 0, dropDepth = 0 } = params
    if (trayPerimeter <= 0 || dropDepth <= 0) return { adjustedSF: baseSF, adjustment: 0 }
    const dropFt     = dropDepth               // stored in feet (matches all other heights)
    const additional = Math.round(trayPerimeter * dropFt * 100) / 100
    return { adjustedSF: Math.round((baseSF + additional) * 100) / 100, adjustment: additional }
  }

  if (ceilingType === 'shed') {
    const { lowWallHeight = 0, highWallHeight = 0 } = params
    const rise = highWallHeight - lowWallHeight
    if (rise <= 0 || width <= 0 || length <= 0) return { adjustedSF: baseSF, adjustment: 0 }
    // Slope runs across the full width (not half like a vault)
    const slopeLength = Math.sqrt(width ** 2 + rise ** 2)
    const adjustedSF  = Math.round(slopeLength * length * 100) / 100
    return { adjustedSF, adjustment: Math.round((adjustedSF - baseSF) * 100) / 100 }
  }

  return { adjustedSF: baseSF, adjustment: 0 }
}

// Raw (unrounded) paint gallons for one SF zone. Internal helper so that
// estimateMaterials can sum raw gallons across a group and round ONCE,
// instead of rounding per-zone (which over-buys).
// Coverage fixed at 350 SF/gal (smooth). Finish and coats are pricing concerns
// owned by the estimate builder / Gridiron. Per-trade coverage lands in the
// Materials Depth build.
function rawPaintGallons(zone) {
  if (zone.measurement_type !== 'SF' || !zone.result || Number(zone.result) <= 0) return 0
  return Number(zone.result) / 350
}

// Deterministic material quantity estimator. Produces suggested material line
// items with QUANTITIES only — the reliable, no-AI baseline. Tiered products and
// costs (product_*/cost_*) are left null here; the AI step or manual entry fills them.
//
// zones: raw zone rows for a job (from session_id -> sessions.project_id).
// options.vertical: trade vertical. Only 'paint' is implemented; the switch is
//   structure-ready for other trades (flooring/roofing) when they go live.
// options.defaultOverage: starting overage_pct for each suggested line (default 0).
export function estimateMaterials(zones, options = {}) {
  const { vertical = 'paint', defaultOverage = 0 } = options
  if (!Array.isArray(zones) || zones.length === 0) return []
  switch (vertical) {
    case 'paint':
      return estimatePaintMaterials(zones, defaultOverage)
    // TODO: 'flooring', 'roofing', etc. — implement when those verticals are live.
    default:
      return []
  }
}

function estimatePaintMaterials(zones, defaultOverage) {
  const paintZones = zones.filter(z => z.measurement_type === 'SF' && Number(z.result) > 0)
  if (paintZones.length === 0) return []

  // Group by surface_type (wall vs ceiling).
  const groups = new Map()
  for (const z of paintZones) {
    const surfaceType = z.surface_type || 'Surface'
    if (!groups.has(surfaceType)) groups.set(surfaceType, { surfaceType, zones: [], rawGallons: 0 })
    const g = groups.get(surfaceType)
    g.zones.push(z)
    g.rawGallons += rawPaintGallons(z)
  }

  const lines = []
  for (const g of groups.values()) {
    if (g.rawGallons <= 0) continue
    const gallons = Math.ceil(g.rawGallons * 4) / 4 // round the GROUP total up to 0.25
    lines.push({
      description: `${g.surfaceType} paint`,
      unit: 'gallon',
      quantity: gallons,
      overage_pct: defaultOverage,
      source_zone_name: sourceSummary(g.zones),
      ai_suggested: false,
      product_good: null,
      product_better: null,
      product_best: null,
      cost_good: null,
      cost_better: null,
      cost_best: null,
    })
  }
  return lines.sort((a, b) => a.description.localeCompare(b.description))
}

function sourceSummary(zones) {
  const names = zones.map(z => z.name).filter(Boolean)
  if (names.length === 0) return `${zones.length} ${zones.length === 1 ? 'zone' : 'zones'}`
  if (names.length <= 3) return names.join(', ')
  return `${names.slice(0, 2).join(', ')} +${names.length - 2} more`
}

// Returns the maximum height a painter needs to reach for vaulted or shed ceilings.
// Vaulted → peak height is the highest point.
// Shed    → high wall height is the highest point.
// All other ceiling types (flat, tray) or non-ceiling zones → null.
export function getMaxReach(zone) {
  if (zone.ceiling_type === 'vaulted' && zone.ceiling_peak_height > 0) {
    return zone.ceiling_peak_height
  }
  if (zone.ceiling_type === 'shed' && zone.ceiling_high_wall_height > 0) {
    return zone.ceiling_high_wall_height
  }
  return null
}

// Perimeter of a closed polygon in feet. Used by the wall measurement mode
// to derive total linear wall footage from the floor plan trace.
export function calculatePerimeterLF(points, pixelsPerFoot) {
  const perimPixels = polygonPerimeterPixels(points)
  return Math.round(perimPixels / pixelsPerFoot * 100) / 100
}

// Calculate paintable wall surface area from a floor plan polygon.
// wallHeight is in decimal feet. openingDeductions is [{name, sf}, …].
// Returns { perimeterLF, grossWallSF, totalDeductions, netWallSF }.
export function calculateWallSF(points, pixelsPerFoot, wallHeight, openingDeductions) {
  const perimeterLF = calculatePerimeterLF(points, pixelsPerFoot)
  const grossWallSF = Math.round(perimeterLF * wallHeight * 100) / 100
  const totalDeductions = (openingDeductions ?? []).reduce((s, o) => s + (o.sf ?? 0), 0)
  const netWallSF = Math.round(Math.max(0, grossWallSF - totalDeductions) * 100) / 100
  return { perimeterLF, grossWallSF, totalDeductions, netWallSF }
}

// Master function — picks the right formula based on type
export function calculate(measurementType, points, pixelsPerFoot) {
  if (!points || points.length === 0) return 0
  switch (measurementType) {
    case 'SF':    return calculateSF(points, pixelsPerFoot)
    case 'LF':    return calculateLF(points, pixelsPerFoot)
    case 'count': return calculateCount(points)
    default:      return 0
  }
}

// Recalculate a zone's result (and dependent fields) using a new pixelsPerFoot.
// Returns a new zone object with updated numeric fields. Does NOT mutate input.
export function rescaleZone(zone, newPPF) {
  if (!zone.points || zone.points.length === 0 || !newPPF) return zone
  if (zone.measurement_type === 'count') return zone

  const updates = { ...zone }

  if (zone.measurement_type === 'LF') {
    const gross = calculateLF(zone.points, newPPF)
    const deductions = zone.deductions
    if (Array.isArray(deductions) && deductions.length > 0 && zone.surface_type !== 'Wall') {
      const rescaledDeds = rescaleDeductions(deductions, zone.measurement_type, newPPF)
      updates.deductions = rescaledDeds
      updates.gross_result = gross
      updates.result = applyDeductions(gross, rescaledDeds)
    } else {
      updates.result = gross
      updates.gross_result = null
    }
    return updates
  }

  // SF zone — base footprint
  let result = calculateSF(zone.points, newPPF)

  // Ceiling adjustment (pitch or height-based)
  if (zone.surface_type === 'Ceiling' && zone.ceiling_type && zone.ceiling_type !== 'flat') {
    const { adjustedSF } = calculateCeilingSF(result, zone.ceiling_type, {
      pitchRise:     zone.ceiling_pitch_rise ?? 0,
      peakHeight:    zone.ceiling_peak_height ?? 0,
      wallHeight:    zone.ceiling_wall_height ?? 0,
      trayPerimeter: zone.ceiling_tray_perimeter ?? 0,
      dropDepth:     zone.ceiling_drop_depth ?? 0,
      lowWallHeight:  zone.ceiling_low_wall_height ?? 0,
      highWallHeight: zone.ceiling_high_wall_height ?? 0,
    }, zone.points, newPPF)
    result = adjustedSF
  }

  // Wall adjustment
  if (zone.wall_height && zone.surface_type === 'Wall') {
    const { grossWallSF, netWallSF } = calculateWallSF(
      zone.points, newPPF, zone.wall_height, zone.opening_deductions
    )
    updates.gross_wall_sf = grossWallSF
    updates.net_wall_sf = netWallSF
    result = netWallSF
  }

  // General deductions for non-wall SF zones
  const deductions = zone.deductions
  if (Array.isArray(deductions) && deductions.length > 0 && zone.surface_type !== 'Wall') {
    const rescaledDeds = rescaleDeductions(deductions, zone.measurement_type, newPPF)
    updates.deductions = rescaledDeds
    updates.gross_result = result
    updates.result = applyDeductions(result, rescaledDeds)
  } else {
    updates.result = result
    updates.gross_result = null
  }
  return updates
}

// Recompute canvas-measured deduction values using a new pixelsPerFoot.
// Manual deductions pass through unchanged (their values are scale-independent).
function rescaleDeductions(deductions, measurementType, newPPF) {
  return deductions.map(d => {
    if ((d.source || 'manual') === 'canvas' && Array.isArray(d.points)) {
      return { ...d, value: calculate(measurementType, d.points, newPPF) }
    }
    return d
  })
}
