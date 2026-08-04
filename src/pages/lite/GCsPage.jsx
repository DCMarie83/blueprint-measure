import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { HardHat, Plus, Mail, Phone, ChevronRight, Pencil } from 'lucide-react'
import Modal from '../../components/ui/Modal'
import GCForm from './GCForm'
import { useClients } from '../../hooks/useClients'
import { useEffectiveCompany } from '../../hooks/useEffectiveCompany'
import { supabase } from '../../lib/supabase'
import { GC_CLIENT_TYPE } from '../../lib/lite'
import { EMPTY, TOASTS } from '../../lib/liteVoice'
import styles from './lite.module.css'

export default function GCsPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { clients, loading, createClient, updateClient, refetch } = useClients()
  const { companyId } = useEffectiveCompany()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [catalogCounts, setCatalogCounts] = useState({})
  const [toast, setToast] = useState('')

  const gcs = clients.filter(c => c.client_type === GC_CLIENT_TYPE)

  // Catalog item count per GC, in one query grouped client-side.
  useEffect(() => {
    if (!companyId || gcs.length === 0) return
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase
        .from('work_items')
        .select('client_id')
        .eq('company_id', companyId)
      if (error || cancelled) return
      const counts = {}
      for (const row of data ?? []) {
        counts[row.client_id] = (counts[row.client_id] ?? 0) + 1
      }
      setCatalogCounts(counts)
    })()
    return () => { cancelled = true }
  }, [companyId, gcs.length])

  async function handleSubmit(payload) {
    const isNew = !editing
    if (editing) {
      await updateClient(editing.id, payload)
    } else {
      await createClient(payload, [])
    }
    setShowForm(false)
    setEditing(null)
    refetch()
    if (isNew) {
      setToast(t(TOASTS.gcAdded))
      setTimeout(() => setToast(''), 2200)
    }
  }

  function openAdd() { setEditing(null); setShowForm(true) }
  function openEdit(gc) { setEditing(gc); setShowForm(true) }

  return (
    <div className={styles.page}>
      
      <main className={styles.main}>
        {toast && <div className={styles.card} style={{ background: 'var(--color-action-open)', color: '#fff', borderColor: 'transparent' }}>{toast}</div>}
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>{t('lite:gcs.title')}</h1>
            <p className={styles.subtitle}>{t('lite:gcs.subtitle')}</p>
          </div>
          {gcs.length > 0 && (
            <button className={styles.primaryBtn} onClick={openAdd}><Plus size={16} /> {t('lite:gcs.addGc')}</button>
          )}
        </div>

        {loading ? (
          <div className={styles.loading}>{t('common:misc.loading')}</div>
        ) : gcs.length === 0 ? (
          <div className={styles.empty}>
            <HardHat size={44} />
            <div className={styles.emptyTitle}>{t(EMPTY.gcs)}</div>
            <p>{t('lite:gcs.emptyHelp')}</p>
            <button className={styles.primaryBtn} style={{ marginTop: 14 }} onClick={openAdd}><Plus size={16} /> {t('lite:gcs.addFirstGc')}</button>
          </div>
        ) : (
          gcs.map(gc => (
            <button key={gc.id} className={styles.listRow} onClick={() => navigate(`/gcs/${gc.id}/catalog`)}>
              <div className={styles.entryMain}>
                <div className={styles.listName}>{gc.business_name || gc.display_name}</div>
                <div className={styles.listSub}>
                  {gc.primary_email && <><Mail size={12} style={{ verticalAlign: -1 }} /> {gc.primary_email}&nbsp;&nbsp;</>}
                  {gc.primary_phone && <><Phone size={12} style={{ verticalAlign: -1 }} /> {gc.primary_phone}</>}
                </div>
                <div className={styles.listSub}>
                  {t('lite:gcs.jobsCount', { count: gc.active_jobs_count ?? 0 })}
                  &nbsp;·&nbsp;
                  {t('lite:gcs.catalogItems', { count: catalogCounts[gc.id] ?? 0 })}
                </div>
              </div>
              <div className={styles.listRight} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className={styles.iconBtn} role="button" tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); openEdit(gc) }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); openEdit(gc) } }}
                  aria-label={t('lite:gcs.editGc')}>
                  <Pencil size={16} />
                </span>
                <ChevronRight size={18} className={styles.muted} />
              </div>
            </button>
          ))
        )}
      </main>

      {showForm && (
        <Modal title={editing ? t('lite:gcs.editGc') : t('lite:gcs.addGc')} onClose={() => { setShowForm(false); setEditing(null) }}>
          <GCForm initial={editing} onSubmit={handleSubmit} onCancel={() => { setShowForm(false); setEditing(null) }} />
        </Modal>
      )}
    </div>
  )
}
