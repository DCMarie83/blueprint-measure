// All measurement math lives here.
// pixelsPerFoot = how many canvas pixels equal one real-world foot.

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

// ---- Public API ----

export function calculateSF(points, pixelsPerFoot) {
  const areaPixels = polygonAreaPixels(points)
  const feetPerPixel = 1 / pixelsPerFoot
  const areaFeet = areaPixels * feetPerPixel * feetPerPixel
  return Math.round(areaFeet * 100) / 100
}

export function calculateLF(points, pixelsPerFoot) {
  const lengthPixels = polylineLength(points)
  const feet = lengthPixels / pixelsPerFoot
  return Math.round(feet * 100) / 100
}

// Count is just the number of points placed
export function calculateCount(points) {
  return points.length
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
