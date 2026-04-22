import Anthropic from '@anthropic-ai/sdk'

// The exact set of values Claude is asked to return.
// Keys are what appears in Claude's JSON; values provide the data needed to
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

const PROMPT = `This is an architectural blueprint. Find any scale notation anywhere on the page including: title block, scale bar, drawing notes, border text, or dimension callouts.

Look for text patterns like:
  - "SCALE: 1/4 inch = 1 foot" or "Scale: 1/4" = 1'-0""
  - "1/4" = 1'-0"" or "1/8" = 1'-0""
  - "Scale 1:48" or "Scale 1:96" (1:48 = 1/4", 1:96 = 1/8")
  - A graphic scale bar with labeled distances in feet
  - Any text containing "SCALE" or "Scale" followed by a ratio
  - Notation in the margins, border, or any corner of the page

Respond with ONLY a valid JSON object, no other text:
{"scale": "<value>"}

The value must be exactly one of:
  1/8   (means 1/8 inch = 1 foot, or 1:96)
  3/16  (means 3/16 inch = 1 foot, or 1:64)
  1/4   (means 1/4 inch = 1 foot, or 1:48)
  3/8   (means 3/8 inch = 1 foot, or 1:32)
  1/2   (means 1/2 inch = 1 foot, or 1:24)
  3/4   (means 3/4 inch = 1 foot, or 1:16)
  1     (means 1 inch = 1 foot, or 1:12)
  1-1/2 (means 1-1/2 inches = 1 foot, or 1:8)
  3     (means 3 inches = 1 foot, or 1:4)
  null  (if absolutely no scale information is found anywhere on the page)

Example responses:
  {"scale": "1/4"}
  {"scale": null}`

// Calls the Anthropic API with the given base64 image and prompt.
// Returns the parsed scale entry or null.
async function callApi(client, base64Data, mediaType, prompt) {
  let text = ''
  try {
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 60,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64Data },
          },
          { type: 'text', text: prompt },
        ],
      }],
    })
    text = msg.content[0]?.text?.trim() ?? ''
  } catch (err) {
    console.error('Anthropic API call failed:', err)
    return null
  }

  let parsed
  try {
    const jsonStr = text.replace(/^```json?\n?/i, '').replace(/\n?```$/, '').trim()
    parsed = JSON.parse(jsonStr)
  } catch {
    console.warn('Scale detection: could not parse response:', text)
    return null
  }

  if (!parsed?.scale) return null

  const entry = DETECTED_SCALE_MAP[parsed.scale]
  if (!entry) return null

  return {
    scaleValue: parsed.scale,
    label:      entry.label,
    inchesPerFoot: entry.inchesPerFoot,
  }
}

// Retry prompt — focuses specifically on scale bars and graphical indicators
// in case the first pass missed text-based notation.
const RETRY_PROMPT = `Look at this blueprint image again very carefully. I need to find the drawing scale.

Check these specific locations:
1. Bottom-right corner (title block area)
2. Bottom-left corner
3. Top-right corner
4. Along the bottom border/margin
5. Next to any graphic scale bar (a ruler-like graphic with marked distances)
6. Near any drawing title that says "FLOOR PLAN" or "PLAN"

If you see a graphic scale bar, read the distances marked on it to determine the scale.

Return ONLY a JSON object: {"scale": "<value>"}
Valid values: 1/8, 3/16, 1/4, 3/8, 1/2, 3/4, 1, 1-1/2, 3, or null.`

// ── Dimension verification ────────────────────────────────────────────────────
// Finds a printed dimension label on the blueprint and cross-checks it against
// the current scale by comparing the label's stated feet with the pixel distance
// between its endpoints converted to feet via pixelsPerFoot.

const VERIFY_PROMPT = `This is an architectural blueprint page. Find one clearly printed dimension label anywhere on the drawing — a measurement like 15'-6", 24'-0", 12'-0", or similar that shows the distance between two identifiable points such as walls, columns, or room boundaries.

Return ONLY a JSON object with these fields:
{
  "dimensionText": "the dimension as printed e.g. 24'-0\\"",
  "dimensionFeet": 24.0,
  "x1": 0, "y1": 0,
  "x2": 0, "y2": 0,
  "confidence": "high"
}

x1,y1 and x2,y2 are the approximate coordinates of the two endpoints of the dimension line as a percentage of image width (0-100) and image height (0-100).
confidence must be "high", "medium", or "low".

Return {"result": null} if no clear dimension label with identifiable endpoints is found.`

// Returns { dimensionText, statedFeet, measuredFeet, variance, passes } or null.
export async function verifyScaleWithDimension(imageUrl, pixelsPerFoot) {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
  if (!apiKey || !pixelsPerFoot) return null

  const dataUrl = await toDataUrl(imageUrl)
  const [header, base64Data] = dataUrl.split(',')
  const mediaType = header.match(/data:([^;]+)/)?.[1] ?? 'image/jpeg'

  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })

  let text = ''
  try {
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } },
          { type: 'text', text: VERIFY_PROMPT },
        ],
      }],
    })
    text = msg.content[0]?.text?.trim() ?? ''
  } catch (err) {
    console.error('Scale verification API call failed:', err)
    return null
  }

  let parsed
  try {
    const jsonStr = text.replace(/^```json?\n?/i, '').replace(/\n?```$/, '').trim()
    parsed = JSON.parse(jsonStr)
  } catch {
    return null
  }

  // API returned null
  if (parsed?.result === null || !parsed?.dimensionText) return null

  // Only trust high or medium confidence
  if (parsed.confidence === 'low') return null

  const statedFeet = parseFloat(parsed.dimensionFeet)
  if (!statedFeet || isNaN(statedFeet) || statedFeet <= 0) return null

  // We need the rendered image dimensions to convert percentage coords to pixels.
  // Load the image to get its natural width/height.
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

// ── Scale detection ──────────────────────────────────────────────────────────

// Analyse a blueprint page and return the detected scale.
// Returns { scaleValue, label, inchesPerFoot } or null if not found.
//
// imageUrl may be a data URL (from renderPage) or an https:// URL.
export async function detectScaleFromImage(imageUrl) {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
  if (!apiKey) {
    console.warn('VITE_ANTHROPIC_API_KEY is not set — scale detection skipped')
    return null
  }

  // Ensure we have a base64 data URL (required by the Anthropic messages API)
  const dataUrl = await toDataUrl(imageUrl)
  const [header, base64Data] = dataUrl.split(',')
  const mediaType = header.match(/data:([^;]+)/)?.[1] ?? 'image/jpeg'

  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })

  // First attempt with the thorough prompt
  const result = await callApi(client, base64Data, mediaType, PROMPT)
  if (result) return result

  // Second attempt with a retry prompt focused on graphical scale bars
  console.log('Scale detection: first pass returned null, retrying with focused prompt…')
  return await callApi(client, base64Data, mediaType, RETRY_PROMPT)
}
