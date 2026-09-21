import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import Modal, { ModalFooter } from '../ui/Modal'
import { useAuth } from '../../context/AuthContext'
import { useEffectiveCompany } from '../../hooks/useEffectiveCompany'
import { supabase } from '../../lib/supabase'
import { moveRecordToClient, REASSIGN_ERROR } from '../../data/reassignClient'

// "Change job" (contractor_admin only — pages gate the button): move one
// invoice or estimate to another job of the SAME client, existing or created
// here. Same helper as Change client with the current client as the target;
// the ledger keys by invoice id and never moves.
export default function ChangeJobDialog({ kind, record, project, onClose, onMoved }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { companyId } = useEffectiveCompany()

  const [jobs, setJobs] = useState(null) // null = loading
  const [targetProjectId, setTargetProjectId] = useState('')
  const [createJob, setCreateJob] = useState(false)
  const [newJobName, setNewJobName] = useState('')
  const [newJobAddress, setNewJobAddress] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!companyId || !project?.client_id) return
    let cancelled = false
    supabase.from('projects').select('id, name').eq('company_id', companyId).eq('client_id', project.client_id).is('deleted_at', null).neq('id', project.id).order('name')
      .then(({ data }) => {
        if (cancelled) return
        setJobs(data ?? [])
        setCreateJob((data ?? []).length === 0)
      })
    return () => { cancelled = true }
  }, [companyId, project?.client_id, project?.id])

  const canConfirm = !busy && (createJob ? !!newJobName.trim() : !!targetProjectId)

  async function handleConfirm() {
    setBusy(true)
    setError(null)
    try {
      await moveRecordToClient({
        kind,
        companyId,
        userId: user?.id,
        recordId: record.id,
        targetClientId: project.client_id,
        targetProjectId: createJob ? null : targetProjectId,
        newJob: createJob ? { name: newJobName, address: newJobAddress } : null,
      })
      onMoved?.()
      onClose()
    } catch (err) {
      if (err.code === REASSIGN_ERROR.WRONG_COMPANY) setError(t('clients:reassign.errorWrongCompany'))
      else if (err.code === REASSIGN_ERROR.JOB_REQUIRED) setError(t('clients:reassign.errorJobRequired'))
      else setError(err.message)
      setBusy(false)
    }
  }

  const label = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', margin: '12px 0 4px' }
  const input = { width: '100%', padding: '8px 10px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-bg)', color: 'var(--color-text)', fontSize: 14 }

  return (
    <Modal title={t('clients:changeJob.title')} onClose={onClose}>
      <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: 0 }}>
        {t(kind === 'estimate' ? 'clients:changeJob.hintEstimate' : 'clients:changeJob.hintInvoice', { number: record?.number || '', job: project?.name || '' })}
      </p>

      <span style={label}>{t('clients:reassign.targetJob')}</span>
      {jobs === null ? (
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: 0 }}>{t('common:misc.loading')}</p>
      ) : (
        <>
          {!createJob && (
            <select style={input} value={targetProjectId} onChange={e => setTargetProjectId(e.target.value)}>
              <option value="">{t('clients:reassign.pickJob')}</option>
              {jobs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          {jobs.length === 0 && (
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '6px 0 0' }}>{t('clients:changeJob.noOtherJobs')}</p>
          )}
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, marginTop: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={createJob} disabled={jobs.length === 0} onChange={e => setCreateJob(e.target.checked)} />
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
        <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--color-danger-bg, #fee2e2)', border: '1px solid var(--color-danger-border, #fecaca)', borderRadius: 'var(--radius-md)', color: 'var(--color-danger, #dc2626)', fontSize: 13 }}>
          {error}
        </div>
      )}

      <ModalFooter>
        <button type="button" onClick={onClose} style={{ padding: '8px 18px', background: 'none', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          {t('common:action.cancel')}
        </button>
        <button type="button" onClick={handleConfirm} disabled={!canConfirm} style={{ padding: '8px 18px', background: 'var(--color-primary)', border: 'none', borderRadius: 'var(--radius-md)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: canConfirm ? 'pointer' : 'not-allowed', opacity: canConfirm ? 1 : 0.5 }}>
          {busy ? t('clients:reassign.moving') : t('clients:changeJob.confirm')}
        </button>
      </ModalFooter>
    </Modal>
  )
}
