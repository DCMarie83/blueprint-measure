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

const BAND_DARK = [27, 36, 38] // #1b2426
const BAND_WHITE = [255, 255, 255]

// WCAG 2.x relative luminance of an [r, g, b] color (0 = black, 1 = white).
function relativeLuminance([r, g, b]) {
  const chan = v => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b)
}

/**
 * Header/total band colors for tenant-branded PDFs.
 *
 * A parseable primary hex becomes the band fill, with white text on dark
 * fills (relative luminance <= 0.45) and #1b2426 text on light ones. A null
 * or unparseable primary keeps today's look: #1b2426 fill, white text —
 * deliberately NOT normalizedPrimary's orange fallback, which is reserved
 * for accents.
 *
 * @returns {{ fill: number[], text: number[] }}
 */
export function brandBand(primaryHex) {
  const fill = hexToRgb(primaryHex)
  if (!fill) return { fill: BAND_DARK, text: BAND_WHITE }
  return { fill, text: relativeLuminance(fill) <= 0.45 ? BAND_WHITE : BAND_DARK }
}
