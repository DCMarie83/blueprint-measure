import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Upload, Plus } from 'lucide-react'
import Modal from '../ui/Modal'
import ChangeOrderImportModal from './ChangeOrderImportModal'

const CO_STATUSES = ['proposed', 'approved', 'declined', 'void']

function fmtMoney(v) {
  const n = Number(v) || 0
  return `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const inputStyle = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', fontSize: 14, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-bg)', color: 'var(--color-text)' }
const labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', margin: '10px 0 4px' }

function ChangeOrderForm({ initial, onSubmit, onCancel, t }) {
  const [coNumber, setCoNumber] = useState(initial?.co_number ?? '')
  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [amount, setAmount] = useState(initial?.amount != null ? String(initial.amount) : '')
  const [status, setStatus] = useState(initial?.status ?? 'proposed')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    setError(null)
    try {
      await onSubmit({
        co_number: coNumber,
        title,
        description,
        amount: amount.trim() === '' ? null : Number(amount),
        status,
      })
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <label style={labelStyle}>{t('jobs:changeOrders.form.number')}</label>
      <input style={inputStyle} value={coNumber} onChange={e => setCoNumber(e.target.value)} placeholder="CO-1" />
      <label style={labelStyle}>{t('jobs:changeOrders.form.title')} *</label>
      <input style={inputStyle} value={title} onChange={e => setTitle(e.target.value)} required />
      <label style={labelStyle}>{t('jobs:changeOrders.form.description')}</label>
      <textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} value={description} onChange={e => setDescription(e.target.value)} />
      <label style={labelStyle}>{t('jobs:changeOrders.form.amount')}</label>
      <input style={inputStyle} type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" />
      <label style={labelStyle}>{t('jobs:changeOrders.form.status')}</label>
      <select style={inputStyle} value={status} onChange={e => setStatus(e.target.value)}>
        {CO_STATUSES.map(s => <option key={s} value={s}>{t(`jobs:changeOrders.status.${s}`)}</option>)}
      </select>
      {error && <div style={{ color: 'var(--color-danger, #dc2626)', fontSize: 13, marginTop: 10 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
        <button type="button" onClick={onCancel} style={{ padding: '9px 18px', background: 'none', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-muted)', cursor: 'pointer' }}>{t('common:action.cancel')}</button>
        <button type="submit" disabled={saving || !title.trim()} style={{ padding: '9px 18px', background: 'var(--color-primary)', border: 'none', borderRadius: 'var(--radius-md)', color: '#fff', fontWeight: 600, cursor: 'pointer', opacity: saving || !title.trim() ? 0.6 : 1 }}>
          {saving ? '…' : t('common:action.save')}
        </button>
      </div>
    </form>
  )
}

export default function ChangeOrdersSection({ projectId, projectName, isAdmin, changeOrders, approvedTotal, createChangeOrder, updateChangeOrder, deleteChangeOrder, refetch }) {
  const { t } = useTranslation()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [showImport, setShowImport] = useState(false)

  async function handleStatusChange(co, next) {
    if (next === co.status) return
    try {
      await updateChangeOrder(co.id, { status: next })
    } catch (err) {
      alert(t('jobs:changeOrders.updateFailed', { error: err.message }))
    }
  }

  return (
    <section style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 8, flexWrap: 'wrap' }}>
        <h3 style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 'var(--tracking-caps)', color: 'var(--color-text-muted)', margin: 0 }}>
          {t('jobs:changeOrders.title', { count: changeOrders.length })}
          {approvedTotal !== 0 && (
            <span style={{ marginLeft: 8, textTransform: 'none', letterSpacing: 'normal' }}>
              {t('jobs:changeOrders.approvedTotal', { amount: fmtMoney(approvedTotal) })}
            </span>
          )}
        </h3>
        {isAdmin && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setShowImport(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'none', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              <Upload size={14} /> {t('jobs:changeOrders.importBtn')}
            </button>
            <button
              onClick={() => { setEditing(null); setShowForm(true) }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'var(--color-primary)', color: 'var(--color-on-primary, #fff)', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              <Plus size={14} /> {t('jobs:changeOrders.add')}
            </button>
          </div>
        )}
      </div>

      {changeOrders.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>{t('jobs:changeOrders.empty')}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {changeOrders.map(co => (
            <div key={co.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', flexWrap: 'wrap' }}>
              {co.co_number && <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>{co.co_number}</span>}
              <span style={{ flex: 1, fontWeight: 600, fontSize: 14, minWidth: 120 }}>{co.title}</span>
              <span style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', color: Number(co.amount) < 0 ? 'var(--color-danger, #dc2626)' : 'var(--color-text)' }}>
                {co.amount != null ? fmtMoney(co.amount) : '—'}
              </span>
              {isAdmin ? (
                <select
                  value={co.status}
                  onChange={e => handleStatusChange(co, e.target.value)}
                  style={{ padding: '4px 8px', fontSize: 12, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', background: 'var(--color-bg)', color: 'var(--color-text)' }}
                >
                  {CO_STATUSES.map(s => <option key={s} value={s}>{t(`jobs:changeOrders.status.${s}`)}</option>)}
                </select>
              ) : (
                <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 9999, background: 'var(--color-surface-2)', color: 'var(--color-text-muted)', textTransform: 'capitalize' }}>{t(`jobs:changeOrders.status.${co.status}`)}</span>
              )}
              {isAdmin && (
                <>
                  <button onClick={() => { setEditing(co); setShowForm(true) }} style={{ fontSize: 12, background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', padding: '4px 6px' }}>
                    {t('common:action.edit')}
                  </button>
                  <button
                    onClick={async () => {
                      if (window.confirm(t('jobs:changeOrders.deleteConfirm'))) {
                        try { await deleteChangeOrder(co.id) }
                        catch (err) { alert(t('jobs:changeOrders.updateFailed', { error: err.message })) }
                      }
                    }}
                    style={{ fontSize: 12, background: 'none', border: 'none', color: 'var(--color-danger, #dc2626)', cursor: 'pointer', padding: '4px 6px' }}
                  >
                    {t('common:action.delete')}
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <Modal title={editing ? t('jobs:changeOrders.editTitle') : t('jobs:changeOrders.addTitle')} onClose={() => setShowForm(false)}>
          <ChangeOrderForm
            t={t}
            initial={editing}
            onCancel={() => setShowForm(false)}
            onSubmit={async (fields) => {
              if (editing) {
                await updateChangeOrder(editing.id, {
                  co_number: fields.co_number?.trim() || null,
                  title: fields.title.trim(),
                  description: fields.description?.trim() || null,
                  amount: fields.amount,
                  status: fields.status,
                })
              } else {
                await createChangeOrder(fields)
              }
              setShowForm(false)
            }}
          />
        </Modal>
      )}

      {showImport && (
        <Modal title={t('jobs:changeOrders.import.title')} onClose={() => setShowImport(false)}>
          <ChangeOrderImportModal
            onClose={() => setShowImport(false)}
            onImported={refetch}
            defaultProject={{ id: projectId, name: projectName }}
          />
        </Modal>
      )}
    </section>
  )
}
