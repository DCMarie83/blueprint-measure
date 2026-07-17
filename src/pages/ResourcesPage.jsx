import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import { useIsLite } from '../hooks/useIsLite'
import AppHeader from '../components/AppHeader'
import ResourceCard from '../components/resources/ResourceCard'
import { getResourceCategories, getResources } from '../data/resources'
import { US_STATES } from '../data/usStates'
import styles from './DashboardPage.module.css'

// Stable per-family audience sets (module-level for a stable effect dep).
// Matched against each row's audiences[] via array-overlap.
const LITE_AUDIENCES = ['lite']
const FIELDOS_AUDIENCES = ['fieldos']

const filterLabel = { fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-muted)', marginBottom: 6 }
const filterInput = { padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', background: 'var(--color-bg)', color: 'var(--color-text)', fontSize: 13 }

const TYPE_PILLS = [
  { value: 'partners', label: 'Partners' },
  { value: 'templates', label: 'Templates' },
  { value: 'guides', label: 'Guides' },
  { value: 'forms', label: 'Forms' },
]

const COMING_SOON_COPY = {
  templates: { title: 'Templates', description: 'Downloadable contract templates, scope-of-work documents, change order forms, and estimate boilerplate. Built specifically for trade contractors — no generic legalese.' },
  guides: { title: 'Guides', description: 'How-to articles on pricing your work, hiring crew, scaling beyond yourself, dispute resolution, and the business side of running a trade contracting company.' },
  forms: { title: 'Forms', description: 'Lien releases, waivers, certifications, and the legal paperwork you actually need on every job. State-specific where it matters.' },
}

const pillBase = { padding: '8px 16px', borderRadius: 9999, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', fontSize: 13, fontWeight: 500, cursor: 'pointer', transition: 'background 0.15s, border-color 0.15s, color 0.15s' }
const pillActive = { ...pillBase, background: 'var(--color-primary)', color: 'var(--color-on-primary, #fff)', borderColor: 'var(--color-primary)' }

export default function ResourcesPage() {
  const { isSuperAdmin, company } = useAuth()
  const { isLite, resolved } = useIsLite()
  const audiences = isLite ? LITE_AUDIENCES : FIELDOS_AUDIENCES
  const companyState = company?.state || ''

  const [categories, setCategories] = useState([])
  const [resources, setResources] = useState([])
  const [loading, setLoading] = useState(true)
  const [resourceType, setResourceType] = useState('partners')
  const [searchQuery, setSearchQuery] = useState('')
  const [stateFilter, setStateFilter] = useState(companyState || '__all')
  const [jumpTo, setJumpTo] = useState('')

  useEffect(() => { setStateFilter(companyState || '__all') }, [companyState])

  useEffect(() => {
    if (!resolved) return
    let cancelled = false
    ;(async () => {
      try {
        const [cats, ress] = await Promise.all([getResourceCategories(), getResources({ audiences })])
        if (!cancelled) { setCategories(cats); setResources(ress) }
      } catch (err) { if (!cancelled) alert(err.message) }
      finally { if (!cancelled) setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [resolved, audiences])

  function handleLogoUploaded(resourceId, newUrl) {
    setResources(prev => prev.map(r => r.id === resourceId ? { ...r, logo_url: newUrl } : r))
  }

  const filteredResources = useMemo(() => {
    let filtered = resources
    // State filter
    if (stateFilter && stateFilter !== '__all') {
      filtered = filtered.filter(r => !r.states?.length || r.states.includes(stateFilter))
    }
    // Search
    const q = searchQuery.trim().toLowerCase()
    if (q) filtered = filtered.filter(r => r.name.toLowerCase().includes(q) || (r.description || '').toLowerCase().includes(q))
    return filtered
  }, [resources, stateFilter, searchQuery])

  const grouped = useMemo(() => {
    const map = new Map()
    for (const cat of categories) map.set(cat.id, { category: cat, items: [] })
    for (const res of filteredResources) {
      const g = map.get(res.category_id)
      if (g) g.items.push(res)
    }
    return map
  }, [categories, filteredResources])

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

  const stateLabel = stateFilter === '__all' ? 'All resources' : US_STATES.find(s => s.code === stateFilter)?.name || stateFilter

  return (
    <div className={styles.page}>
      <AppHeader />
      <main className={styles.main}>
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--color-text)', margin: 0 }}>Resources</h1>
          <p style={{ fontSize: 14, color: 'var(--color-text-muted)', margin: '4px 0 0 0' }}>
            {stateFilter === '__all' ? 'Trusted partners RivetDog contractors actually use.' : `Partners for ${stateLabel} + nationwide.`}
          </p>
          {!companyState && (
            <p style={{ fontSize: 13, color: '#f59e0b', fontStyle: 'italic', margin: '8px 0 0 0' }}>
              Set your state in <a href="/settings" style={{ color: 'var(--color-primary)' }}>Settings → Branding</a> to see local resources.
            </p>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
            {TYPE_PILLS.map(p => (
              <button key={p.value} type="button" onClick={() => setResourceType(p.value)} style={resourceType === p.value ? pillActive : pillBase}>{p.label}</button>
            ))}
          </div>
        </div>

        {resourceType !== 'partners' && (() => {
          const copy = COMING_SOON_COPY[resourceType]
          return (
            <div style={{ padding: '56px 32px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12, textAlign: 'center', maxWidth: 600, margin: '0 auto' }}>
              <span style={{ display: 'inline-block', padding: '4px 14px', borderRadius: 9999, background: '#f27243', color: '#fff', fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 20 }}>Coming Soon</span>
              <h2 style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-text)', margin: '0 0 12px 0' }}>{copy.title}</h2>
              <p style={{ fontSize: 14, color: 'var(--color-text-muted)', lineHeight: 1.6, margin: '0 auto 20px auto', maxWidth: 480 }}>{copy.description}</p>
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)', fontStyle: 'italic', margin: 0 }}>We're building this now. Drop a request via the feedback form if there's something specific you need first.</p>
            </div>
          )
        })()}

        {resourceType === 'partners' && <>
          <div style={{
            background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12,
            padding: 16, display: 'flex', flexDirection: 'row', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 24,
          }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={filterLabel}>Search</div>
              <input type="text" placeholder="Search partners…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                style={{ ...filterInput, width: '100%', boxSizing: 'border-box' }} />
            </div>
            <div style={{ width: 180 }}>
              <div style={filterLabel}>State</div>
              <select value={stateFilter} onChange={e => setStateFilter(e.target.value)}
                style={{ ...filterInput, width: '100%', boxSizing: 'border-box' }}>
                <option value="__all">All resources</option>
                {US_STATES.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
              </select>
            </div>
            <div style={{ width: 220 }}>
              <div style={filterLabel}>Jump to</div>
              <select value={jumpTo} onChange={e => handleJumpTo(e.target.value)}
                style={{ ...filterInput, width: '100%', boxSizing: 'border-box' }}>
                <option value="" disabled>Jump to category…</option>
                {categories.map(cat => <option key={cat.key} value={cat.key}>{cat.label}</option>)}
              </select>
            </div>
          </div>

          {loading ? (
            <>
              <style>{`@keyframes skPulse { 0%, 100% { opacity: 0.6; } 50% { opacity: 1; } }`}</style>
              {[1, 2, 3].map(i => (
                <div key={i} style={{ height: 96, borderRadius: 12, background: 'var(--color-surface-2)', marginBottom: 12, animation: 'skPulse 1.5s ease-in-out infinite' }} />
              ))}
            </>
          ) : (
            [...grouped.values()]
              .filter(({ items }) => items.length > 0)
              .map(({ category, items }, idx) => (
                <section key={category.id} id={`category-${category.key}`} style={{ marginTop: idx === 0 ? 0 : 32 }}>
                  <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--color-text)', margin: '0 0 12px 0' }}>{category.label}</h2>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 12 }}>
                    {items.map(res => (
                      <ResourceCard key={res.id} resource={res} category={category} isSuperAdmin={isSuperAdmin} onLogoUploaded={handleLogoUploaded} />
                    ))}
                  </div>
                </section>
              ))
          )}
        </>}
      </main>
    </div>
  )
}
