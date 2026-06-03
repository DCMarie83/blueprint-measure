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

    const { lines, vertical } = await req.json()
    if (!Array.isArray(lines) || lines.length === 0) return json({ error: 'No line items provided.' })

    const trade = typeof vertical === 'string' && vertical ? vertical : 'paint'

    const system = [
      `You are a materials estimator for ${trade} contractors.`,
      'Given material line items (each with id, description, unit, quantity), suggest Good/Better/Best product options with ESTIMATED per-unit costs in USD for each line, and propose any primer and common supplies the job likely needs as additional lines.',
      'Return ONLY valid JSON, no markdown and no prose, in exactly this shape:',
      '{"fills":[{"id":"<line id>","product_good":"","product_better":"","product_best":"","cost_good":0,"cost_better":0,"cost_best":0}],"additions":[{"description":"","unit":"","quantity":0,"product_good":"","product_better":"","product_best":"","cost_good":0,"cost_better":0,"cost_best":0}]}',
      'Rules:',
      '- Costs are ESTIMATES in USD per unit (e.g. per gallon). Never claim live, current, or retailer-specific prices or availability.',
      '- For paint, use realistic tiers (contractor-grade, mid-grade, premium).',
      '- "fills" must contain exactly one entry per input line id, echoing the id back unchanged.',
      "- \"additions\" are NEW items not already present (e.g. primer, painter's tape, roller covers, drop cloths). Keep them practical and minimal.",
      '- Use sensible unit conventions (gallon, each, roll).',
      '- Output JSON only.',
    ].join('\n')

    const userMsg = `Trade: ${trade}\nLine items:\n${JSON.stringify(lines)}`

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
