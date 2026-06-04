import { useState, useRef } from 'react'
import { supabase } from '../../lib/supabase'

function initials(name) {
  return (name || '')
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() || '')
    .join('')
}

const UploadIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
)

export default function ResourceCard({ resource, category, isSuperAdmin, onLogoUploaded }) {
  const [hover, setHover] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef(null)

  async function handleLogoUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'png'
      const path = `${resource.id}/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('resource-logos')
        .upload(path, file, { cacheControl: '3600', upsert: false })
      if (upErr) throw upErr
      const { data: urlData } = supabase.storage.from('resource-logos').getPublicUrl(path)
      const publicUrl = urlData.publicUrl
      const { error: updErr } = await supabase
        .from('resources')
        .update({ logo_url: publicUrl, updated_at: new Date().toISOString() })
        .eq('id', resource.id)
      if (updErr) throw updErr
      onLogoUploaded?.(resource.id, publicUrl)
    } catch (err) {
      alert(err.message)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const ctaParts = []
  if (resource.website_url) ctaParts.push({ label: 'Visit website', href: resource.website_url, external: true })
  if (resource.phone) ctaParts.push({ label: 'Call', href: `tel:${resource.phone}` })
  if (resource.email) ctaParts.push({ label: 'Email', href: `mailto:${resource.email}` })

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative',
        display: 'flex', flexDirection: 'row', gap: 14, padding: 16,
        background: 'var(--color-surface)', border: `1px solid ${hover ? 'var(--color-primary)' : 'var(--color-border)'}`,
        borderRadius: 12, transition: 'border-color 0.15s ease',
      }}
    >
      {/* Logo / Avatar */}
      <div style={{ width: 64, height: 64, borderRadius: 'var(--radius-md)', flexShrink: 0, position: 'relative', overflow: 'visible' }}>
        {resource.logo_url ? (
          <img src={resource.logo_url} alt={resource.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'var(--radius-md)' }} />
        ) : (
          <div style={{
            width: '100%', height: '100%', borderRadius: 'var(--radius-md)',
            background: 'var(--color-primary)', color: 'var(--color-on-primary, #fff)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: 20,
          }}>
            {initials(resource.name)}
          </div>
        )}
        {isSuperAdmin && (
          <>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              style={{
                position: 'absolute', bottom: -8, right: -8,
                width: 32, height: 32, borderRadius: 9999,
                background: '#fff', border: '1px solid var(--color-border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: uploading ? 'default' : 'pointer',
                opacity: uploading ? 0.6 : 1, fontSize: 14, color: 'var(--color-text-muted)',
              }}
              title="Upload logo"
            >
              <UploadIcon />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleLogoUpload}
            />
          </>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {/* Row 1: name + category */}
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text)' }}>{resource.name}</span>
          {category && (
            <span style={{
              padding: '2px 8px', borderRadius: 9999, fontSize: 11,
              background: 'var(--color-surface-2)', color: 'var(--color-text-muted)',
              marginLeft: 4,
            }}>
              {category.label}
            </span>
          )}
        </div>

        {/* Row 2: description */}
        {resource.description && (
          <div style={{ fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.45 }}>
            {resource.description}
          </div>
        )}

        {/* Row 3: CTAs */}
        {ctaParts.length > 0 && (
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            {ctaParts.map((cta, i) => (
              <span key={cta.label}>
                {i > 0 && ' · '}
                <a
                  href={cta.href}
                  target={cta.external ? '_blank' : undefined}
                  rel={cta.external ? 'noopener noreferrer' : undefined}
                  style={{ color: 'var(--color-primary)', textDecoration: 'none' }}
                  onMouseEnter={e => { e.currentTarget.style.textDecoration = 'underline' }}
                  onMouseLeave={e => { e.currentTarget.style.textDecoration = 'none' }}
                >
                  {cta.label}
                </a>
              </span>
            ))}
          </div>
        )}

        {/* Service area */}
        {resource.service_area_text && (
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', fontStyle: 'italic', marginTop: 2 }}>
            Serves {resource.service_area_text}
          </div>
        )}
      </div>

      {/* Featured stamp */}
      {resource.is_featured && (
        <span style={{
          position: 'absolute', top: 12, right: 12,
          padding: '2px 8px', borderRadius: 9999,
          background: '#f27243', color: '#fff',
          fontSize: 11, fontWeight: 600,
        }}>
          ★ Featured
        </span>
      )}
    </div>
  )
}
