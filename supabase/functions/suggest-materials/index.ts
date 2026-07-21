// Supabase Edge Function: suggest-materials
// CATALOG MAPPER. The model no longer invents products or prices. Given the
// caller's compact active catalog, it (a) maps each input line to the best
// matching taxonomy_slug (or null), (b) proposes additions as catalog slugs for
// commonly-needed items not already present, and (c) lists genuinely missing
// items under not_in_catalog (no prices). Products, prices, and provenance are
// resolved client-side from the catalog.
// Deploy with JWT verification ON (default) — only authenticated users may call it.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const ANTHROPIC_MODEL = 'claude-sonnet-4-6'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  try {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) return json({ error: 'AI is not configured (missing ANTHROPIC_API_KEY secret).' })

    const { lines, store_name, vertical, catalog } = await req.json()
    if (!Array.isArray(lines) || lines.length === 0) return json({ error: 'No line items provided.' })
    if (!Array.isArray(catalog) || catalog.length === 0) return json({ error: 'No catalog provided to map against.' })

    const trade = typeof vertical === 'string' && vertical ? vertical : 'paint'

    const system = `You are a materials mapper for trade contractors, primarily painting. You are given a CATALOG of purchasable items (each with a taxonomy_slug, name, grade, store_name, purchase_unit) and a list of measured material line items. You do NOT invent products, and you do NOT invent prices — pricing and product names are resolved elsewhere from the catalog.

Your only jobs:
1. For EACH input line, choose the single best matching taxonomy_slug from the provided catalog, or null if nothing in the catalog fits.
2. Propose ADDITIONS: taxonomy_slugs from the provided catalog for commonly-needed items that are NOT already represented by the input lines (e.g., primer, tape, roller covers, drop cloths) — each with a sensible whole-number quantity. Only include items whose slug exists in the catalog. If nothing is worth adding, return an empty array.
3. List NOT_IN_CATALOG: genuinely needed items that have NO matching taxonomy_slug in the catalog — with a short description, unit, quantity, and a brief note. Never include a price or a product/brand name here.

Rules:
- Only use taxonomy_slug values that appear in the provided catalog. Never invent a slug.
- A taxonomy_slug may appear at multiple grades in the catalog; map to the slug, not to a specific grade.
- Respond with STRICT JSON ONLY. No prose, no markdown code fences.

JSON shape:
{ "fills": [ { "id": "<exact line id from input>", "taxonomy_slug": null } ], "additions": [ { "taxonomy_slug": "", "quantity": 1 } ], "not_in_catalog": [ { "description": "", "unit": "", "quantity": 1, "note": "" } ] }

"fills" must contain exactly one object per input line id.`

    const userMsg = `Vertical: ${trade}
Store: ${store_name || 'not specified'}

Catalog (map only to these taxonomy_slugs):
${JSON.stringify(catalog, null, 2)}

Line items to map (use each item's exact id in your "fills" output):
${JSON.stringify(lines, null, 2)}`

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 2000,
        system,
        messages: [{ role: 'user', content: userMsg }],
      }),
    })

    if (!resp.ok) {
      const detail = await resp.text()
      return json({ error: `AI request failed (${resp.status}).`, detail })
    }

    const data = await resp.json()
    const text = Array.isArray(data?.content)
      ? data.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
      : ''
    const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim()

    let parsed: any
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      return json({ error: 'AI returned an unexpected format. Try again or enter materials manually.' })
    }

    const fills = Array.isArray(parsed?.fills) ? parsed.fills : []
    const additions = Array.isArray(parsed?.additions) ? parsed.additions : []
    const not_in_catalog = Array.isArray(parsed?.not_in_catalog) ? parsed.not_in_catalog : []
    return json({ fills, additions, not_in_catalog })
  } catch (err) {
    return json({ error: (err as Error).message || 'Unexpected error.' })
  }
})
