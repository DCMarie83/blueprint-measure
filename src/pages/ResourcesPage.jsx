import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import AppHeader from '../components/AppHeader'
import ResourceCard from '../components/resources/ResourceCard'
import styles from './DashboardPage.module.css'

const filterLabel = { fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-muted)', marginBottom: 6 }
const filterInput = { padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', background: 'var(--color-bg)', color: 'var(--color-text)', fontSize: 13 }

export default function ResourcesPage() {
  const { isSuperAdmin } = useAuth()
  const [categories, setCategories] = useState([])
  const [resources, setResources] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [zip, setZip] = useState('')
  const [jumpTo, setJumpTo] = useState('')

  useEffect(() => {
    ;(async () => {
      try {
        const [catRes, resRes] = await Promise.all([
          supabase.from('resource_categories').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
          supabase.from('resources').select('*').eq('is_active', true).order('is_featured', { ascending: false }).order('sort_order', { ascending: true }),
        ])
        if (catRes.error) throw catRes.error
        if (resRes.error) throw resRes.error
        setCategories(catRes.data || [])
        setResources(resRes.data || [])
      } catch (err) {
        alert(err.message)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  function handleLogoUploaded(resourceId, newUrl) {
    setResources(prev => prev.map(r => r.id === resourceId ? { ...r, logo_url: newUrl } : r))
  }

  const q = searchQuery.trim().toLowerCase()
  const filteredResources = useMemo(() => {
    if (!q) return resources
    return resources.filter(r =>
      r.name.toLowerCase().includes(q) || (r.description || '').toLowerCase().includes(q)
    )
  }, [resources, q])

  // Group filtered resources by category_id
  const grouped = new Map()
  for (const cat of categories) {
    grouped.set(cat.id, { category: cat, items: [] })
  }
  for (const res of filteredResources) {
    const g = grouped.get(res.category_id)
    if (g) g.items.push(res)
  }

  function handleJumpTo(value) {
    setJumpTo(value)
    if (value) {
      const el = document.getElementById(`category-${value}`)
      if (el) {
        const y = el.getBoundingClientRect().top + window.scrollY - 80
        window.scrollTo({ top: y, behavior: 'smooth' })
      }
    }
    setTimeout(() => setJumpTo(''), 0)
  }

  return (
    <div className={styles.page}>
      <AppHeader />
      <main className={styles.main}>
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--color-text)', margin: 0 }}>Resources</h1>
          <p style={{ fontSize: 14, color: 'var(--color-text-muted)', margin: '4px 0 0 0' }}>
            {zip
              ? `Partners near ${zip} — geo filtering coming soon, showing all Columbus & 70mi partners for now.`
              : 'Trusted partners for Columbus, OH & 70mi radius'}
          </p>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', fontStyle: 'italic', margin: '12px 0 0 0' }}>
            Vetted businesses RivetDog contractors actually use. More coming soon.
          </p>
        </div>

        {/* Filter bar */}
        <div style={{
          background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12,
          padding: 16, display: 'flex', flexDirection: 'row', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap',
          marginBottom: 24,
        }}>
          {/* Search */}
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={filterLabel}>Search</div>
            <input
              type="text"
              placeholder="Search partners…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ ...filterInput, width: '100%', boxSizing: 'border-box' }}
            />
          </div>

          {/* ZIP code */}
          <div style={{ width: 140 }}>
            <div style={filterLabel}>ZIP code</div>
            <input
              type="text"
              placeholder="43215"
              inputMode="numeric"
              maxLength={5}
              pattern="[0-9]{5}"
              value={zip}
              onChange={e => setZip(e.target.value.replace(/[^0-9]/g, '').slice(0, 5))}
              style={{ ...filterInput, width: '100%', boxSizing: 'border-box' }}
            />
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)', fontStyle: 'italic', marginTop: 4 }}>
              Geo filtering coming soon
            </div>
          </div>

          {/* Jump to category */}
          <div style={{ width: 220 }}>
            <div style={filterLabel}>Jump to</div>
            <select
              value={jumpTo}
              onChange={e => handleJumpTo(e.target.value)}
              style={{ ...filterInput, width: '100%', boxSizing: 'border-box' }}
            >
              <option value="" disabled>Jump to category…</option>
              {categories.map(cat => (
                <option key={cat.key} value={cat.key}>{cat.label}</option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <>
            <style>{`@keyframes skPulse { 0%, 100% { opacity: 0.6; } 50% { opacity: 1; } }`}</style>
            {[1, 2, 3].map(i => (
              <div
                key={i}
                style={{
                  height: 96, borderRadius: 12, background: 'var(--color-surface-2)',
                  marginBottom: 12, animation: 'skPulse 1.5s ease-in-out infinite',
                }}
              />
            ))}
          </>
        ) : (
          [...grouped.values()].map(({ category, items }, idx) => (
            <section key={category.id} id={`category-${category.key}`} style={{ marginTop: idx === 0 ? 0 : 32 }}>
              <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--color-text)', margin: '0 0 12px 0' }}>
                {category.label}
              </h2>
              {items.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                  {q ? `No matches for '${q}' in this category.` : 'No partners listed in this category yet.'}
                </p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 12 }}>
                  {items.map(res => (
                    <ResourceCard
                      key={res.id}
                      resource={res}
                      category={category}
                      isSuperAdmin={isSuperAdmin}
                      onLogoUploaded={handleLogoUploaded}
                    />
                  ))}
                </div>
              )}
            </section>
          ))
        )}
      </main>
    </div>
  )
}
