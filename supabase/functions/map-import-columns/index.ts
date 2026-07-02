const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const ANTHROPIC_MODEL = 'claude-sonnet-4-6'

const TARGET_FIELDS = [
  'display_name', 'business_name', 'primary_email', 'primary_phone',
  'client_type', 'property_type', 'billing_terms', 'company_website',
  'tax_id', 'notes', 'addr_street', 'addr_unit', 'addr_city', 'addr_state', 'addr_zip',
]

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) {
      return jsonResponse({ mapping: {}, ai_failed: true }, 200)
    }

    const { headers, sampleRows } = await req.json()
    if (!headers?.length) {
      return jsonResponse({ mapping: {}, ai_failed: true }, 200)
    }

    const prompt = `You are a data-mapping assistant. Given these CSV/spreadsheet column headers and sample data, map each header to the most appropriate target field for a contractor's client database.

Source headers: ${JSON.stringify(headers)}

Sample rows (up to 5):
${JSON.stringify((sampleRows || []).slice(0, 5), null, 2)}

Target fields (map each source header to exactly one, or null if no match):
${JSON.stringify(TARGET_FIELDS)}

Field descriptions:
- display_name: client's full name (person or business display name)
- business_name: company/business name (if separate from display name)
- primary_email: email address
- primary_phone: phone number
- client_type: "residential" or "commercial"
- property_type: type of property
- billing_terms: payment terms
- company_website: website URL
- tax_id: tax ID / EIN
- notes: any notes or comments
- addr_street: street address
- addr_unit: apartment/suite/unit number
- addr_city: city
- addr_state: state (2-letter code)
- addr_zip: zip/postal code

Return ONLY a JSON object mapping each source header to a target field or null. No explanation, no markdown fences. Example:
{"Customer Name":"display_name","Email":"primary_email","Phone":"primary_phone","Address":"addr_street","Unknown Col":null}`

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!resp.ok) {
      console.error('Anthropic API error:', resp.status, await resp.text())
      return jsonResponse({ mapping: {}, ai_failed: true }, 200)
    }

    const data = await resp.json()
    const text = Array.isArray(data?.content)
      ? data.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
      : ''

    const cleaned = text.trim().replace(/^```json?\n?/i, '').replace(/\n?```$/, '').trim()

    try {
      const mapping = JSON.parse(cleaned)
      if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) {
        return jsonResponse({ mapping: {}, ai_failed: true }, 200)
      }
      return jsonResponse({ mapping, ai_failed: false }, 200)
    } catch {
      console.error('Failed to parse AI mapping response:', cleaned)
      return jsonResponse({ mapping: {}, ai_failed: true }, 200)
    }
  } catch (err) {
    console.error('map-import-columns error:', err)
    return jsonResponse({ mapping: {}, ai_failed: true }, 200)
  }
})
