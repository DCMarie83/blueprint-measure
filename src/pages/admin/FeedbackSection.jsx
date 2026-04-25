import { useState, useEffect, Fragment } from 'react'
import { supabase } from '../../lib/supabase'
import { useAdminData } from '../../context/AdminDataContext'
import styles from './sections.module.css'

export default function FeedbackSection() {
  const { companies, users } = useAdminData()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [expandedId, setExpandedId] = useState(null)
  const [editNotes, setEditNotes] = useState('')
  const [editStatus, setEditStatus] = useState('')

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from('beta_feedback')
        .select('id, tenant_id, user_id, session_id, type, description, screenshot_url, page_url, user_agent, status, admin_notes, created_at')
        .order('created_at', { ascending: false })
        .limit(500)
      if (!error) setItems(data ?? [])
      setLoading(false)
    }
    load()
  }, [])

  async function handleUpdate(id) {
    try {
      const { error } = await supabase.from('beta_feedback').update({ status: editStatus, admin_notes: editNotes }).eq('id', id)
      if (error) throw new Error(error.message)
      setItems(prev => prev.map(f => f.id === id ? { ...f, status: editStatus, admin_notes: editNotes } : f))
      setExpandedId(null)
    } catch (err) { alert('Failed: ' + err.message) }
  }

  const filtered = items
    .filter(f => statusFilter === 'all' || f.status === statusFilter)
    .filter(f => typeFilter === 'all' || f.type === typeFilter)

  if (loading) return <div className={styles.empty}>Loading feedback…</div>

  return (
    <div>
      <h1 className={styles.pageTitle}>Beta Feedback <span className={styles.pill}>{items.length}</span></h1>

      <div className={styles.toolbar}>
        <select className={styles.filterSelect} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="all">All statuses</option>
          <option value="new">New</option>
          <option value="reviewed">Reviewed</option>
          <option value="in_progress">In Progress</option>
          <option value="resolved">Resolved</option>
          <option value="wontfix">Won't Fix</option>
        </select>
        <select className={styles.filterSelect} value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="all">All types</option>
          <option value="bug">Bug</option>
          <option value="feature">Feature</option>
          <option value="question">Question</option>
          <option value="other">Other</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <p className={styles.empty}>No feedback found.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Created</th>
                <th className={styles.th}>Type</th>
                <th className={styles.th}>User</th>
                <th className={styles.th}>Company</th>
                <th className={styles.th}>Description</th>
                <th className={styles.th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(fb => {
                const fbUser = users.find(u => u.id === fb.user_id)?.email ?? '—'
                const fbCompany = fb.tenant_id ? companies.find(c => c.id === fb.tenant_id)?.name ?? '—' : '—'
                const isExp = expandedId === fb.id
                return (
                  <Fragment key={fb.id}>
                    <tr className={styles.tr} onClick={() => {
                      if (isExp) { setExpandedId(null) } else { setExpandedId(fb.id); setEditStatus(fb.status ?? 'new'); setEditNotes(fb.admin_notes ?? '') }
                    }} style={{ cursor: 'pointer' }}>
                      <td className={styles.td}>{new Date(fb.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                      <td className={styles.td}>{fb.type}</td>
                      <td className={styles.td}>{fbUser}</td>
                      <td className={styles.td}>{fbCompany}</td>
                      <td className={styles.td} title={fb.description}>{fb.description?.length > 60 ? fb.description.slice(0, 60) + '…' : fb.description}</td>
                      <td className={styles.td}><span className={styles.feedbackStatus}>{fb.status ?? 'new'}</span></td>
                    </tr>
                    {isExp && (
                      <tr className={styles.expandedRow}>
                        <td colSpan={6} className={styles.expandedCell}>
                          <div className={styles.expandedPanel}>
                            <div><strong>Full description:</strong> {fb.description}</div>
                            <div><strong>Page URL:</strong> {fb.page_url}</div>
                            {fb.screenshot_url && <div><strong>Screenshot:</strong> <a href={fb.screenshot_url} target="_blank" rel="noopener noreferrer">View</a></div>}
                            <div><strong>User Agent:</strong> <span style={{ fontSize: 11 }}>{fb.user_agent}</span></div>
                            <div style={{ marginTop: 10, display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
                              <div className={styles.formField} style={{ flex: '0 0 auto' }}>
                                <label className={styles.formLabel}>Status</label>
                                <select className={styles.formSelect} value={editStatus} onChange={e => setEditStatus(e.target.value)}>
                                  <option value="new">New</option>
                                  <option value="reviewed">Reviewed</option>
                                  <option value="in_progress">In Progress</option>
                                  <option value="resolved">Resolved</option>
                                  <option value="wontfix">Won't Fix</option>
                                </select>
                              </div>
                              <div className={styles.formField} style={{ flex: 1 }}>
                                <label className={styles.formLabel}>Admin Notes</label>
                                <input className={styles.formInput} value={editNotes} onChange={e => setEditNotes(e.target.value)} placeholder="Internal notes…" />
                              </div>
                              <button className={styles.submitBtn} onClick={() => handleUpdate(fb.id)}>Save</button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
