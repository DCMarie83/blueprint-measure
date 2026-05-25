const HEX6_RE = /^#([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})$/
const HEX3_RE = /^#([0-9A-Fa-f])([0-9A-Fa-f])([0-9A-Fa-f])$/

export function hexToRgb(hex) {
  if (!hex || typeof hex !== 'string') return null
  let match = hex.match(HEX6_RE)
  if (match) return [parseInt(match[1], 16), parseInt(match[2], 16), parseInt(match[3], 16)]
  match = hex.match(HEX3_RE)
  if (match) return [parseInt(match[1] + match[1], 16), parseInt(match[2] + match[2], 16), parseInt(match[3] + match[3], 16)]
  return null
}

export function normalizedPrimary(hex, fallback = '#f27243') {
  if (hex && typeof hex === 'string' && HEX6_RE.test(hex)) return hex
  if (hex && typeof hex === 'string' && HEX3_RE.test(hex)) return hex
  return fallback
}
