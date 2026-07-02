import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useEffectiveCompany } from './useEffectiveCompany'

const MAX_SIZE_BYTES = 5 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const BUCKET = 'company-logos'

export function useCompanyBranding() {
  const { refreshCompany } = useAuth()
  const { companyId } = useEffectiveCompany()
  const [uploading, setUploading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function uploadLogo(file) {
    if (!companyId) throw new Error('No company context')
    if (!ALLOWED_TYPES.includes(file.type)) throw new Error('Please upload a JPG, PNG, WebP, or GIF image.')
    if (file.size > MAX_SIZE_BYTES) throw new Error('Logo must be under 5MB.')

    setUploading(true)
    setError(null)
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'png'
      const path = `${companyId}/logo.${ext}`

      const { error: uploadErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { upsert: true, cacheControl: '3600', contentType: file.type })
      if (uploadErr) throw uploadErr

      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path)
      const publicUrl = urlData.publicUrl

      const { error: updateErr } = await supabase
        .from('companies')
        .update({ logo_url: publicUrl })
        .eq('id', companyId)
      if (updateErr) throw updateErr

      await refreshCompany()
      return publicUrl
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setUploading(false)
    }
  }

  async function deleteLogo() {
    if (!companyId) throw new Error('No company context')
    setUploading(true)
    setError(null)
    try {
      if (company?.logo_url) {
        const marker = `/storage/v1/object/public/${BUCKET}/`
        const idx = company.logo_url.indexOf(marker)
        if (idx !== -1) {
          const storagePath = company.logo_url.slice(idx + marker.length)
          await supabase.storage.from(BUCKET).remove([storagePath])
        }
      }

      const { error: updateErr } = await supabase
        .from('companies')
        .update({ logo_url: null })
        .eq('id', companyId)
      if (updateErr) throw updateErr

      await refreshCompany()
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setUploading(false)
    }
  }

  async function updateBranding({ name, primary_color, accent_color, portal_theme, state, city, zip, address_line1, address_line2, business_phone }) {
    if (!companyId) throw new Error('No company context')
    setLoading(true)
    setError(null)
    try {
      const patch = {}
      if (name !== undefined) patch.name = name
      if (primary_color !== undefined) patch.primary_color = primary_color || null
      if (accent_color !== undefined) patch.accent_color = accent_color || null
      if (portal_theme !== undefined) patch.portal_theme = portal_theme || 'light'
      if (state !== undefined) patch.state = state || null
      if (city !== undefined) patch.city = city || null
      if (zip !== undefined) patch.zip = zip || null
      if (address_line1 !== undefined) patch.address_line1 = address_line1 || null
      if (address_line2 !== undefined) patch.address_line2 = address_line2 || null
      if (business_phone !== undefined) patch.business_phone = business_phone || null

      const { error: err } = await supabase
        .from('companies')
        .update(patch)
        .eq('id', companyId)
      if (err) throw err

      await refreshCompany()
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { uploadLogo, deleteLogo, updateBranding, uploading, loading, error }
}
