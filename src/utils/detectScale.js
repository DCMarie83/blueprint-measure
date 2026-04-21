import Anthropic from '@anthropic-ai/sdk'
import { SCALE_OPTIONS } from './scaleOptions'

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

const SCALE_LIST = SCALE_OPTIONS
  .filter(o => o.value !== 'manual')
  .map(o => `"${o.value}" → ${o.label}`)
  .join('\n')

const PROMPT = `You are analyzing an architectural blueprint or floor plan image.

Your task: find the drawing scale notation. It usually appears as:
  • Text like "Scale: 1/4" = 1'-0"" or "1/4" = 1'"
  • A printed bar scale with labeled distances
  • A title block entry labeled "Scale"

Valid scale keys and what they mean:
${SCALE_LIST}

Respond with ONLY a JSON object — no other text, no markdown:
{"scale": "<key>", "confidence": "high" | "medium" | "low"}

If you cannot find or clearly identify the scale, respond with:
{"scale": null, "confidence": "none"}`

// Analyse the first page of a blueprint and return the detected scale.
// Returns { scaleValue, label, inchesPerFoot, confidence } or null on failure.
//
// imageUrl may be a data URL (from renderPage) or an https:// URL (image blueprint).
export async function detectScaleFromImage(imageUrl) {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
  if (!apiKey) {
    console.warn('VITE_ANTHROPIC_API_KEY is not set — scale detection skipped')
    return null
  }

  // Ensure we have a base64 data URL (required by the Anthropic API)
  const dataUrl = await toDataUrl(imageUrl)
  const [header, base64Data] = dataUrl.split(',')
  const mediaType = header.match(/data:([^;]+)/)?.[1] ?? 'image/jpeg'

  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })

  let text = ''
  try {
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 120,
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
    // Strip any accidental markdown code fences
    const jsonStr = text.replace(/^```json?\n?/i, '').replace(/\n?```$/, '').trim()
    parsed = JSON.parse(jsonStr)
  } catch {
    console.warn('Scale detection: could not parse response:', text)
    return null
  }

  if (!parsed?.scale) return null

  const option = SCALE_OPTIONS.find(o => o.value === parsed.scale)
  if (!option?.inchesPerFoot) return null

  return {
    scaleValue: option.value,
    label: option.label,
    inchesPerFoot: option.inchesPerFoot,
    confidence: parsed.confidence ?? 'unknown',
  }
}
