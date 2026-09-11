import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useEffectiveCompany } from './useEffectiveCompany'

const MAX_SIZE_BYTES = 5 * 1024 * 1024
// PNG/JPEG embed in the PDF generators; SVG is accepted at the door but
// rasterized to PNG before upload. WebP and GIF are rejected outright —
// they cannot render in the PDFs.
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml']
const MIN_WIDTH = 600
const RECOMMENDED_WIDTH = 1500
const MAX_WIDTH = 4000
const DOWNSCALE_WIDTH = 2500
const SVG_RASTER_WIDTH = 2000
const BUCKET = 'company-logos'

function readImageElement(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('unreadable image')) }
    img.src = url
  })
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('canvas export failed'))), type, quality)
  })
}

// Rasterize an SVG file to a transparent-background PNG at a fixed width.
async function rasterizeSvg(file) {
  const img = await readImageElement(file)
  const width = SVG_RASTER_WIDTH
  const aspect = img.naturalWidth > 0 && img.naturalHeight > 0 ? img.naturalHeight / img.naturalWidth : 1
  const height = Math.max(1, Math.round(width * aspect))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d').drawImage(img, 0, 0, width, height)
  const blob = await canvasToBlob(canvas, 'image/png')
  return { blob, width, height }
}

// Downscale an oversized raster to targetW, keeping its own format.
async function downscaleImage(img, sourceType, targetW) {
  const width = targetW
  const height = Math.max(1, Math.round(img.naturalHeight * (targetW / img.naturalWidth)))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, width, height)
  const type = sourceType === 'image/jpeg' ? 'image/jpeg' : 'image/png'
  const blob = await canvasToBlob(canvas, type, type === 'image/jpeg' ? 0.92 : undefined)
  return { blob, width, height }
}

// Best-effort removal of a bucket object by its public URL. A URL that does
// not parse to a bucket path is skipped without erroring.
async function removeByPublicUrl(url) {
  try {
    const marker = `/storage/v1/object/public/${BUCKET}/`
    const idx = (url || '').indexOf(marker)
    if (idx === -1) return
    await supabase.storage.from(BUCKET).remove([url.slice(idx + marker.length)])
  } catch { /* orphaned object is acceptable; never block the flow */ }
}

export function useCompanyBranding() {
  const { t } = useTranslation()
  const { refreshCompany } = useAuth()
  const { companyId } = useEffectiveCompany()
  const [uploading, setUploading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  /**
   * Validate, process, and upload a logo file.
   * @returns {Promise<{ publicUrl, width, height, warning: string|null }>}
   */
  async function uploadLogo(file) {
    if (!companyId) throw new Error('No company context')
    if (!ALLOWED_TYPES.includes(file.type)) throw new Error(t('settings:logo.typeError'))
    if (file.size > MAX_SIZE_BYTES) throw new Error(t('settings:logo.maxSizeError'))

    setUploading(true)
    setError(null)
    try {
      let blob = file
      let width
      let height

      if (file.type === 'image/svg+xml') {
        try {
          ;({ blob, width, height } = await rasterizeSvg(file))
        } catch {
          throw new Error(t('settings:logo.readError'))
        }
      } else {
        let img
        try {
          img = await readImageElement(file)
        } catch {
          throw new Error(t('settings:logo.readError'))
        }
        width = img.naturalWidth
        height = img.naturalHeight
        if (!width || !height) throw new Error(t('settings:logo.readError'))
        if (width < MIN_WIDTH) {
          throw new Error(t('settings:logo.tooSmallError', { width, height, min: MIN_WIDTH, recommended: RECOMMENDED_WIDTH }))
        }
        if (width > MAX_WIDTH) {
          ;({ blob, width, height } = await downscaleImage(img, file.type, DOWNSCALE_WIDTH))
        }
      }

      const warning = width < RECOMMENDED_WIDTH
        ? t('settings:logo.smallWarning', { width, recommended: RECOMMENDED_WIDTH })
        : null

      const contentType = blob.type === 'image/jpeg' ? 'image/jpeg' : 'image/png'
      const ext = contentType === 'image/jpeg' ? 'jpg' : 'png'
      // Unique object per upload: the public URL changes every time, so no
      // consumer (PDF, email, portal, header) can be served a stale CDN copy.
      const path = `${companyId}/logo-${Date.now()}.${ext}`

      const { error: uploadErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, blob, { cacheControl: '3600', contentType })
      if (uploadErr) throw uploadErr

      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path)
      const publicUrl = urlData.publicUrl

      const { error: updateErr } = await supabase
        .from('companies')
        .update({ logo_url: publicUrl })
        .eq('id', companyId)
      if (updateErr) throw updateErr

      // The previous object stays in the bucket: send-estimate-email,
      // send-invoice-email, and send-lite-invoice-email hotlink logo_url into
      // email HTML at send time, so removing it would break the image in
      // every email already delivered. Orphans are acceptable; only an
      // explicit Remove logo deletes an object.

      await refreshCompany()
      return { publicUrl, width, height, warning }
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
      // Read the URL straight from the row rather than relying on
      // useEffectiveCompany exposing a company object.
      const { data: row, error: selectErr } = await supabase
        .from('companies')
        .select('logo_url')
        .eq('id', companyId)
        .single()
      if (selectErr) throw selectErr
      const currentUrl = row?.logo_url || null

      const { error: updateErr } = await supabase
        .from('companies')
        .update({ logo_url: null })
        .eq('id', companyId)
      if (updateErr) throw updateErr

      if (currentUrl) await removeByPublicUrl(currentUrl)

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
