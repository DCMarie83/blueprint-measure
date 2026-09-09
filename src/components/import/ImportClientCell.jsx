import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import Modal from '../ui/Modal'
import ClientPicker from '../clients/ClientPicker'
import { isPlaceholderSource } from '../../utils/import/importHelpers'
import styles from './ImportWizardModal.module.css'

// Lane V: the Client cell in the import Review step. Shows the row's resolved
// client (matched, "New:" when the writer would create one, or the chosen
// override) and opens a picker: search across the company's clients, or a
// "New client" mini-form (name required, optional business name). The choice
// only sets the row's override — every write still goes through the writer.

const PLACEHOLDER_NAME = /^(UNKNOWN|NEEDS REVIEW)\s*\(/i

export function isPlaceholderClient(c) {
  if (!c) return false
  return isPlaceholderSource(c.import_source) || PLACEHOLDER_NAME.test(c.display_name || '')
}

export default function ImportClientCell({ row, override, clients, onChange }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [pickedId, setPickedId] = useState(null)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newBusiness, setNewBusiness] = useState('')
  const [formError, setFormError] = useState('')

  const matched = row._clientId ? clients.find(c => c.id === row._clientId) : null
  const label = override
    ? override.name
    : matched
      ? matched.display_name
      : (row.client || '').trim()
  const wouldCreate = !override && !matched && !!(row.client || '').trim()
  const overrideCreates = override && !override.clientId

  function openPicker() {
    setPickedId(override?.clientId ?? row._clientId ?? null)
    setCreating(false)
    setNewName((row.client || '').trim())
    setNewBusiness('')
    setFormError('')
    setOpen(true)
  }

  function apply() {
    if (creating) {
      const name = newName.trim()
      if (!name) { setFormError(t('import:clientCell.nameRequired')); return }
      onChange({ clientId: null, name, businessName: newBusiness.trim() || null })
    } else if (pickedId) {
      const c = clients.find(x => x.id === pickedId)
      if (!c) return
      onChange({ clientId: c.id, name: c.display_name })
    } else {
      onChange(null) // cleared: back to the row's own resolution
    }
    setOpen(false)
  }

  return (
    <>
      <button
        type="button"
        onClick={openPicker}
        style={{ background: 'none', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius, 8px)', padding: '2px 8px', cursor: 'pointer', color: 'inherit', font: 'inherit', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        title={t('import:clientCell.changeTitle')}
      >
        {label || t('import:empty')}
      </button>
      {(wouldCreate || overrideCreates) && (
        <span className={styles.warnBadge}>{t('import:clientCell.newClient')}</span>
      )}
      {override && override.clientId && (
        <span className={styles.warnBadge}>{t('import:clientCell.changed')}</span>
      )}
      {!override && isPlaceholderClient(matched) && (
        <span className={styles.warnBadge}>{t('import:clientCell.placeholder')}</span>
      )}

      {open && (
        <Modal title={t('import:clientCell.modalTitle')} onClose={() => setOpen(false)}>
          <div onClick={e => e.stopPropagation()}>
            {!creating ? (
              <>
                <ClientPicker
                  clients={clients}
                  value={pickedId}
                  onChange={id => setPickedId(id)}
                />
                <button type="button" className={styles.templateLink} style={{ marginTop: 10 }} onClick={() => setCreating(true)}>
                  {t('import:clientCell.createNew')}
                </button>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ fontSize: 13 }}>
                  {t('import:clientCell.nameLabel')}
                  <input className={styles.mappingSelect} style={{ width: '100%', marginTop: 4 }} value={newName} onChange={e => setNewName(e.target.value)} />
                </label>
                <label style={{ fontSize: 13 }}>
                  {t('import:clientCell.businessLabel')}
                  <input className={styles.mappingSelect} style={{ width: '100%', marginTop: 4 }} value={newBusiness} onChange={e => setNewBusiness(e.target.value)} />
                </label>
                <button type="button" className={styles.templateLink} onClick={() => setCreating(false)}>
                  {t('import:clientCell.backToSearch')}
                </button>
                {formError && <div className={styles.error}>{formError}</div>}
              </div>
            )}
            <div className={styles.actions}>
              {override && (
                <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => { onChange(null); setOpen(false) }}>
                  {t('import:clientCell.clearOverride')}
                </button>
              )}
              <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => setOpen(false)}>{t('common:action.cancel')}</button>
              <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={apply} disabled={!creating && !pickedId && !override}>
                {t('common:action.save')}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
