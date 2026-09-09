import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import Modal from '../ui/Modal'
import ClientPicker from './ClientPicker'
import { useClients } from '../../hooks/useClients'
import { useAuth } from '../../context/AuthContext'
import { useEffectiveCompany } from '../../hooks/useEffectiveCompany'
import { supabase } from '../../lib/supabase'
import { moveJobToClient, moveRecordToClient } from '../../data/reassignClient'

// Lane V: "Change client" (contractor_admin only — pages gate the button).
// kind 'job' offers only the whole-job move; 'invoice'/'estimate' also offer
// moving just that record to a job under the target client (existing or
// created here, name/address prefilled from the current job). One shared
// helper does the writes; the ledger keys by invoice id and never moves.
export default function ChangeClientDialog({ kind, record, project, onClose, onMoved }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { companyId } = useEffectiveCompany()
  const { clients } = useClients()

  const [scope, setScope] = useState(kind === 'job' ? 'job' : 'record') // 'job' | 'record'
  const [targetClientId, setTargetClientId] = useState(null)
  const [targetJobs, setTargetJobs] = useState([])
  const [targetProjectId, setTargetProjectId] = useState('')
  const [createJob, setCreateJob] = useState(false)
  const [newJobName, setNewJobName] = useState(project?.name || '')
  const [newJobAddress, setNewJobAddress] = useState(project?.address || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  // Jobs of the chosen target client, for the move-only-this-record path.
  useEffect(() => {
    if (!targetClientId || scope !== 'record') { setTargetJobs([]); setTargetProjectId(''); return }
    let cancelled = false
    supabase.from('projects').select('id, name').eq('company_id', companyId).eq('client_id', targetClientId).is('deleted_at', null).order('name')
      .then(({ data }) => {
        if (cancelled) return
        setTargetJobs(data ?? [])
        setTargetProjectId('')
        setCreateJob((data ?? []).length === 0)
      })
    return () => { cancelled = true }
  }, [targetClientId, scope, companyId])

  const sameClient = targetClientId && targetClientId === (project?.client_id ?? null)
  const canConfirm = !!targetClientId && !busy && !(scope === 'job' && sameClient) &&
    (scope === 'job' || targetProjectId || (createJob && newJobName.trim()))

  async function handleConfirm() {
    setBusy(true)
    setError(null)
    try {
      if (scope === 'job') {
        await moveJobToClient({ companyId, userId: user?.id, projectId: project.id, targetClientId })
      } else {
        await moveRecordToClient({
          kind,
          companyId,
          userId: user?.id,
          recordId: record.id,
          targetClientId,
          targetProjectId: createJob ? null : targetProjectId || null,
          newJob: createJob ? { name: newJobName, address: newJobAddress } : null,
        })
      }
      onMoved?.()
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const label = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', margin: '12px 0 4px' }
  const input = { width: '100%', padding: '8px 10px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md, 8px)', background: 'var(--color-bg)', color: 'var(--color-text)', fontSize: 14 }

  return (
    <Modal title={t('clients:reassign.title')} onClose={onClose}>
      <div>
        {kind !== 'job' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}>
              <input type="radio" checked={scope === 'job'} onChange={() => setScope('job')} style={{ marginTop: 3 }} />
              <span>
                <strong style={{ fontSize: 14 }}>{t('clients:reassign.moveJob')}</strong>
                <span style={{ display: 'block', fontSize: 12, color: 'var(--color-text-muted)' }}>{t('clients:reassign.moveJobHint', { job: project?.name || '' })}</span>
              </span>
            </label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}>
              <input type="radio" checked={scope === 'record'} onChange={() => setScope('record')} style={{ marginTop: 3 }} />
              <span>
                <strong style={{ fontSize: 14 }}>{t(kind === 'estimate' ? 'clients:reassign.moveEstimate' : 'clients:reassign.moveInvoice', { number: record?.number || '' })}</strong>
                <span style={{ display: 'block', fontSize: 12, color: 'var(--color-text-muted)' }}>{t('clients:reassign.moveRecordHint')}</span>
              </span>
            </label>
          </div>
        )}
        {kind === 'job' && (
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '0 0 8px' }}>{t('clients:reassign.moveJobHint', { job: project?.name || '' })}</p>
        )}

        <span style={label}>{t('clients:reassign.targetClient')}</span>
        <ClientPicker clients={clients} value={targetClientId} onChange={setTargetClientId} />
        {scope === 'job' && sameClient && (
          <p style={{ fontSize: 12, color: 'var(--color-warning, #b45309)', margin: '6px 0 0' }}>{t('clients:reassign.sameClient')}</p>
        )}

        {scope === 'record' && targetClientId && (
          <>
            <span style={label}>{t('clients:reassign.targetJob')}</span>
            {!createJob && (
              <select style={input} value={targetProjectId} onChange={e => setTargetProjectId(e.target.value)}>
                <option value="">{t('clients:reassign.pickJob')}</option>
                {targetJobs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, marginTop: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={createJob} onChange={e => setCreateJob(e.target.checked)} />
              {t('clients:reassign.createJob')}
            </label>
            {createJob && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                <input style={input} value={newJobName} onChange={e => setNewJobName(e.target.value)} placeholder={t('clients:reassign.jobNamePlaceholder')} />
                <input style={input} value={newJobAddress} onChange={e => setNewJobAddress(e.target.value)} placeholder={t('clients:reassign.jobAddressPlaceholder')} />
              </div>
            )}
          </>
        )}

        {error && (
          <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--color-danger-bg, #fee2e2)', border: '1px solid var(--color-danger-border, #fecaca)', borderRadius: 'var(--radius-md, 8px)', color: 'var(--color-danger, #dc2626)', fontSize: 13 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button type="button" onClick={onClose} style={{ padding: '8px 18px', background: 'none', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md, 8px)', color: 'var(--color-text-muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            {t('common:action.cancel')}
          </button>
          <button type="button" onClick={handleConfirm} disabled={!canConfirm} style={{ padding: '8px 18px', background: 'var(--color-primary)', border: 'none', borderRadius: 'var(--radius-md, 8px)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: canConfirm ? 'pointer' : 'not-allowed', opacity: canConfirm ? 1 : 0.5 }}>
            {busy ? t('clients:reassign.moving') : t('clients:reassign.confirm')}
          </button>
        </div>
      </div>
    </Modal>
  )
}
