import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { useIsLite } from '../hooks/useIsLite'
import ResourceCard from '../components/resources/ResourceCard'
import { getResourceCategories, getResources } from '../data/resources'
import { UNCATEGORIZED_KEY, UNCATEGORIZED_LABEL, isVisible } from '../lib/academyVisibility'
import { US_STATES } from '../data/usStates'
import styles from './DashboardPage.module.css'

// Stable per-family audience sets (module-level for a stable effect dep).
// Matched against each row's audiences[] via array-overlap.
const LITE_AUDIENCES = ['lite']
const FIELDOS_AUDIENCES = ['fieldos']

const filterLabel = { fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-muted)', marginBottom: 6 }
const filterInput = { padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', background: 'var(--color-bg)', color: 'var(--color-text)', fontSize: 13 }

const TYPE_PILLS = [
  { value: 'partners', label: 'resources:types.partners' },
  { value: 'templates', label: 'resources:types.templates' },
  { value: 'guides', label: 'resources:types.guides' },
  { value: 'forms', label: 'resources:types.forms' },
]

const COMING_SOON_COPY = {
  templates: { title: 'resources:comingSoon.templates.title', description: 'resources:comingSoon.templates.description' },
  guides: { title: 'resources:comingSoon.guides.title', description: 'resources:comingSoon.guides.description' },
  forms: { title: 'resources:comingSoon.forms.title', description: 'resources:comingSoon.forms.description' },
}

const pillBase = { padding: '8px 16px', borderRadius: 9999, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', fontSize: 13, fontWeight: 500, cursor: 'pointer', transition: 'background 0.15s, border-color 0.15s, color 0.15s' }
const pillActive = { ...pillBase, background: 'var(--color-primary)', color: 'var(--color-on-primary, #fff)', borderColor: 'var(--color-primary)' }

export default function ResourcesPage() {
  const { isSuperAdmin, company } = useAuth()
  const { t } = useTranslation()
  const { isLite, resolved } = useIsLite()
  const audiences = isLite ? LITE_AUDIENCES : FIELDOS_AUDIENCES
  const companyState = company?.state || ''

  const [categories, setCategories] = useState([])
  const [resources, setResources] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [resourceType, setResourceType] = useState('partners')
  const [searchQuery, setSearchQuery] = useState('')
  const [stateFilter, setStateFilter] = useState(companyState || '__all')
  const [jumpTo, setJumpTo] = useState('')

  useEffect(() => { setStateFilter(companyState || '__all') }, [companyState])

  useEffect(() => {
    if (!resolved) return
    let cancelled = false
    ;(async () => {
      setLoadError(null)
      try {
        const [cats, ress] = await Promise.all([getResourceCategories(), getResources({ audiences })])
        if (!cancelled) { setCategories(cats); setResources(ress) }
      } catch (err) {
        // A query 400 must render as a visible error state, never a silent empty page.
        console.error('Resources load:', err)
        if (!cancelled) { setLoadError(err.message || t('resources:error.loadFailed')); setCategories([]); setResources([]) }
      }
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
    // Orphan rescue: a resource whose category is missing or inactive still surfaces,
    // under an "Other" group, rather than silently dropping out of the page.
    const other = { category: { id: UNCATEGORIZED_KEY, key: UNCATEGORIZED_KEY, label: UNCATEGORIZED_LABEL }, items: [] }
    for (const res of filteredResources) {
      const g = map.get(res.category_id)
      if (g) g.items.push(res)
      else other.items.push(res)
    }
    if (other.items.length) map.set(UNCATEGORIZED_KEY, other)
    return map
  }, [categories, filteredResources])

  // Upstream count for this viewer's family via the shared rule (drift-proof). A
  // non-zero count with nothing rendered means a client filter, not "no resources".
  // Resources have no admin_only column → role gate is a no-op (viewerIsAdmin: true).
  const viewerFamily = isLite ? 'lite' : 'fieldos'
  const familyPublishedCount = resources.filter(r => isVisible({ audiences: r.audiences, admin_only: false, viewerFamily, viewerIsAdmin: true })).length
  const renderedCount = [...grouped.values()].reduce((n, g) => n + g.items.length, 0)

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

  const stateLabel = stateFilter === '__all' ? t('resources:filters.allResources') : US_STATES.find(s => s.code === stateFilter)?.name || stateFilter

  return (
    <div className={styles.page}>
      
      <main className={styles.main}>
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--color-text)', margin: 0 }}>{t('resources:header.title')}</h1>
          <p style={{ fontSize: 14, color: 'var(--color-text-muted)', margin: '4px 0 0 0' }}>
            {stateFilter === '__all' ? t('resources:header.subtitleAll') : t('resources:header.subtitleState', { state: stateLabel })}
          </p>
          {!companyState && (
            <p style={{ fontSize: 13, color: '#f59e0b', fontStyle: 'italic', margin: '8px 0 0 0' }}>
              {t('resources:stateHint.before')}<a href="/settings" style={{ color: 'var(--color-primary)' }}>{t('resources:stateHint.link')}</a>{t('resources:stateHint.after')}
            </p>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
            {TYPE_PILLS.map(p => (
              <button key={p.value} type="button" onClick={() => setResourceType(p.value)} style={resourceType === p.value ? pillActive : pillBase}>{t(p.label)}</button>
            ))}
          </div>
        </div>

        {resourceType !== 'partners' && (() => {
          const copy = COMING_SOON_COPY[resourceType]
          return (
            <div style={{ padding: '56px 32px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12, textAlign: 'center', maxWidth: 600, margin: '0 auto' }}>
              <span style={{ display: 'inline-block', padding: '4px 14px', borderRadius: 9999, background: '#f27243', color: '#fff', fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 20 }}>{t('resources:comingSoon.badge')}</span>
              <h2 style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-text)', margin: '0 0 12px 0' }}>{t(copy.title)}</h2>
              <p style={{ fontSize: 14, color: 'var(--color-text-muted)', lineHeight: 1.6, margin: '0 auto 20px auto', maxWidth: 480 }}>{t(copy.description)}</p>
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)', fontStyle: 'italic', margin: 0 }}>{t('resources:comingSoon.footer')}</p>
            </div>
          )
        })()}

        {resourceType === 'partners' && <>
          <div style={{
            background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12,
            padding: 16, display: 'flex', flexDirection: 'row', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 24,
          }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={filterLabel}>{t('resources:filters.search')}</div>
              <input type="text" placeholder={t('resources:filters.searchPlaceholder')} value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                style={{ ...filterInput, width: '100%', boxSizing: 'border-box' }} />
            </div>
            <div style={{ width: 180 }}>
              <div style={filterLabel}>{t('resources:filters.state')}</div>
              <select value={stateFilter} onChange={e => setStateFilter(e.target.value)}
                style={{ ...filterInput, width: '100%', boxSizing: 'border-box' }}>
                <option value="__all">{t('resources:filters.allResources')}</option>
                {US_STATES.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
              </select>
            </div>
            <div style={{ width: 220 }}>
              <div style={filterLabel}>{t('resources:filters.jumpTo')}</div>
              <select value={jumpTo} onChange={e => handleJumpTo(e.target.value)}
                style={{ ...filterInput, width: '100%', boxSizing: 'border-box' }}>
                <option value="" disabled>{t('resources:filters.jumpToPlaceholder')}</option>
                {categories.map(cat => <option key={cat.key} value={cat.key}>{cat.label}</option>)}
              </select>
            </div>
          </div>

          {loadError ? (
            <div style={{ padding: '40px 24px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12, textAlign: 'center' }}>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-text)', margin: '0 0 8px' }}>{t('resources:error.title')}</h2>
              <p style={{ fontSize: 14, color: 'var(--color-text-muted)', margin: '0 0 8px' }}>{t('resources:error.body')}</p>
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: 0 }}>{loadError}</p>
            </div>
          ) : loading ? (
            <>
              <style>{`@keyframes skPulse { 0%, 100% { opacity: 0.6; } 50% { opacity: 1; } }`}</style>
              {[1, 2, 3].map(i => (
                <div key={i} style={{ height: 96, borderRadius: 12, background: 'var(--color-surface-2)', marginBottom: 12, animation: 'skPulse 1.5s ease-in-out infinite' }} />
              ))}
            </>
          ) : renderedCount === 0 && familyPublishedCount > 0 ? (
            // Partners ARE published for this plan — the blank is a client-side filter.
            (() => {
              console.warn('[Resources] rendered empty with', familyPublishedCount, 'family-published resources. Active gates:',
                { search: searchQuery.trim() || null, state: stateFilter !== '__all' ? stateFilter : null })
              return (
                <div style={{ padding: '40px 24px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12, textAlign: 'center' }}>
                  <p style={{ fontSize: 14, color: 'var(--color-text-muted)', margin: 0 }}>
                    {t('resources:filterHidden', { count: familyPublishedCount, filters: `${stateLabel.toLowerCase()}${searchQuery.trim() ? ` · “${searchQuery.trim()}”` : ''}` })}
                  </p>
                </div>
              )
            })()
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
