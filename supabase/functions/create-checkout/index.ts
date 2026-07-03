import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    // 1. Auth: validate caller JWT
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing auth' }, 401)

    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user }, error: userErr } = await anonClient.auth.getUser()
    if (userErr || !user) return json({ error: 'Invalid auth' }, 401)

    // 2. Parse input
    const body = await req.json()
    const term = body.term === 'yearly' ? 'yearly' : 'monthly'

    // 3. Service-role client
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    // 4. Resolve company
    const { data: profile } = await adminClient
      .from('user_profiles')
      .select('company_id')
      .eq('user_id', user.id)
      .single()
    if (!profile?.company_id) return json({ error: 'No company found' }, 400)

    const { data: company } = await adminClient
      .from('companies')
      .select('id, name, plan_key, subscription_status')
      .eq('id', profile.company_id)
      .single()
    if (!company) return json({ error: 'Company not found' }, 404)

    // 5. Pilot accounts don't need subscriptions
    if (company.subscription_status === 'pilot') {
      return json({ error: 'Pilot accounts are free and do not need a subscription' }, 400)
    }

    // 6. Get Chargebee price ID from plans
    const { data: plan } = await adminClient
      .from('plans')
      .select('chargebee_price_id_monthly, chargebee_price_id_annual')
      .eq('key', company.plan_key)
      .single()

    const priceId = term === 'yearly'
      ? plan?.chargebee_price_id_annual
      : plan?.chargebee_price_id_monthly

    if (!priceId) {
      return json({ error: 'No Chargebee price configured for this plan and term' }, 400)
    }

    // 7. Create Chargebee Hosted Page checkout
    const site = Deno.env.get('CHARGEBEE_SITE')!
    const apiKey = Deno.env.get('CHARGEBEE_API_KEY')!
    const appUrl = 'https://app.rivetdog.com'

    const params = new URLSearchParams()
    params.set('subscription_items[item_price_id][0]', priceId)
    params.set('subscription_items[quantity][0]', '1')
    params.set('customer[id]', company.id)
    params.set('customer[email]', user.email ?? '')
    params.set('customer[company]', company.name ?? '')
    params.set('subscription[trial_end]', '0')
    params.set('redirect_url', `${appUrl}/billing/success`)
    params.set('cancel_url', `${appUrl}/billing/cancel`)

    const cbRes = await fetch(
      `https://${site}.chargebee.com/api/v2/hosted_pages/checkout_new_for_items`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(apiKey + ':'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      },
    )

    const cbData = await cbRes.json()
    if (!cbRes.ok) {
      console.error('Chargebee error', cbData)
      return json({ error: cbData?.message || 'Checkout creation failed' }, 502)
    }

    return json({ url: cbData.hosted_page?.url })

  } catch (err) {
    console.error('create-checkout error', err)
    return json({ error: String(err) }, 500)
  }
})
