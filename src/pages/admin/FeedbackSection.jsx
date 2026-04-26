import { useState, useEffect, Fragment } from 'react'
import { MessageCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useAdminData } from '../../context/AdminDataContext'
import { logError } from '../../lib/logError'
import styles from './sections.module.css'

const STATUS_COLORS = {
  new:         { bg: 'rgba(30,58,138,0.2)',  color: '#93c5fd' },
  reviewed:    { bg: 'rgba(88,28,135,0.2)',  color: '#c4b5fd' },
  in_progress: { bg: 'rgba(146,64,14,0.2)', color: '#fcd34d' },
  resolved:    { bg: 'rgba(20,83,45,0.2)',   color: '#86efac' },
  wontfix:     { bg: 'rgba(153,27,27,0.2)',  color: '#fca5a5' },
}

const TYPE_COLORS = {
  bug:      { bg: 'rgba(153,27,27,0.2)',  color: '#fca5a5' },
  feature:  { bg: 'rgba(30,58,138,0.2)',  color: '#93c5fd' },
  question: { bg: 'rgba(133,77,14,0.2)',  color: '#fde047' },
  other:    { bg: 'rgba(55,65,81,0.2)',   color: '#d1d5db' },
}

function StatusPill({ value }) {
  const c = STATUS_COLORS[value] ?? STATUS_COLORS.new
  return <span style={{ background: c.bg, color: c.color, borderRadius: 9999, padding: '2px 8px', fontSize: 11, fontWeight: 500 }}>{value ?? 'new'}</span>
}

function TypePill({ value }) {
  const c = TYPE_COLORS[value] ?? TYPE_COLORS.other
  return <span style={{ background: c.bg, color: c.color, borderRadius: 9999, padding: '2px 8px', fontSize: 11, fontWeight: 500 }}>{value ?? 'other'}</span>
}

export default function FeedbackSection() {
  const { user } = useAuth()
  const { companies, users } = useAdminData()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [expandedId, setExpandedId] = useState(null)
  const [editNotes, setEditNotes] = useState('')
  const [editStatus, setEditStatus] = useState('')

  // Responses
  const [responsesByFeedback, setResponsesByFeedback] = useState({}) // { [feedbackId]: response[] }
  const [responsesLoading, setResponsesLoading] = useState({})
  const [replyBody, setReplyBody] = useState('')
  const [replyInternal, setReplyInternal] = useState(false)
  const [replySending, setReplySending] = useState(false)

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from('beta_feedback')
        .select('id, tenant_id, user_id, session_id, type, description, screenshot_url, page_url, user_agent, status, admin_notes, responded_at, response_count, created_at')
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
    } catch (err) { alert('Failed: ' + err.message) }
  }

  async function fetchResponses(feedbackId) {
    if (responsesByFeedback[feedbackId]) return
    setResponsesLoading(prev => ({ ...prev, [feedbackId]: true }))
    try {
      const { data, error } = await supabase
        .from('feedback_responses')
        .select('id, responder_user_id, body, is_internal, created_at')
        .eq('feedback_id', feedbackId)
        .order('created_at', { ascending: true })
      if (error) throw new Error(error.message)
      setResponsesByFeedback(prev => ({ ...prev, [feedbackId]: data ?? [] }))
    } catch (err) {
      logError(err, { source: 'feedback-responses-fetch', severity: 'error' })
    } finally {
      setResponsesLoading(prev => ({ ...prev, [feedbackId]: false }))
    }
  }

  function handleExpand(fb) {
    if (expandedId === fb.id) {
      setExpandedId(null)
      return
    }
    setExpandedId(fb.id)
    setEditStatus(fb.status ?? 'new')
    setEditNotes(fb.admin_notes ?? '')
    setReplyBody('')
    setReplyInternal(false)
    fetchResponses(fb.id)
  }

  async function handleSendReply(feedbackId) {
    if (!replyBody.trim()) return
    setReplySending(true)
    try {
      const { error } = await supabase.from('feedback_responses').insert({
        feedback_id: feedbackId,
        responder_user_id: user.id,
        body: replyBody.trim(),
        is_internal: replyInternal,
      })
      if (error) throw new Error(error.message)

      // Send email notification for non-internal responses
      // TODO: Requires RESEND_API_KEY configured in Supabase Edge Function secrets
      if (!replyInternal) {
        try {
          const { error: emailErr } = await supabase.functions.invoke('send-feedback-response-email', {
            body: { feedback_id: feedbackId },
          })
          if (emailErr) logError(emailErr, { source: 'feedback-response-email', severity: 'warning' })
        } catch (err) {
          logError(err, { source: 'feedback-response-email', severity: 'warning' })
        }
      }

      // Refresh responses for this feedback
      setReplyBody('')
      setReplyInternal(false)
      setResponsesByFeedback(prev => ({ ...prev, [feedbackId]: undefined }))
      fetchResponses(feedbackId)

      // Update response_count in local state
      setItems(prev => prev.map(f =>
        f.id === feedbackId
          ? { ...f, response_count: (f.response_count ?? 0) + (replyInternal ? 0 : 1), responded_at: replyInternal ? f.responded_at : new Date().toISOString() }
          : f
      ))
    } catch (err) {
      logError(err, { source: 'feedback-reply-send', severity: 'error' })
      alert('Failed to send response: ' + err.message)
    } finally {
      setReplySending(false)
    }
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
                <th className={styles.th}>Replies</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(fb => {
                const fbUser = users.find(u => u.id === fb.user_id)?.email ?? '—'
                const fbCompany = fb.tenant_id ? companies.find(c => c.id === fb.tenant_id)?.name ?? '—' : '—'
                const isExp = expandedId === fb.id
                const responses = responsesByFeedback[fb.id] ?? []
                const respLoading = !!responsesLoading[fb.id]
                return (
                  <Fragment key={fb.id}>
                    <tr className={styles.tr} onClick={() => handleExpand(fb)} style={{ cursor: 'pointer' }}>
                      <td className={styles.td}>{new Date(fb.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                      <td className={styles.td}><TypePill value={fb.type} /></td>
                      <td className={styles.td}>{fbUser}</td>
                      <td className={styles.td}>{fbCompany}</td>
                      <td className={styles.td} title={fb.description}>{fb.description?.length > 60 ? fb.description.slice(0, 60) + '...' : fb.description}</td>
                      <td className={styles.td}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <StatusPill value={fb.status ?? 'new'} />
                          {(fb.response_count ?? 0) > 0 && <MessageCircle size={14} style={{ color: '#93c5fd' }} />}
                        </div>
                      </td>
                      <td className={styles.td}>
                        {(fb.response_count ?? 0) > 0 ? (
                          <span className={styles.pill}>{fb.response_count}</span>
                        ) : '—'}
                      </td>
                    </tr>
                    {isExp && (
                      <tr className={styles.expandedRow}>
                        <td colSpan={7} className={styles.expandedCell}>
                          <div className={styles.expandedPanel}>
                            {/* Feedback details */}
                            <div><strong>Full description:</strong> {fb.description}</div>
                            <div><strong>Page URL:</strong> {fb.page_url}</div>
                            {fb.screenshot_url && <div><strong>Screenshot:</strong> <a href={fb.screenshot_url} target="_blank" rel="noopener noreferrer">View</a></div>}
                            <div><strong>User Agent:</strong> <span style={{ fontSize: 11 }}>{fb.user_agent}</span></div>

                            {/* Conversation thread */}
                            <div style={{ marginTop: 16, borderTop: '1px solid var(--color-border)', paddingTop: 14 }}>
                              <strong style={{ fontSize: 13 }}>Conversation</strong>
                              {respLoading ? (
                                <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 8 }}>Loading responses…</p>
                              ) : responses.length === 0 ? (
                                <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 8 }}>No responses yet.</p>
                              ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                                  {responses.map(r => {
                                    const responder = users.find(u => u.id === r.responder_user_id)?.email ?? 'Admin'
                                    return (
                                      <div key={r.id} style={{
                                        padding: '10px 12px',
                                        borderRadius: 6,
                                        fontSize: 13,
                                        background: r.is_internal ? 'rgba(245, 158, 11, 0.08)' : 'rgba(255,255,255,0.03)',
                                        border: '1px solid var(--color-border)',
                                      }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                          <span style={{ fontWeight: 600, fontSize: 12 }}>
                                            {responder}
                                            {r.is_internal && <span style={{ color: '#f59e0b', marginLeft: 6, fontWeight: 500 }}>(internal)</span>}
                                          </span>
                                          <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                                            {new Date(r.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                          </span>
                                        </div>
                                        <div style={{ whiteSpace: 'pre-wrap' }}>{r.body}</div>
                                      </div>
                                    )
                                  })}
                                </div>
                              )}

                              {/* Reply form */}
                              <div style={{ marginTop: 12 }} onClick={e => e.stopPropagation()}>
                                <textarea
                                  className={styles.formInput}
                                  value={replyBody}
                                  onChange={e => setReplyBody(e.target.value)}
                                  placeholder="Reply to this feedback..."
                                  rows={3}
                                  style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit' }}
                                />
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
                                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--color-text-muted)', cursor: 'pointer' }}>
                                    <input type="checkbox" checked={replyInternal} onChange={e => setReplyInternal(e.target.checked)} />
                                    Internal note (not visible to user)
                                  </label>
                                  <button
                                    className={styles.submitBtn}
                                    onClick={() => handleSendReply(fb.id)}
                                    disabled={replySending || !replyBody.trim()}
                                    style={{ marginLeft: 'auto' }}
                                  >
                                    {replySending ? 'Sending…' : 'Send Response'}
                                  </button>
                                </div>
                              </div>
                            </div>

                            {/* Status + Admin Notes */}
                            <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', borderTop: '1px solid var(--color-border)', paddingTop: 14 }} onClick={e => e.stopPropagation()}>
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
