import { useState, useEffect, Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import { MessageCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useAdminData } from '../../context/AdminDataContext'
import { logError } from '../../lib/logError'
import { useDateFormat } from '../../hooks/useDateFormat'
import Chip from '../../components/ui/Chip'
import styles from './sections.module.css'

function statusVariant(value) {
  switch (value) {
    case 'new': return 'info'
    case 'reviewed': return 'purple'
    case 'in_progress': return 'warning'
    case 'resolved': return 'success'
    case 'wontfix': return 'danger'
    default: return 'info'
  }
}

function typeVariant(value) {
  switch (value) {
    case 'bug': return 'danger'
    case 'feature': return 'info'
    case 'question': return 'warning'
    case 'other': return 'neutral'
    default: return 'neutral'
  }
}

export default function FeedbackSection() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { companies, users } = useAdminData()
  const { formatDateTime } = useDateFormat()
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
        .select('id, company_id, user_id, session_id, type, description, screenshot_url, page_url, user_agent, status, admin_notes, responded_at, response_count, created_at')
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
    } catch (err) { alert(t('admin:errors.failed', { message: err.message })) }
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
      alert(t('admin:feedback.sendResponseFailed', { message: err.message }))
    } finally {
      setReplySending(false)
    }
  }

  const filtered = items
    .filter(f => statusFilter === 'all' || f.status === statusFilter)
    .filter(f => typeFilter === 'all' || f.type === typeFilter)

  if (loading) return <div className={styles.empty}>{t('admin:feedback.loading')}</div>

  return (
    <div>
      <h1 className={styles.pageTitle}>{t('admin:feedback.title')} <span className={styles.pill}>{items.length}</span></h1>

      <div className={styles.toolbar}>
        <select className={styles.filterSelect} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="all">{t('admin:feedback.allStatuses')}</option>
          <option value="new">{t('admin:feedback.statusNew')}</option>
          <option value="reviewed">{t('admin:feedback.statusReviewed')}</option>
          <option value="in_progress">{t('admin:feedback.statusInProgress')}</option>
          <option value="resolved">{t('admin:feedback.statusResolved')}</option>
          <option value="wontfix">{t('admin:feedback.statusWontfix')}</option>
        </select>
        <select className={styles.filterSelect} value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="all">{t('admin:feedback.allTypes')}</option>
          <option value="bug">{t('admin:feedback.typeBug')}</option>
          <option value="feature">{t('admin:feedback.typeFeature')}</option>
          <option value="question">{t('admin:feedback.typeQuestion')}</option>
          <option value="other">{t('admin:feedback.typeOther')}</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <p className={styles.empty}>{t('admin:feedback.empty')}</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>{t('admin:feedback.colCreated')}</th>
                <th className={styles.th}>{t('admin:feedback.colType')}</th>
                <th className={styles.th}>{t('admin:feedback.colUser')}</th>
                <th className={styles.th}>{t('admin:feedback.colCompany')}</th>
                <th className={styles.th}>{t('admin:feedback.colDescription')}</th>
                <th className={styles.th}>{t('admin:feedback.colStatus')}</th>
                <th className={styles.th}>{t('admin:feedback.colReplies')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(fb => {
                const fbUser = users.find(u => u.id === fb.user_id)?.email ?? '—'
                const fbCompany = fb.company_id ? companies.find(c => c.id === fb.company_id)?.name ?? '—' : '—'
                const isExp = expandedId === fb.id
                const responses = responsesByFeedback[fb.id] ?? []
                const respLoading = !!responsesLoading[fb.id]
                return (
                  <Fragment key={fb.id}>
                    <tr className={styles.tr} onClick={() => handleExpand(fb)} style={{ cursor: 'pointer' }}>
                      <td className={styles.td}>{formatDateTime(fb.created_at)}</td>
                      <td className={styles.td}><Chip variant={typeVariant(fb.type)}>{fb.type ?? 'other'}</Chip></td>
                      <td className={styles.td}>{fbUser}</td>
                      <td className={styles.td}>{fbCompany}</td>
                      <td className={styles.td} title={fb.description}>{fb.description?.length > 60 ? fb.description.slice(0, 60) + '...' : fb.description}</td>
                      <td className={styles.td}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Chip variant={statusVariant(fb.status ?? 'new')}>{fb.status ?? 'new'}</Chip>
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
                            <div><strong>{t('admin:feedback.fullDescription')}</strong> {fb.description}</div>
                            <div><strong>{t('admin:feedback.pageUrl')}</strong> {fb.page_url}</div>
                            {fb.screenshot_url && <div><strong>{t('admin:feedback.screenshot')}</strong> <a href={fb.screenshot_url} target="_blank" rel="noopener noreferrer">{t('admin:feedback.view')}</a></div>}
                            <div><strong>{t('admin:feedback.userAgent')}</strong> <span style={{ fontSize: 11 }}>{fb.user_agent}</span></div>

                            {/* Conversation thread */}
                            <div style={{ marginTop: 16, borderTop: '1px solid var(--color-border)', paddingTop: 14 }}>
                              <strong style={{ fontSize: 13 }}>{t('admin:feedback.conversation')}</strong>
                              {respLoading ? (
                                <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 8 }}>{t('admin:feedback.loadingResponses')}</p>
                              ) : responses.length === 0 ? (
                                <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 8 }}>{t('admin:feedback.noResponses')}</p>
                              ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                                  {responses.map(r => {
                                    const responder = users.find(u => u.id === r.responder_user_id)?.email ?? t('admin:feedback.adminResponder')
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
                                            {r.is_internal && <span style={{ color: '#f59e0b', marginLeft: 6, fontWeight: 500 }}>{t('admin:feedback.internalTag')}</span>}
                                          </span>
                                          <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                                            {formatDateTime(r.created_at)}
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
                                  placeholder={t('admin:feedback.replyPlaceholder')}
                                  rows={3}
                                  style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit' }}
                                />
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
                                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--color-text-muted)', cursor: 'pointer' }}>
                                    <input type="checkbox" checked={replyInternal} onChange={e => setReplyInternal(e.target.checked)} />
                                    {t('admin:feedback.internalNote')}
                                  </label>
                                  <button
                                    className={styles.submitBtn}
                                    onClick={() => handleSendReply(fb.id)}
                                    disabled={replySending || !replyBody.trim()}
                                    style={{ marginLeft: 'auto' }}
                                  >
                                    {replySending ? t('admin:feedback.sending') : t('admin:feedback.sendResponse')}
                                  </button>
                                </div>
                              </div>
                            </div>

                            {/* Status + Admin Notes */}
                            <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', borderTop: '1px solid var(--color-border)', paddingTop: 14 }} onClick={e => e.stopPropagation()}>
                              <div className={styles.formField} style={{ flex: '0 0 auto' }}>
                                <label className={styles.formLabel}>{t('admin:feedback.statusLabel')}</label>
                                <select className={styles.formSelect} value={editStatus} onChange={e => setEditStatus(e.target.value)}>
                                  <option value="new">{t('admin:feedback.statusNew')}</option>
                                  <option value="reviewed">{t('admin:feedback.statusReviewed')}</option>
                                  <option value="in_progress">{t('admin:feedback.statusInProgress')}</option>
                                  <option value="resolved">{t('admin:feedback.statusResolved')}</option>
                                  <option value="wontfix">{t('admin:feedback.statusWontfix')}</option>
                                </select>
                              </div>
                              <div className={styles.formField} style={{ flex: 1 }}>
                                <label className={styles.formLabel}>{t('admin:feedback.adminNotes')}</label>
                                <input className={styles.formInput} value={editNotes} onChange={e => setEditNotes(e.target.value)} placeholder={t('admin:feedback.adminNotesPlaceholder')} />
                              </div>
                              <button className={styles.submitBtn} onClick={() => handleUpdate(fb.id)}>{t('common:action.save')}</button>
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
