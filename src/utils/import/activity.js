import { supabase } from '../../lib/supabase'

// Silent client_activity writer for importers. created_at is backdated to the
// record's real date so timelines and clients.last_contact_at (maintained by
// the AFTER INSERT trigger, which only advances last_contact_at) stay truthful.
// Never throws — activity logging must not fail an import row.
export async function logImportActivity({ companyId, userId, clientId, activityType, title, createdAt, metadata }) {
  if (!clientId || !companyId) return
  try {
    await supabase.from('client_activity').insert({
      company_id: companyId,
      client_id: clientId,
      user_id: userId ?? null,
      activity_type: activityType,
      title,
      is_automated: true,
      created_at: createdAt ?? new Date().toISOString(),
      metadata: metadata ?? null,
    })
  } catch { /* silent by design */ }
}
