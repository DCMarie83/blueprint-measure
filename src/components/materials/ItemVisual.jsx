import { useState, useEffect } from 'react'
import { PaintBucket, Scissors, Layers, Paintbrush, Pipette, Package } from 'lucide-react'

// Per-slug icon overrides for common sundries. Only icons present in
// lucide-react 0.383 are used. Slugs not listed fall back to the rule default.
const ICON_MAP = {
  'tape-painters': Scissors,
  'plastic-sheeting': Layers,
  'masking-paper': Layers,
  'roller-cover': Paintbrush,
  'caulk-paintable': Pipette,
}

// Real category grouping for the editor: taxonomy_slug -> section name. Sections
// render in CATEGORY_ORDER; anything unmapped or slug-less lands in "Other Items".
export const CATEGORY_ORDER = [
  'Paint & Primer',
  'Prep & Patch',
  'Masking & Protection',
  'Application Tools',
  'Other Items',
]

const SLUG_CATEGORY = {
  'paint-wall-interior': 'Paint & Primer',
  'paint-ceiling-interior': 'Paint & Primer',
  'primer-interior': 'Paint & Primer',
  'cleaner-tsp': 'Prep & Patch',
  'sandpaper-220': 'Prep & Patch',
  'spackle-lightweight': 'Prep & Patch',
  'caulk-paintable': 'Prep & Patch',
  'tape-painters': 'Masking & Protection',
  'masking-paper': 'Masking & Protection',
  'plastic-sheeting': 'Masking & Protection',
  'drop-cloth-canvas': 'Masking & Protection',
  'roller-cover-38': 'Application Tools',
  'roller-frame': 'Application Tools',
  'brush-25-angle': 'Application Tools',
  'tray-kit': 'Application Tools',
  'extension-pole': 'Application Tools',
}

export function categoryForSlug(slug) {
  return (slug && SLUG_CATEGORY[slug]) || 'Other Items'
}

function iconFor(slug, rule) {
  if (slug && ICON_MAP[slug]) return ICON_MAP[slug]
  if (rule === 'coverage') return PaintBucket
  if (rule === 'per_area') return Layers
  if (rule === 'per_job') return Package
  return Package // manual / unknown
}

// Background tint + icon color by quantity rule (brand category color system).
function tintFor(rule) {
  if (rule === 'coverage') return { bg: 'rgba(38,70,76,0.12)', color: '#26464C' }
  if (rule === 'per_area') return { bg: 'rgba(242,114,67,0.14)', color: '#F27243' }
  if (rule === 'per_job') return { bg: 'rgba(27,36,38,0.08)', color: '#1B2426' }
  return { bg: 'var(--color-surface-2, #eef0f0)', color: '#1B2426' }
}

// A product thumbnail (when imageUrl exists and loads) or a category icon tile.
// A broken/failed image falls back to the icon tile — same dimensions, no shift.
export default function ItemVisual({ imageUrl, taxonomySlug, quantityRule, size = 40 }) {
  const [errored, setErrored] = useState(false)
  // Reset on URL change so a corrected imageUrl recovers from a prior failure.
  useEffect(() => { setErrored(false) }, [imageUrl])

  const box = { width: size, height: size, borderRadius: 8, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }

  if (imageUrl && !errored) {
    return (
      <span style={{ ...box, background: '#fff', border: '1px solid var(--color-border)' }}>
        <img src={imageUrl} alt="" onError={() => setErrored(true)} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      </span>
    )
  }

  const Icon = iconFor(taxonomySlug, quantityRule)
  const tint = tintFor(quantityRule)
  return (
    <span style={{ ...box, background: tint.bg, color: tint.color }}>
      <Icon size={Math.round(size * 0.5)} />
    </span>
  )
}
