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

const PROMPT = `You are reading an architectural blueprint or floor plan image.

Find the scale notation. It is usually in the title block (bottom-right corner) or near a bar scale graphic. It looks like:
  • "Scale: 1/4\" = 1'-0\""
  • "1/4 inch = 1 foot"
  • A bar scale labeled in feet

Respond with ONLY a valid JSON object, no other text:
{"scale": "<value>"}

The value must be exactly one of:
  1/8   (means 1/8 inch = 1 foot)
  3/16  (means 3/16 inch = 1 foot)
  1/4   (means 1/4 inch = 1 foot)
  3/8   (means 3/8 inch = 1 foot)
  1/2   (means 1/2 inch = 1 foot)
  3/4   (means 3/4 inch = 1 foot)
  1     (means 1 inch = 1 foot)
  1-1/2 (means 1-1/2 inches = 1 foot)
  3     (means 3 inches = 1 foot)
  null  (if no scale notation is visible or you are uncertain)

Example responses:
  {"scale": "1/4"}
  {"scale": null}`

// Analyse the first page of a blueprint and return the detected scale.
// Returns { scaleValue, label, inchesPerFoot } or null if not found / on error.
//
// imageUrl may be a data URL (from renderPage) or an https:// URL (image blueprint).
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
          { type: 'text', text: PROMPT },
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
    // Strip any accidental markdown code fences before parsing
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
