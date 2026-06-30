import { supabase } from '../lib/supabase'

export async function getStateQuotas() {
  const { data, error } = await supabase
    .from('plan_state_quotas')
    .select('id, state, max_signups, signup_count, plan_id, plans(key, display_name, display_order)')
    .order('state', { ascending: true })
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function updateStateQuotaCap(id, maxSignups) {
  const { error } = await supabase
    .from('plan_state_quotas')
    .update({ max_signups: maxSignups, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
}
