// Supabase Edge Function: suggest-materials
// Calls the Anthropic Messages API server-side to fill tiered product/cost
// suggestions on material order line items and propose primer/supply additions.
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

    const { lines, vertical, store } = await req.json()
    if (!Array.isArray(lines) || lines.length === 0) return json({ error: 'No line items provided.' })

    const trade = typeof vertical === 'string' && vertical ? vertical : 'paint'

    const system = `You are a materials estimator for trade contractors, primarily painting. Given a list of measured material line items, suggest Good/Better/Best product options and ESTIMATED per-unit costs for each line, plus any commonly-needed additional supplies.

If a store name is provided, tailor every product suggestion to brands and product lines that store actually carries. Examples: Sherwin-Williams -> its own lines such as ProMar 200, SuperPaint, Emerald. Home Depot -> brands it stocks such as Glidden, Behr, PPG. Lowe's -> brands it stocks such as Valspar, HGTV Home, Sherwin-Williams retail. Match estimated costs to that store's typical retail range. If no store is provided, suggest widely available products with typical estimated costs.

Rules:
- Costs are ESTIMATES for budgeting only. They are NOT live, current, or guaranteed retailer prices. The contractor verifies final price and availability with the retailer.
- Tiers: "good" = economy / contractor-grade, "better" = mid-grade, "best" = premium.
- Use realistic, specific product names (brand + line + sheen where relevant). Do not invent SKUs or claim real-time inventory.
- Respond with STRICT JSON ONLY. No prose, no markdown code fences.

JSON shape:
{ "fills": [ { "id": "<exact line id from input>", "product_good": "", "product_better": "", "product_best": "", "cost_good": 0, "cost_better": 0, "cost_best": 0 } ], "additions": [ { "description": "", "unit": "", "quantity": 1, "product_good": "", "product_better": "", "product_best": "", "cost_good": 0, "cost_better": 0, "cost_best": 0 } ] }

"fills" must contain exactly one object per input line id. "additions" are NEW supply lines not already present (e.g., primer, painter's tape, roller covers, brushes, drop cloths) — include only if genuinely useful, otherwise return an empty array.`

    const userMsg = `Vertical: ${trade}
Store: ${store || 'not specified'}

Line items to fill (use each item's exact id in your "fills" output):
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
    return json({ fills, additions })
  } catch (err) {
    return json({ error: (err as Error).message || 'Unexpected error.' })
  }
})
