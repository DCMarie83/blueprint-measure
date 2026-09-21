import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import styles from '../import/ImportWizardModal.module.css'

// The record picker shared by the document importer's Attach mode and the
// Documents section's "Move to another record": record type, a search box,
// and the matching records of the company.

export const RECORD_TYPES = ['project', 'client', 'invoice', 'estimate']

// Record options for the picker, fetched once per company while `enabled`.
// { project: [{ id, label }], client, invoice, estimate } or null while loading.
export function useRecordOptions(companyId, enabled = true) {
  const [records, setRecords] = useState(null)

  useEffect(() => {
    if (!enabled || records || !companyId) return
    let cancelled = false
    ;(async () => {
      const [{ data: projects }, { data: clients }, { data: invoices }, { data: estimates }] = await Promise.all([
        supabase.from('projects').select('id, name').eq('company_id', companyId).is('deleted_at', null).order('name'),
        supabase.from('clients').select('id, display_name').eq('company_id', companyId).order('display_name'),
        supabase.from('invoices').select('id, invoice_number').eq('company_id', companyId).order('created_at', { ascending: false }),
        supabase.from('estimates').select('id, estimate_number, title').eq('company_id', companyId).order('created_at', { ascending: false }),
      ])
      if (cancelled) return
      setRecords({
        project: (projects ?? []).map(p => ({ id: p.id, label: p.name })),
        client: (clients ?? []).map(c => ({ id: c.id, label: c.display_name })),
        invoice: (invoices ?? []).map(i => ({ id: i.id, label: i.invoice_number })),
        estimate: (estimates ?? []).map(e => ({ id: e.id, label: e.title || e.estimate_number })),
      })
    })()
    return () => { cancelled = true }
  }, [enabled, records, companyId])

  return records
}

// Controlled: value = { recordType, recordId, search }; onChange receives a
// patch. Changing the type clears the record and the search. `excludeId`
// hides one record (the one a document is already on).
export default function RecordPicker({ records, value, onChange, excludeId = null }) {
  const { t } = useTranslation()
  const options = (records?.[value.recordType] ?? []).filter(o => o.id !== excludeId)
  const query = value.search.trim().toLowerCase()
  const filtered = query ? options.filter(o => (o.label ?? '').toLowerCase().includes(query)) : options

  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
      <select
        className={styles.mappingSelect}
        style={{ minWidth: 90, flex: 'none' }}
        value={value.recordType}
        onChange={e => onChange({ recordType: e.target.value, recordId: '', search: '' })}
      >
        {RECORD_TYPES.map(rt => <option key={rt} value={rt}>{t(`import:docs.recordType.${rt}`)}</option>)}
      </select>
      <input
        className={styles.mappingSelect}
        style={{ minWidth: 90, flex: 'none' }}
        placeholder={t('import:docs.searchPlaceholder')}
        value={value.search}
        onChange={e => onChange({ search: e.target.value })}
      />
      <select
        className={styles.mappingSelect}
        style={{ minWidth: 140 }}
        value={value.recordId}
        onChange={e => onChange({ recordId: e.target.value })}
      >
        <option value="">{t('import:docs.pickRecord')}</option>
        {filtered.slice(0, 200).map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </div>
  )
}
