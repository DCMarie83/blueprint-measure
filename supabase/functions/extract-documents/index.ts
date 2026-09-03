import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// extract-documents — reads ONE uploaded document (PDF or scan) from the
// private import-documents bucket and extracts structured rows with Claude.
// Extraction-only: the model reads what is on the page; it never prices,
// derives, or invents. Unknown fields come back null.
//
// Input:    { path: string, kind: 'invoice' | 'quote' | 'price_list' | 'auto' }
// Response: always HTTP 200 —
//   { rows: { header, lines, confidence } | null, doc_type, ai_failed }
// Auth: caller JWT is verified in-code; the path's first segment must equal
// the caller's company id (super admins pass). The object itself is fetched
// with the service role. This function never calls any other function and
// never sends anything to anyone.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Pinned model — one line to change.
const ANTHROPIC_MODEL = 'claude-sonnet-4-6'
const EXTRACT_TIMEOUT_MS = 90_000
const BUCKET = 'import-documents'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function aiFailed(docType: string | null = null) {
  return jsonResponse({ rows: null, doc_type: docType, ai_failed: true }, 200)
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

const MEDIA_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Auth — verify the caller's JWT in-code (never rely on verify_jwt alone).
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonResponse({ error: 'Missing auth' }, 401)

    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user }, error: userErr } = await anonClient.auth.getUser()
    if (userErr || !user) return jsonResponse({ error: 'Invalid auth' }, 401)

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // 2. Input
    const { path, kind } = await req.json()
    if (!path || typeof path !== 'string' || path.includes('..')) {
      return jsonResponse({ error: 'path required' }, 400)
    }
    const docKind = ['invoice', 'quote', 'price_list'].includes(kind) ? kind : 'auto'

    // 3. Tenancy — the path's first segment must be the caller's company id.
    //    Verified super admins pass (impersonated imports).
    const { data: callerProfile } = await adminClient
      .from('user_profiles')
      .select('company_id')
      .eq('user_id', user.id)
      .single()
    const { data: superAdminRow } = await adminClient
      .from('super_admins')
      .select('email')
      .eq('email', user.email)
      .maybeSingle()
    const isSuperAdmin = !!superAdminRow
    const pathCompany = path.split('/')[0]
    if (!isSuperAdmin && (!callerProfile || callerProfile.company_id !== pathCompany)) {
      return jsonResponse({ error: 'Forbidden' }, 403)
    }

    // 4. Download the object with the service role.
    const { data: blob, error: dlErr } = await adminClient.storage.from(BUCKET).download(path)
    if (dlErr || !blob) return jsonResponse({ error: 'Document not found' }, 404)

    const ext = path.split('.').pop()?.toLowerCase() ?? ''
    const mediaType = MEDIA_TYPES[ext]
    if (!mediaType) return jsonResponse({ error: `Unsupported file type .${ext}` }, 400)

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) return aiFailed()

    const base64Data = toBase64(await blob.arrayBuffer())

    const contentBlock = mediaType === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64Data } }
      : { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } }

    const prompt = `You are a document-extraction assistant for a contractor's business records. Read the attached document (${docKind === 'auto' ? 'an invoice, a quote/estimate, or a price list' : `a ${docKind.replace('_', ' ')}`}) and extract EXACTLY what is printed on it.

Rules:
- Extraction only. Never invent, estimate, or compute values that are not printed. If a field is not on the document, use null.
- Dates as YYYY-MM-DD. Money as plain numbers without currency symbols or thousands separators.
- total: the document's FULL GROSS TOTAL (the invoiced/quoted amount after taxes and adjustments, BEFORE any payments are subtracted). NEVER put a "Balance due" / "Amount due" figure in total.
- balance_due: the printed balance/amount due after payments, if shown; else null.
- payments_printed: the printed payments-received/amount-paid figure, if shown; else null.
- doc_type: "invoice", "quote", or "price_list" — your best classification of this document.
- status_hint: only if the document literally shows a status word (e.g. a PAID stamp), else null.
- lines: one entry per line item on the document, at most 40. For a price list, each priced item is a line (quantity null).
- item_type: one of labor|material|supply|equipment|subcontractor|other, or null if not stated.
- confidence: for each header field you filled, "high" if clearly printed, "low" if you had to interpret (poor scan, ambiguous label).

Return ONLY a JSON object, no explanation, no markdown fences:
{
  "doc_type": "invoice" | "quote" | "price_list",
  "header": {
    "number": string|null, "date": string|null,
    "bill_to_name": string|null, "bill_to_address": string|null,
    "job_name": string|null, "job_address": string|null,
    "total": number|null, "subtotal": number|null,
    "balance_due": number|null, "payments_printed": number|null,
    "amount_paid": number|null, "paid_date": string|null,
    "payment_method": string|null, "status_hint": string|null
  },
  "lines": [{ "description": string, "category": string|null, "unit": string|null, "quantity": number|null, "unit_rate": number|null, "total": number|null, "item_type": string|null }],
  "confidence": { "<header field>": "high" | "low" }
}`

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), EXTRACT_TIMEOUT_MS)

    let resp: Response
    try {
      resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: ANTHROPIC_MODEL,
          max_tokens: 4096,
          messages: [{
            role: 'user',
            content: [contentBlock, { type: 'text', text: prompt }],
          }],
        }),
      })
    } catch (err) {
      console.error('extract-documents fetch failed/aborted:', err)
      return aiFailed()
    } finally {
      clearTimeout(timeout)
    }

    if (!resp.ok) {
      console.error('Anthropic API error:', resp.status, await resp.text())
      return aiFailed()
    }

    const data = await resp.json()
    const text = Array.isArray(data?.content)
      ? data.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
      : ''
    const cleaned = text.trim().replace(/^```json?\n?/i, '').replace(/\n?```$/, '').trim()

    try {
      const extraction = JSON.parse(cleaned)
      if (!extraction || typeof extraction !== 'object' || Array.isArray(extraction)) {
        return aiFailed()
      }
      const docType = ['invoice', 'quote', 'price_list'].includes(extraction.doc_type)
        ? extraction.doc_type
        : (docKind === 'auto' ? null : docKind)
      return jsonResponse({
        rows: {
          header: extraction.header ?? {},
          lines: Array.isArray(extraction.lines) ? extraction.lines.slice(0, 40) : [],
          confidence: extraction.confidence ?? {},
        },
        doc_type: docType,
        ai_failed: false,
      }, 200)
    } catch {
      console.error('Failed to parse extraction response:', cleaned.slice(0, 500))
      return aiFailed()
    }
  } catch (err) {
    console.error('extract-documents error:', err)
    return aiFailed()
  }
})
