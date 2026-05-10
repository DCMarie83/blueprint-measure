import { supabase } from './supabase'

/**
 * Generates a short-lived signed URL for a blueprint.
 * Falls back to the legacy blueprint_url public URL if no path exists.
 * Returns null if neither path nor url is available.
 */
export async function getBlueprintSignedUrl(session) {
  if (session?.blueprint_path) {
    const { data, error } = await supabase.storage
      .from('blueprints')
      .createSignedUrl(session.blueprint_path, 3600)  // 1 hour TTL

    if (!error && data?.signedUrl) {
      return data.signedUrl
    }
    console.warn('Signed URL generation failed, falling back to public URL:', error)
  }
  return session?.blueprint_url || null
}
