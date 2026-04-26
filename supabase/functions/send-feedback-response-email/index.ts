import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
      },
    })
  }

  try {
    const { feedback_id } = await req.json()
    if (!feedback_id) throw new Error('feedback_id required')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Get feedback + user email + latest non-internal response
    const { data: feedback, error: fbErr } = await supabase
      .from('beta_feedback')
      .select('id, description, user_id')
      .eq('id', feedback_id)
      .single()
    if (fbErr) throw new Error('feedback fetch: ' + fbErr.message)

    const { data: { user } } = await supabase.auth.admin.getUserById(feedback.user_id)
    if (!user?.email) throw new Error('user has no email')

    const { data: responses, error: rErr } = await supabase
      .from('feedback_responses')
      .select('body, created_at')
      .eq('feedback_id', feedback_id)
      .eq('is_internal', false)
      .order('created_at', { ascending: false })
      .limit(1)
    if (rErr) throw new Error('response fetch: ' + rErr.message)
    if (!responses?.length) throw new Error('no user-visible response found')

    const latestResponse = responses[0]
    const truncatedFeedback = feedback.description.length > 200
      ? feedback.description.slice(0, 200) + '...'
      : feedback.description

    // TODO: Configure RESEND_API_KEY in Supabase Edge Function secrets.
    // If not configured, the email send will fail gracefully — the response
    // itself is already saved, just no email goes out.
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
    if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY not configured')

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'BlueprintMeasure <feedback@blueprintmeasure.com>',
        to: user.email,
        subject: 'Re: Your BlueprintMeasure feedback',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
            <h2 style="color: #1e3a5f;">We replied to your feedback</h2>
            <p>You submitted:</p>
            <blockquote style="border-left: 3px solid #d97706; padding-left: 12px; color: #6b7280; margin: 16px 0;">
              ${truncatedFeedback}
            </blockquote>
            <p><strong>Our response:</strong></p>
            <div style="background: #f3f4f6; padding: 16px; border-radius: 6px; margin: 16px 0;">
              ${latestResponse.body.replace(/\n/g, '<br>')}
            </div>
            <p style="color: #6b7280; font-size: 13px;">
              You can submit additional feedback anytime by clicking the orange "Send Feedback" button at blueprintmeasure.com.
            </p>
            <p style="color: #9ca3af; font-size: 11px; margin-top: 32px;">
              BlueprintMeasure | NG Automation Hub
            </p>
          </div>
        `,
      }),
    })

    if (!emailRes.ok) {
      const errText = await emailRes.text()
      throw new Error('Resend API: ' + errText)
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
