import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  getAllCategories, getAllResources,
  createCategory, updateCategory, deleteCategory,
  createResource, updateResource, deleteResource,
} from '../../data/resources'
import { US_STATES } from '../../data/usStates'
import { AudienceCheckboxes, AudienceBadges } from '../../components/admin/AudienceControls'
import { visibilitySummary } from '../../lib/academyVisibility'
import styles from './sections.module.css'

// Reachability indicator via the shared rule (same one the tenant pages use).
function VisibleTo({ row }) {
  const { t } = useTranslation()
  const s = visibilitySummary(row)
  return (
    <span style={{ fontSize: 12, fontWeight: 600, color: s.reason ? 'var(--color-danger, #dc2626)' : 'var(--color-text)' }}>
      {s.reason ? t('admin:resources.nobody', { reason: s.reason }) : s.text}
    </span>
  )
}

const EMPTY_CAT = { key: '', label: '', sort_order: 0, is_active: true }
const EMPTY_RES = {
  category_id: '', name: '', slug: '', description: '', website_url: '', phone: '', email: '',
  service_area_text: '', is_featured: false, is_active: true, sort_order: 0, states: [], audiences: ['fieldos'],
}

export default function ResourcesAdminPage() {
  const { t } = useTranslation()
  const [categories, setCategories] = useState([])
  const [resources, setResources] = useState([])
  const [loading, setLoading] = useState(true)

  const [catModal, setCatModal] = useState(null)
  const [catSaving, setCatSaving] = useState(false)
  const [resModal, setResModal] = useState(null)
  const [resSaving, setResSaving] = useState(false)

  async function loadAll() {
    setLoading(true)
    try {
      const [cats, ress] = await Promise.all([getAllCategories(), getAllResources()])
      setCategories(cats); setResources(ress)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  useEffect(() => { loadAll() }, [])

  // ── Category CRUD ──────────────────────────────────────────────────────
  async function handleCatSave(e) {
    e.preventDefault(); setCatSaving(true)
    try {
      const payload = { key: catModal.key, label: catModal.label, sort_order: parseInt(catModal.sort_order) || 0, is_active: catModal.is_active }
      if (catModal.id) await updateCategory(catModal.id, payload)
      else await createCategory(payload)
      setCatModal(null); await loadAll()
    } catch (err) { alert(t('admin:resources.error', { message: err.message })) }
    finally { setCatSaving(false) }
  }

  async function handleCatDelete(id) {
    if (!window.confirm(t('admin:resources.deleteCategoryConfirm'))) return
    try { await deleteCategory(id); await loadAll() }
    catch (err) { alert(err.message) }
  }

  // ── Resource CRUD ──────────────────────────────────────────────────────
  async function handleResSave(e) {
    e.preventDefault()
    if (!(resModal.audiences?.length)) { alert(t('admin:resources.pickAudience')); return }
    setResSaving(true)
    try {
      const payload = {
        category_id: resModal.category_id || null, name: resModal.name,
        slug: resModal.slug || resModal.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/,''),
        description: resModal.description || null, website_url: resModal.website_url || null,
        phone: resModal.phone || null, email: resModal.email || null,
        service_area_text: resModal.service_area_text || null,
        is_featured: resModal.is_featured, is_active: resModal.is_active,
        sort_order: parseInt(resModal.sort_order) || 0,
        states: resModal.states || [],
        audiences: resModal.audiences,
      }
      if (resModal.id) await updateResource(resModal.id, payload)
      else await createResource(payload)
      setResModal(null); await loadAll()
    } catch (err) { alert(t('admin:resources.error', { message: err.message })) }
    finally { setResSaving(false) }
  }

  async function handleResDelete(id) {
    if (!window.confirm(t('admin:resources.deleteResourceConfirm'))) return
    try { await deleteResource(id); await loadAll() }
    catch (err) { alert(err.message) }
  }

  function toggleState(code) {
    setResModal(prev => {
      const s = prev.states || []
      return { ...prev, states: s.includes(code) ? s.filter(c => c !== code) : [...s, code] }
    })
  }

  if (loading) return <div className={styles.empty}>{t('common:misc.loading')}</div>

  return (
    <div>
      <h1 className={styles.pageTitle}>{t('admin:resources.title')}</h1>

      {/* ── Categories ──────────────────────────────────────────── */}
      <div className={styles.sectionCard}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 className={styles.sectionCardTitle} style={{ margin: 0 }}>{t('admin:resources.categories')}</h2>
          <button className={styles.addBtn} onClick={() => setCatModal({ ...EMPTY_CAT })}>{t('admin:resources.addCategory')}</button>
        </div>
        {categories.length === 0 ? <div className={styles.empty}>{t('admin:resources.noCategories')}</div> : (
          <div className={styles.tableWrap}><table className={styles.table}>
            <thead><tr>
              <th className={styles.th}>{t('admin:resources.colOrder')}</th><th className={styles.th}>{t('admin:resources.colKey')}</th><th className={styles.th}>{t('admin:resources.colLabel')}</th>
              <th className={styles.th}>{t('admin:resources.colStatus')}</th><th className={styles.th}>{t('admin:resources.colResources')}</th><th className={styles.th}></th>
            </tr></thead>
            <tbody>{categories.map(c => (
              <tr key={c.id} className={styles.tr}>
                <td className={styles.td}>{c.sort_order}</td>
                <td className={styles.td} style={{ fontFamily: 'monospace', fontSize: 12 }}>{c.key}</td>
                <td className={styles.td} style={{ fontWeight: 600 }}>{c.label}</td>
                <td className={styles.td}><span className={`${styles.badge} ${c.is_active ? styles.badgeActive : styles.badgeInactive}`}>{c.is_active ? t('admin:resources.statusActive') : t('admin:resources.statusInactive')}</span></td>
                <td className={styles.td}>{resources.filter(r => r.category_id === c.id).length}</td>
                <td className={styles.td}>
                  <button className={styles.iconBtn} onClick={() => setCatModal({ ...c })}>{t('common:action.edit')}</button>
                  <button className={styles.deleteBtn} style={{ marginLeft: 6 }} onClick={() => handleCatDelete(c.id)}>{t('common:action.delete')}</button>
                </td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>

      {/* ── Resources ───────────────────────────────────────────── */}
      <div className={styles.sectionCard}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 className={styles.sectionCardTitle} style={{ margin: 0 }}>{t('admin:resources.resources')}</h2>
          <button className={styles.addBtn} onClick={() => setResModal({ ...EMPTY_RES })}>{t('admin:resources.addResource')}</button>
        </div>
        {resources.length === 0 ? <div className={styles.empty}>{t('admin:resources.noResources')}</div> : (
          <div className={styles.tableWrap}><table className={styles.table}>
            <thead><tr>
              <th className={styles.th}>{t('admin:resources.colName')}</th><th className={styles.th}>{t('admin:resources.colCategory')}</th><th className={styles.th}>{t('admin:resources.colAudience')}</th><th className={styles.th}>{t('admin:resources.colVisibleTo')}</th><th className={styles.th}>{t('admin:resources.colStates')}</th>
              <th className={styles.th}>{t('admin:resources.colFeatured')}</th><th className={styles.th}>{t('admin:resources.colStatus')}</th><th className={styles.th}></th>
            </tr></thead>
            <tbody>{resources.map(r => {
              const cat = categories.find(c => c.id === r.category_id)
              return (
                <tr key={r.id} className={styles.tr}>
                  <td className={styles.td} style={{ fontWeight: 600 }}>{r.name}</td>
                  <td className={styles.td}>{cat?.label || '—'}</td>
                  <td className={styles.td}><AudienceBadges value={r.audiences} /></td>
                  <td className={styles.td}><VisibleTo row={r} /></td>
                  <td className={styles.td} style={{ fontSize: 12 }}>{r.states?.length ? r.states.join(', ') : t('admin:resources.national')}</td>
                  <td className={styles.td}>{r.is_featured ? '★' : ''}</td>
                  <td className={styles.td}><span className={`${styles.badge} ${r.is_active ? styles.badgeActive : styles.badgeInactive}`}>{r.is_active ? t('admin:resources.statusActive') : t('admin:resources.statusInactive')}</span></td>
                  <td className={styles.td}>
                    <button className={styles.iconBtn} onClick={() => setResModal({ ...r, states: r.states || [], audiences: r.audiences || [] })}>{t('common:action.edit')}</button>
                    <button className={styles.deleteBtn} style={{ marginLeft: 6 }} onClick={() => handleResDelete(r.id)}>{t('common:action.delete')}</button>
                  </td>
                </tr>
              )
            })}</tbody>
          </table></div>
        )}
      </div>

      {/* ── Category modal ──────────────────────────────────────── */}
      {catModal && (
        <ModalBackdrop onClose={() => setCatModal(null)}>
          <h3 style={{ margin: '0 0 16px' }}>{catModal.id ? t('admin:resources.editCategory') : t('admin:resources.newCategory')}</h3>
          <form onSubmit={handleCatSave}>
            <div className={styles.formGrid}>
              <div className={styles.formField}><label className={styles.formLabel}>{t('admin:resources.fieldLabel')}</label><input className={styles.formInput} required value={catModal.label} onChange={e => setCatModal(c => ({ ...c, label: e.target.value }))} /></div>
              <div className={styles.formField}><label className={styles.formLabel}>{t('admin:resources.fieldKeySlug')}</label><input className={styles.formInput} required value={catModal.key} onChange={e => setCatModal(c => ({ ...c, key: e.target.value }))} /></div>
              <div className={styles.formField}><label className={styles.formLabel}>{t('admin:resources.fieldSortOrder')}</label><input className={styles.formInput} type="number" value={catModal.sort_order} onChange={e => setCatModal(c => ({ ...c, sort_order: e.target.value }))} /></div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, margin: '12px 0', cursor: 'pointer' }}>
              <input type="checkbox" checked={catModal.is_active} onChange={e => setCatModal(c => ({ ...c, is_active: e.target.checked }))} /> {t('admin:resources.active')}
            </label>
            <div className={styles.formActions}>
              <button type="submit" className={styles.submitBtn} disabled={catSaving}>{catSaving ? t('admin:resources.saving') : t('common:action.save')}</button>
              <button type="button" className={styles.secondaryBtn} onClick={() => setCatModal(null)}>{t('common:action.cancel')}</button>
            </div>
          </form>
        </ModalBackdrop>
      )}

      {/* ── Resource modal ──────────────────────────────────────── */}
      {resModal && (
        <ModalBackdrop onClose={() => setResModal(null)}>
          <h3 style={{ margin: '0 0 16px' }}>{resModal.id ? t('admin:resources.editResource') : t('admin:resources.newResource')}</h3>
          <form onSubmit={handleResSave}>
            <div className={styles.formGrid}>
              <div className={styles.formField}><label className={styles.formLabel}>{t('admin:resources.fieldName')}</label><input className={styles.formInput} required value={resModal.name} onChange={e => setResModal(r => ({ ...r, name: e.target.value }))} /></div>
              <div className={styles.formField}><label className={styles.formLabel}>{t('admin:resources.fieldCategory')}</label>
                <select className={styles.formSelect} value={resModal.category_id} onChange={e => setResModal(r => ({ ...r, category_id: e.target.value }))}>
                  <option value="">—</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
            </div>
            <div className={styles.formGrid}>
              <div className={styles.formField}><label className={styles.formLabel}>{t('admin:resources.fieldSlug')}</label><input className={styles.formInput} value={resModal.slug} onChange={e => setResModal(r => ({ ...r, slug: e.target.value }))} placeholder={t('admin:resources.slugPlaceholder')} /></div>
              <div className={styles.formField}><label className={styles.formLabel}>{t('admin:resources.fieldSortOrder')}</label><input className={styles.formInput} type="number" value={resModal.sort_order} onChange={e => setResModal(r => ({ ...r, sort_order: e.target.value }))} /></div>
            </div>
            <div className={styles.formField} style={{ marginBottom: 12 }}>
              <label className={styles.formLabel}>{t('admin:resources.fieldDescription')}</label>
              <textarea className={styles.formInput} style={{ minHeight: 60, resize: 'vertical' }} value={resModal.description ?? ''} onChange={e => setResModal(r => ({ ...r, description: e.target.value }))} />
            </div>
            <div className={styles.formGrid}>
              <div className={styles.formField}><label className={styles.formLabel}>{t('admin:resources.fieldWebsiteUrl')}</label><input className={styles.formInput} value={resModal.website_url ?? ''} onChange={e => setResModal(r => ({ ...r, website_url: e.target.value }))} /></div>
              <div className={styles.formField}><label className={styles.formLabel}>{t('admin:resources.fieldPhone')}</label><input className={styles.formInput} value={resModal.phone ?? ''} onChange={e => setResModal(r => ({ ...r, phone: e.target.value }))} /></div>
              <div className={styles.formField}><label className={styles.formLabel}>{t('admin:resources.fieldEmail')}</label><input className={styles.formInput} value={resModal.email ?? ''} onChange={e => setResModal(r => ({ ...r, email: e.target.value }))} /></div>
            </div>
            <div className={styles.formField} style={{ marginBottom: 12 }}>
              <label className={styles.formLabel}>{t('admin:resources.fieldServiceArea')}</label>
              <input className={styles.formInput} value={resModal.service_area_text ?? ''} onChange={e => setResModal(r => ({ ...r, service_area_text: e.target.value }))} placeholder={t('admin:resources.serviceAreaPlaceholder')} />
            </div>

            <div className={styles.formField} style={{ marginBottom: 12 }}>
              <label className={styles.formLabel}>{t('admin:resources.fieldAudience')}</label>
              <AudienceCheckboxes value={resModal.audiences} onChange={next => setResModal(r => ({ ...r, audiences: next }))} />
            </div>

            {/* Geo: states */}
            <div className={styles.formField} style={{ marginBottom: 12 }}>
              <label className={styles.formLabel}>{t('admin:resources.fieldAvailableStates')}</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, margin: '6px 0', cursor: 'pointer' }}>
                <input type="checkbox" checked={(resModal.states || []).length === 0} onChange={e => { if (e.target.checked) setResModal(r => ({ ...r, states: [] })) }} /> {t('admin:resources.availableNationally')}
              </label>
              {(resModal.states || []).length > 0 || !(resModal.states || []).length === 0 ? null : null}
              {(resModal.states?.length > 0 || !(resModal.states?.length === 0 && true)) ? null : null}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxHeight: 160, overflowY: 'auto', padding: 4, border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', marginTop: 4 }}>
                {US_STATES.map(s => (
                  <label key={s.code} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12, cursor: 'pointer', minWidth: 80 }}>
                    <input type="checkbox" checked={(resModal.states || []).includes(s.code)} onChange={() => toggleState(s.code)} disabled={(resModal.states || []).length === 0} />
                    {s.code}
                  </label>
                ))}
              </div>
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>
                {(resModal.states || []).length === 0 ? t('admin:resources.showsAll') : t('admin:resources.showsIn', { states: resModal.states.join(', ') })}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={resModal.is_featured} onChange={e => setResModal(r => ({ ...r, is_featured: e.target.checked }))} /> {t('admin:resources.featured')}
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={resModal.is_active} onChange={e => setResModal(r => ({ ...r, is_active: e.target.checked }))} /> {t('admin:resources.active')}
              </label>
            </div>
            <div className={styles.formActions}>
              <button type="submit" className={styles.submitBtn} disabled={resSaving}>{resSaving ? t('admin:resources.saving') : t('common:action.save')}</button>
              <button type="button" className={styles.secondaryBtn} onClick={() => setResModal(null)}>{t('common:action.cancel')}</button>
            </div>
          </form>
        </ModalBackdrop>
      )}
    </div>
  )
}

function ModalBackdrop({ children, onClose }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 24 }} onClick={onClose}>
      <div style={{ background: 'var(--color-surface)', borderRadius: 12, padding: 24, maxWidth: 700, width: '100%', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}
