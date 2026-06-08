// Utilities for converting between decimal feet and feet-inches-fractions display.
// All internal calculations use decimal feet throughout the app; these functions
// handle only the presentation and input-parsing layer.

// ── Unicode fraction characters for common 1/8-inch values ────────────────────
const FRAC_CHARS = {
  '1/8': '⅛', '1/4': '¼', '3/8': '⅜',
  '1/2': '½', '5/8': '⅝', '3/4': '¾', '7/8': '⅞',
}

function gcd(a, b) { return b === 0 ? a : gcd(b, a % b) }

// Parse an inch string that may include a fraction: "6", "6.5", "6-1/2", "6 1/2", "1/2"
function parseInchStr(s) {
  s = s.trim()
  if (!s) return 0

  // "6-1/2" or "6 1/2" (whole inches + fraction of an inch)
  const mixed = s.match(/^(\d+(?:\.\d+)?)\s*[-\s]\s*(\d+)\/(\d+)$/)
  if (mixed) {
    const den = parseInt(mixed[3])
    if (den === 0) return null
    return parseFloat(mixed[1]) + parseInt(mixed[2]) / den
  }

  // pure fraction: "1/2"
  const frac = s.match(/^(\d+)\/(\d+)$/)
  if (frac) {
    const den = parseInt(frac[2])
    if (den === 0) return null
    return parseInt(frac[1]) / den
  }

  // plain number: "6" or "6.5"
  if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s)

  return null
}

// ── parseFeetInches ────────────────────────────────────────────────────────────
// Accepts a wide range of contractor-friendly input formats and returns decimal feet.
// Returns null if the string cannot be parsed.
//
// Supported formats:
//   "12"          → 12 ft
//   "12.5"        → 12.5 ft
//   "12'"         → 12 ft
//   "12'6"        → 12.5 ft  (trailing " optional)
//   "12'6\""      → 12.5 ft
//   "12' 6\""     → 12.5 ft
//   "12'6-1/2\""  → 12.542 ft
//   "12'6 1/2\""  → 12.542 ft
//   "6\""         → 0.5 ft   (inch-only, e.g. for drop depth)
//   "6-1/2\""     → 0.542 ft
//   "12 6"        → 12.5 ft  (space-sep: feet then inches)
//   "12 6 1/2"    → 12.542 ft
//   "12 1/2"      → 12.5 ft  (feet then fraction-of-a-foot)
//   "6 1/2"       → 6.5 ft   (same rule: integer + fraction = feet + fraction-of-foot)
//   "1/2"         → 0.5 ft
export function parseFeetInches(str) {
  if (str == null) return null
  const s = String(str).trim()
  if (!s) return null

  // ── 1. Explicit foot marker ─────────────────────────────────────────────────
  // Matches: 12', 12'6, 12' 6, 12'6", 12'6-1/2", 12' 6 1/2"
  const feetMatch = s.match(/^(\d+(?:\.\d+)?)\s*'(.*)$/)
  if (feetMatch) {
    const feet = parseFloat(feetMatch[1])
    const rest = feetMatch[2].replace(/"$/, '').trim() // strip optional trailing "
    if (!rest) return feet
    const inches = parseInchStr(rest)
    if (inches === null) return null
    return feet + inches / 12
  }

  // ── 2. Inch-only (ends with ") ─────────────────────────────────────────────
  // Matches: 6", 6-1/2", 6 1/2"
  if (s.endsWith('"')) {
    const inches = parseInchStr(s.slice(0, -1))
    if (inches === null) return null
    return inches / 12
  }

  // ── 3. Plain decimal or integer (feet) ─────────────────────────────────────
  if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s)

  // ── 4. Plain fraction: "1/2" → 0.5 ft ─────────────────────────────────────
  const fracOnly = s.match(/^(\d+)\/(\d+)$/)
  if (fracOnly) {
    const den = parseInt(fracOnly[2])
    return den === 0 ? null : parseInt(fracOnly[1]) / den
  }

  // ── 5. Space-separated (no markers) ────────────────────────────────────────
  const tokens = s.split(/\s+/)

  if (tokens.length === 2) {
    const [a, b] = tokens
    if (!/^\d+(\.\d+)?$/.test(a)) return null
    const feet = parseFloat(a)

    // Second token is a fraction → treat as fraction of a foot: "12 1/2" = 12.5 ft
    if (/^\d+\/\d+$/.test(b)) {
      const [num, den] = b.split('/').map(Number)
      return den === 0 ? null : feet + num / den
    }
    // Second token is a whole number → treat as inches: "12 6" = 12 ft 6 in
    if (/^\d+(\.\d+)?$/.test(b)) return feet + parseFloat(b) / 12
    return null
  }

  if (tokens.length === 3) {
    // "12 6 1/2" → 12 ft, 6-and-a-half inches
    const [a, b, c] = tokens
    if (!/^\d+(\.\d+)?$/.test(a) || !/^\d+(\.\d+)?$/.test(b) || !/^\d+\/\d+$/.test(c)) return null
    const [num, den] = c.split('/').map(Number)
    if (den === 0) return null
    return parseFloat(a) + (parseFloat(b) + num / den) / 12
  }

  return null
}

// ── formatFeetInches ───────────────────────────────────────────────────────────
// Converts decimal feet to a human-readable feet-inches-fractions string.
// Rounds to the nearest 1/8 inch. Uses unicode fraction characters where possible.
//
// Examples:
//   12.5    → "12' 6""
//   12.5417 → "12' 6½""
//   8       → "8'"
//   0.5     → "0' 6""
export function formatFeetInches(decimalFeet) {
  if (decimalFeet == null || isNaN(decimalFeet)) return '—'
  if (decimalFeet < 0) decimalFeet = 0

  // Work in 1/8-inch steps — 1 foot = 12 inches × 8 eighths = 96 units
  const totalEighths = Math.round(decimalFeet * 96)
  const wholeFeet    = Math.floor(totalEighths / 96)
  const remain       = totalEighths - wholeFeet * 96
  const wholeInches  = Math.floor(remain / 8)
  const fracEighths  = remain % 8 // 0–7

  let fracStr = ''
  if (fracEighths !== 0) {
    const g   = gcd(fracEighths, 8)
    const num = fracEighths / g
    const den = 8 / g
    fracStr = FRAC_CHARS[`${num}/${den}`] ?? `${num}/${den}`
  }

  if (wholeInches === 0 && !fracStr) return `${wholeFeet}'`
  if (!fracStr)                       return `${wholeFeet}' ${wholeInches}"`
  return `${wholeFeet}' ${wholeInches}${fracStr}"`
}

// ── formatSF ──────────────────────────────────────────────────────────────────
// Precise 2-decimal display with trailing-zero trimming.
// 159.55 → "159.55 sq ft", 250 → "250 sq ft", 9.10 → "9.1 sq ft"
export function formatSF(decimalSF) {
  if (decimalSF == null || isNaN(decimalSF)) return '—'
  // toFixed(2) then strip unnecessary trailing zeros / decimal point
  const num = parseFloat(decimalSF.toFixed(2))
  return `${num} sq ft`
}

// Precise decimal SF for exports (CSV, PDF) — preserves 2 decimal places
export function formatSFPrecise(decimalSF) {
  if (decimalSF == null || isNaN(decimalSF)) return '—'
  return `${decimalSF.toFixed(2)} sq ft`
}

// ── formatLF ──────────────────────────────────────────────────────────────────
// Linear footage in feet-inches-fractions format.
// Example: 12.5417 → "12' 6½""
export function formatLF(decimalFeet) {
  if (decimalFeet == null || isNaN(decimalFeet)) return '—'
  return formatFeetInches(decimalFeet)
}
