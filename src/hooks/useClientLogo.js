import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const MAX_SIZE_BYTES = 5 * 1024 * 1024 // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const BUCKET = 'client-logos'

export function useClientLogo() {
  const { company } = useAuth()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)

  async function uploadLogo(clientId, file) {
    if (!company?.id) throw new Error('No company context')
    if (!ALLOWED_TYPES.includes(file.type)) throw new Error('Please upload a JPG, PNG, WebP, or GIF image.')
    if (file.size > MAX_SIZE_BYTES) throw new Error('Logo must be under 5MB.')

    setUploading(true)
    setError(null)
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
      const path = `${company.id}/${clientId}/${Date.now()}-${safeName}`

      const { error: uploadErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { upsert: false, cacheControl: '3600', contentType: file.type })
      if (uploadErr) throw uploadErr

      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path)
      const publicUrl = urlData.publicUrl

      const { error: updateErr } = await supabase
        .from('clients')
        .update({ logo_url: publicUrl, updated_at: new Date().toISOString() })
        .eq('id', clientId)
      if (updateErr) throw updateErr

      return { url: publicUrl, path }
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setUploading(false)
    }
  }

  async function deleteLogo(clientId) {
    setUploading(true)
    setError(null)
    try {
      // Fetch current logo_url to extract storage path
      const { data: client, error: fetchErr } = await supabase
        .from('clients')
        .select('logo_url')
        .eq('id', clientId)
        .single()
      if (fetchErr) throw fetchErr

      if (client?.logo_url) {
        const marker = `/storage/v1/object/public/${BUCKET}/`
        const idx = client.logo_url.indexOf(marker)
        if (idx !== -1) {
          const storagePath = client.logo_url.slice(idx + marker.length)
          await supabase.storage.from(BUCKET).remove([storagePath])
        }
      }

      const { error: updateErr } = await supabase
        .from('clients')
        .update({ logo_url: null, updated_at: new Date().toISOString() })
        .eq('id', clientId)
      if (updateErr) throw updateErr
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setUploading(false)
    }
  }

  return { uploadLogo, deleteLogo, uploading, error }
}
