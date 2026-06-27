import { supabase } from '../lib/supabase'

// The exact set of values the edge function returns.
// Keys are what appears in the JSON; values provide the data needed to
// apply the scale via calcPixelsPerFoot.
const DETECTED_SCALE_MAP = {
  '1/8':   { label: "1/8\" = 1'",   inchesPerFoot: 0.125       },
  '3/16':  { label: "3/16\" = 1'",  inchesPerFoot: 0.1875      },
  '1/4':   { label: "1/4\" = 1'",   inchesPerFoot: 0.25        },
  '3/8':   { label: "3/8\" = 1'",   inchesPerFoot: 0.375       },
  '1/2':   { label: "1/2\" = 1'",   inchesPerFoot: 0.5         },
  '3/4':   { label: "3/4\" = 1'",   inchesPerFoot: 0.75        },
  '1':     { label: "1\" = 1'",     inchesPerFoot: 1           },
  '1-1/2': { label: "1-1/2\" = 1'", inchesPerFoot: 1.5         },
  '3':     { label: "3\" = 1'",     inchesPerFoot: 3           },
}

// Convert any URL (including cross-origin Supabase storage URLs) to a base64 data URL
async function toDataUrl(url) {
  if (url.startsWith('data:')) return url
  const resp = await fetch(url)
  const blob = await resp.blob()
  return new Promise((res, rej) => {
    const reader = new FileReader()
    reader.onload = () => res(reader.result)
    reader.onerror = rej
    reader.readAsDataURL(blob)
  })
}

// Split a data URL into { base64Data, mediaType }
function splitDataUrl(dataUrl) {
  const [header, base64Data] = dataUrl.split(',')
  const mediaType = header.match(/data:([^;]+)/)?.[1] ?? 'image/jpeg'
  return { base64Data, mediaType }
}

// ── Scale detection ──────────────────────────────────────────────────────────

// Analyse a blueprint page and return the detected scale.
// Returns { scaleValue, label, inchesPerFoot } or null if not found.
//
// imageUrl may be a data URL (from renderPage) or an https:// URL.
export async function detectScaleFromImage(imageUrl) {
  const dataUrl = await toDataUrl(imageUrl)
  const { base64Data, mediaType } = splitDataUrl(dataUrl)

  const { data, error } = await supabase.functions.invoke('detect-scale', {
    body: { action: 'detect', imageBase64: base64Data, mediaType },
  })

  if (error) {
    console.error('Scale detection edge function error:', error)
    return null
  }

  const scaleValue = data?.scale
  if (!scaleValue) return null

  const entry = DETECTED_SCALE_MAP[scaleValue]
  if (!entry) return null

  return {
    scaleValue,
    label: entry.label,
    inchesPerFoot: entry.inchesPerFoot,
  }
}

// ── Dimension verification ───────────────────────────────────────────────────
// Finds a printed dimension label on the blueprint and cross-checks it against
// the current scale.

export async function verifyScaleWithDimension(imageUrl, pixelsPerFoot) {
  if (!pixelsPerFoot) return null

  const dataUrl = await toDataUrl(imageUrl)
  const { base64Data, mediaType } = splitDataUrl(dataUrl)

  const { data, error } = await supabase.functions.invoke('detect-scale', {
    body: { action: 'verify', imageBase64: base64Data, mediaType, pixelsPerFoot },
  })

  if (error) {
    console.error('Scale verification edge function error:', error)
    return null
  }

  const parsed = data?.result
  if (!parsed?.dimensionText) return null

  const statedFeet = parseFloat(parsed.dimensionFeet)
  if (!statedFeet || isNaN(statedFeet) || statedFeet <= 0) return null

  // Load the image to get its natural width/height for coordinate conversion
  const img = await new Promise((resolve) => {
    const i = new Image()
    i.onload = () => resolve(i)
    i.onerror = () => resolve(null)
    i.src = dataUrl
  })
  if (!img) return null

  const px1 = (parsed.x1 / 100) * img.width
  const py1 = (parsed.y1 / 100) * img.height
  const px2 = (parsed.x2 / 100) * img.width
  const py2 = (parsed.y2 / 100) * img.height

  const pixelDist = Math.sqrt((px2 - px1) ** 2 + (py2 - py1) ** 2)
  if (pixelDist <= 0) return null

  const measuredFeet = Math.round((pixelDist / pixelsPerFoot) * 100) / 100
  const variance = Math.round((Math.abs(measuredFeet - statedFeet) / statedFeet) * 10000) / 100

  return {
    dimensionText: parsed.dimensionText,
    statedFeet,
    measuredFeet,
    variance,
    passes: variance <= 5,
  }
}
