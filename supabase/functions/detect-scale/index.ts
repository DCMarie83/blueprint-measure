// Supabase Edge Function: detect-scale
// Proxies blueprint scale detection through the Anthropic API server-side
// so the API key never reaches the browser.
// Deploy with JWT verification ON (default) — only authenticated users may call.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const ANTHROPIC_MODEL = 'claude-sonnet-4-6'

const DETECT_PROMPT = `This is an architectural blueprint. Find any scale notation anywhere on the page including: title block, scale bar, drawing notes, border text, or dimension callouts.

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

// ── Helpers ──────────────────────────────────────────────────────────────────

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function callAnthropic(
  apiKey: string,
  base64Data: string,
  mediaType: string,
  prompt: string,
  maxTokens = 60,
) {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: maxTokens,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } },
          { type: 'text', text: prompt },
        ],
      }],
    }),
  })

  if (!resp.ok) {
    const detail = await resp.text()
    throw new Error(`Anthropic API error (${resp.status}): ${detail}`)
  }

  const data = await resp.json()
  const text = Array.isArray(data?.content)
    ? data.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
    : ''
  return text.trim()
}

function parseJson(text: string) {
  const cleaned = text.replace(/^```json?\n?/i, '').replace(/\n?```$/, '').trim()
  return JSON.parse(cleaned)
}

// ── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) {
      return jsonResponse({ error: 'AI is not configured (missing ANTHROPIC_API_KEY secret).' }, 500)
    }

    const { action, imageBase64, mediaType, pixelsPerFoot } = await req.json()

    if (!imageBase64 || !mediaType) {
      return jsonResponse({ error: 'imageBase64 and mediaType are required.' }, 400)
    }

    // ── detect: find scale notation on the blueprint ──
    if (action === 'detect') {
      // First attempt
      let text = await callAnthropic(apiKey, imageBase64, mediaType, DETECT_PROMPT)
      let parsed: any
      try {
        parsed = parseJson(text)
      } catch { parsed = null }

      if (parsed?.scale) {
        return jsonResponse({ scale: parsed.scale })
      }

      // Retry with focused prompt
      text = await callAnthropic(apiKey, imageBase64, mediaType, RETRY_PROMPT)
      try {
        parsed = parseJson(text)
      } catch { parsed = null }

      return jsonResponse({ scale: parsed?.scale ?? null })
    }

    // ── verify: cross-check scale with a dimension label ──
    if (action === 'verify') {
      if (!pixelsPerFoot) {
        return jsonResponse({ error: 'pixelsPerFoot is required for verify.' }, 400)
      }

      const text = await callAnthropic(apiKey, imageBase64, mediaType, VERIFY_PROMPT, 200)
      let parsed: any
      try {
        parsed = parseJson(text)
      } catch {
        return jsonResponse({ result: null })
      }

      if (parsed?.result === null || !parsed?.dimensionText) {
        return jsonResponse({ result: null })
      }
      if (parsed.confidence === 'low') {
        return jsonResponse({ result: null })
      }

      return jsonResponse({ result: parsed })
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 400)
  } catch (err) {
    return jsonResponse({ error: (err as Error).message || 'Unexpected error.' }, 500)
  }
})
