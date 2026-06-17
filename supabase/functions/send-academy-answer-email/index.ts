import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    // ── Step 1: Validate caller identity via JWT ──────────────────────────
    const authHeader = req.headers.get('authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      })
    }

    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user: caller }, error: authError } = await anonClient.auth.getUser()
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      })
    }

    // ── Step 2: Parse request body ────────────────────────────────────────
    const { question_id } = await req.json()
    if (!question_id) throw new Error('question_id required')

    // ── Step 3: Service-role client for privileged operations ──────────────
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // ── Step 4: Super admin check ─────────────────────────────────────────
    const { data: superAdminRow } = await supabase
      .from('super_admins')
      .select('email')
      .eq('email', caller.email)
      .maybeSingle()
    if (!superAdminRow) {
      return new Response(JSON.stringify({ error: 'forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      })
    }

    // ── Step 5: Fetch question + answer ───────────────────────────────────
    const { data: question, error: qErr } = await supabase
      .from('academy_questions')
      .select('id, question, answer, user_id, notify_method')
      .eq('id', question_id)
      .single()
    if (qErr) throw new Error('question fetch: ' + qErr.message)

    if (question.notify_method !== 'email') {
      return new Response(JSON.stringify({ skipped: true, reason: 'notify_method is not email' }), {
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      })
    }

    if (!question.answer) {
      return new Response(JSON.stringify({ skipped: true, reason: 'no answer yet' }), {
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      })
    }

    // ── Step 6: Fetch recipient email ─────────────────────────────────────
    const { data: profile, error: profErr } = await supabase
      .from('user_profiles')
      .select('email')
      .eq('user_id', question.user_id)
      .single()
    if (profErr || !profile?.email) {
      // Fallback: try auth.users
      const { data: { user: asker } } = await supabase.auth.admin.getUserById(question.user_id)
      if (!asker?.email) throw new Error('asker has no email')
      var recipientEmail = asker.email
    } else {
      var recipientEmail = profile.email
    }

    const truncatedQuestion = question.question.length > 200
      ? question.question.slice(0, 200) + '...'
      : question.question

    // ── Step 7: Send email via Resend ─────────────────────────────────────
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
    if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY not configured')

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'RivetDog <academy@rivetdog.com>',
        to: recipientEmail,
        subject: 'Your RivetDog Academy question was answered',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
            <h2 style="color: #1e3a5f;">Your question was answered</h2>
            <p>You asked:</p>
            <blockquote style="border-left: 3px solid #d97706; padding-left: 12px; color: #6b7280; margin: 16px 0;">
              ${truncatedQuestion}
            </blockquote>
            <p><strong>Answer:</strong></p>
            <div style="background: #f3f4f6; padding: 16px; border-radius: 6px; margin: 16px 0;">
              ${question.answer.replace(/\n/g, '<br>')}
            </div>
            <p style="margin-top: 24px;">
              <a href="https://rivetdog.com/academy" style="color: #2e8bff; text-decoration: none;">
                View Academy Q&A →
              </a>
            </p>
            <p style="color: #9ca3af; font-size: 11px; margin-top: 32px;">
              RivetDog | NG Automation Hub
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
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    })
  }
})
