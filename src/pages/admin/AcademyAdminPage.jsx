import { useState, useEffect } from 'react'
import {
  getAllModules, getAllVideos, createModule, updateModule, deleteModule,
  createVideo, updateVideo, deleteVideo, getQuestionsForInbox, answerQuestion,
  extractYouTubeId,
} from '../../data/academyVideos'
import { supabase } from '../../lib/supabase'
import styles from './sections.module.css'

const EMPTY_MODULE = { title: '', description: '', sort_order: 0, is_active: true }
const EMPTY_VIDEO = { module_id: '', title: '', description: '', youtube_id: '', duration: '', audience: 'all', trade_vertical: 'all', sort_order: 0, is_active: true }

export default function AcademyAdminPage() {
  const [tab, setTab] = useState('content')
  const [modules, setModules] = useState([])
  const [videos, setVideos] = useState([])
  const [questions, setQuestions] = useState([])
  const [loading, setLoading] = useState(true)

  // Module modal
  const [moduleModal, setModuleModal] = useState(null) // null = closed, {} = new/edit
  const [moduleSaving, setModuleSaving] = useState(false)

  // Video modal
  const [videoModal, setVideoModal] = useState(null)
  const [videoSaving, setVideoSaving] = useState(false)

  // Q&A state
  const [answerDrafts, setAnswerDrafts] = useState({})
  const [publishToggles, setPublishToggles] = useState({})
  const [answerSaving, setAnswerSaving] = useState(null)

  async function loadContent() {
    setLoading(true)
    try {
      const [mods, vids] = await Promise.all([getAllModules(), getAllVideos()])
      setModules(mods)
      setVideos(vids)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function loadInbox() {
    try {
      const qs = await getQuestionsForInbox()
      setQuestions(qs)
      const drafts = {}
      const pubs = {}
      for (const q of qs) {
        drafts[q.id] = q.answer || ''
        pubs[q.id] = q.is_published
      }
      setAnswerDrafts(drafts)
      setPublishToggles(pubs)
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => { loadContent() }, [])
  useEffect(() => { if (tab === 'inbox') loadInbox() }, [tab])

  // ── Module CRUD ────────────────────────────────────────────────────────

  async function handleModuleSave(e) {
    e.preventDefault()
    setModuleSaving(true)
    try {
      if (moduleModal.id) {
        await updateModule(moduleModal.id, {
          title: moduleModal.title,
          description: moduleModal.description || null,
          sort_order: parseInt(moduleModal.sort_order) || 0,
          is_active: moduleModal.is_active,
        })
      } else {
        await createModule({
          title: moduleModal.title,
          description: moduleModal.description || null,
          sort_order: parseInt(moduleModal.sort_order) || 0,
          is_active: moduleModal.is_active,
        })
      }
      setModuleModal(null)
      await loadContent()
    } catch (err) {
      alert('Error: ' + err.message)
    } finally {
      setModuleSaving(false)
    }
  }

  async function handleModuleDelete(id) {
    if (!window.confirm('Delete this module? Videos will be unlinked.')) return
    try {
      await deleteModule(id)
      await loadContent()
    } catch (err) {
      alert('Error: ' + err.message)
    }
  }

  // ── Video CRUD ─────────────────────────────────────────────────────────

  async function handleVideoSave(e) {
    e.preventDefault()
    setVideoSaving(true)
    try {
      const payload = {
        module_id: videoModal.module_id || null,
        title: videoModal.title,
        description: videoModal.description || null,
        youtube_id: extractYouTubeId(videoModal.youtube_id),
        duration: videoModal.duration || null,
        audience: videoModal.audience,
        trade_vertical: videoModal.trade_vertical,
        sort_order: parseInt(videoModal.sort_order) || 0,
        is_active: videoModal.is_active,
      }
      if (videoModal.id) {
        await updateVideo(videoModal.id, payload)
      } else {
        await createVideo(payload)
      }
      setVideoModal(null)
      await loadContent()
    } catch (err) {
      alert('Error: ' + err.message)
    } finally {
      setVideoSaving(false)
    }
  }

  async function handleVideoDelete(id) {
    if (!window.confirm('Delete this video?')) return
    try {
      await deleteVideo(id)
      await loadContent()
    } catch (err) {
      alert('Error: ' + err.message)
    }
  }

  // ── Answer Q&A ─────────────────────────────────────────────────────────

  async function handleAnswerSave(q) {
    setAnswerSaving(q.id)
    try {
      await answerQuestion({
        id: q.id,
        answer: answerDrafts[q.id],
        isPublished: publishToggles[q.id] || false,
      })
      // Send email if notify_method='email'
      if (q.notify_method === 'email' && answerDrafts[q.id]) {
        try {
          await supabase.functions.invoke('send-academy-answer-email', {
            body: { question_id: q.id },
          })
        } catch (emailErr) {
          console.error('Answer email failed:', emailErr)
        }
      }
      await loadInbox()
    } catch (err) {
      alert('Error: ' + err.message)
    } finally {
      setAnswerSaving(null)
    }
  }

  if (loading) return <div className={styles.empty}>Loading…</div>

  return (
    <div>
      <h1 className={styles.pageTitle}>Academy</h1>

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button className={tab === 'content' ? styles.addBtn : styles.secondaryBtn} onClick={() => setTab('content')}>Content</button>
        <button className={tab === 'inbox' ? styles.addBtn : styles.secondaryBtn} onClick={() => setTab('inbox')}>
          Q&A Inbox {questions.filter(q => !q.answer).length > 0 && `(${questions.filter(q => !q.answer).length})`}
        </button>
      </div>

      {/* ── Content tab ───────────────────────────────────────────── */}
      {tab === 'content' && (
        <>
          {/* Modules */}
          <div className={styles.sectionCard}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h2 className={styles.sectionCardTitle} style={{ margin: 0 }}>Modules</h2>
              <button className={styles.addBtn} onClick={() => setModuleModal({ ...EMPTY_MODULE })}>+ Add Module</button>
            </div>
            {modules.length === 0 ? (
              <div className={styles.empty}>No modules yet.</div>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th className={styles.th}>Order</th>
                      <th className={styles.th}>Title</th>
                      <th className={styles.th}>Status</th>
                      <th className={styles.th}>Videos</th>
                      <th className={styles.th}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {modules.map(mod => (
                      <tr key={mod.id} className={styles.tr}>
                        <td className={styles.td}>{mod.sort_order}</td>
                        <td className={styles.td} style={{ fontWeight: 600 }}>{mod.title}</td>
                        <td className={styles.td}>
                          <span className={`${styles.badge} ${mod.is_active ? styles.badgeActive : styles.badgeInactive}`}>
                            {mod.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className={styles.td}>{videos.filter(v => v.module_id === mod.id).length}</td>
                        <td className={styles.td}>
                          <button className={styles.iconBtn} onClick={() => setModuleModal({ ...mod })}>Edit</button>
                          <button className={styles.deleteBtn} style={{ marginLeft: 6 }} onClick={() => handleModuleDelete(mod.id)}>Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Videos */}
          <div className={styles.sectionCard}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h2 className={styles.sectionCardTitle} style={{ margin: 0 }}>Videos</h2>
              <button className={styles.addBtn} onClick={() => setVideoModal({ ...EMPTY_VIDEO })}>+ Add Video</button>
            </div>
            {videos.length === 0 ? (
              <div className={styles.empty}>No videos yet.</div>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th className={styles.th}></th>
                      <th className={styles.th}>Title</th>
                      <th className={styles.th}>Module</th>
                      <th className={styles.th}>Audience</th>
                      <th className={styles.th}>Trade</th>
                      <th className={styles.th}>Status</th>
                      <th className={styles.th}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {videos.map(vid => {
                      const mod = modules.find(m => m.id === vid.module_id)
                      return (
                        <tr key={vid.id} className={styles.tr}>
                          <td className={styles.td} style={{ width: 80 }}>
                            {vid.youtube_id && (
                              <img
                                src={`https://img.youtube.com/vi/${vid.youtube_id}/default.jpg`}
                                alt=""
                                style={{ width: 64, borderRadius: 4, display: 'block' }}
                              />
                            )}
                          </td>
                          <td className={styles.td} style={{ fontWeight: 600 }}>
                            {vid.title}
                            {vid.duration && <span style={{ marginLeft: 8, fontWeight: 400, color: 'var(--color-text-muted)', fontSize: 12 }}>{vid.duration}</span>}
                          </td>
                          <td className={styles.td}>{mod?.title ?? '—'}</td>
                          <td className={styles.td}>{vid.audience}</td>
                          <td className={styles.td}>{vid.trade_vertical}</td>
                          <td className={styles.td}>
                            <span className={`${styles.badge} ${vid.is_active ? styles.badgeActive : styles.badgeInactive}`}>
                              {vid.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className={styles.td}>
                            <button className={styles.iconBtn} onClick={() => setVideoModal({ ...vid })}>Edit</button>
                            <button className={styles.deleteBtn} style={{ marginLeft: 6 }} onClick={() => handleVideoDelete(vid.id)}>Delete</button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Q&A Inbox tab ─────────────────────────────────────────── */}
      {tab === 'inbox' && (
        <div className={styles.sectionCard}>
          <h2 className={styles.sectionCardTitle}>Q&A Inbox</h2>
          {questions.length === 0 ? (
            <div className={styles.empty}>No questions yet.</div>
          ) : (
            questions.map(q => (
              <div key={q.id} style={{
                padding: 16, borderBottom: '1px solid var(--color-border)',
                background: !q.answer ? 'rgba(245,158,11,0.03)' : 'transparent',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                      {q.companies?.name ?? 'Unknown'} &middot; {new Date(q.created_at).toLocaleDateString()}
                      {q.academy_videos?.title && <> &middot; Re: {q.academy_videos.title}</>}
                      {!q.answer && <span className={styles.pendingBadge}>Unanswered</span>}
                    </span>
                    <p style={{ fontSize: 14, fontWeight: 500, margin: '6px 0 0', color: 'var(--color-text)' }}>{q.question}</p>
                    <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Notify: {q.notify_method}</span>
                  </div>
                </div>
                <div style={{ marginTop: 10 }}>
                  <textarea
                    className={styles.formInput}
                    style={{ width: '100%', minHeight: 60, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'var(--font-body)' }}
                    value={answerDrafts[q.id] ?? ''}
                    onChange={e => setAnswerDrafts(prev => ({ ...prev, [q.id]: e.target.value }))}
                    placeholder="Type your answer…"
                  />
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 8 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', color: 'var(--color-text-muted)' }}>
                      <input
                        type="checkbox"
                        checked={publishToggles[q.id] ?? false}
                        onChange={e => setPublishToggles(prev => ({ ...prev, [q.id]: e.target.checked }))}
                      />
                      Publish to public Q&A
                    </label>
                    <button
                      className={styles.submitBtn}
                      disabled={!answerDrafts[q.id]?.trim() || answerSaving === q.id}
                      onClick={() => handleAnswerSave(q)}
                    >
                      {answerSaving === q.id ? 'Saving…' : 'Save Answer'}
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Module modal ──────────────────────────────────────────── */}
      {moduleModal && (
        <ModalBackdrop onClose={() => setModuleModal(null)}>
          <h3 style={{ margin: '0 0 16px' }}>{moduleModal.id ? 'Edit Module' : 'New Module'}</h3>
          <form onSubmit={handleModuleSave}>
            <div className={styles.formGrid}>
              <div className={styles.formField}>
                <label className={styles.formLabel}>Title</label>
                <input className={styles.formInput} required value={moduleModal.title} onChange={e => setModuleModal(m => ({ ...m, title: e.target.value }))} />
              </div>
              <div className={styles.formField}>
                <label className={styles.formLabel}>Sort Order</label>
                <input className={styles.formInput} type="number" value={moduleModal.sort_order} onChange={e => setModuleModal(m => ({ ...m, sort_order: e.target.value }))} />
              </div>
            </div>
            <div className={styles.formField} style={{ marginBottom: 12 }}>
              <label className={styles.formLabel}>Description</label>
              <textarea className={styles.formInput} style={{ minHeight: 60, resize: 'vertical' }} value={moduleModal.description ?? ''} onChange={e => setModuleModal(m => ({ ...m, description: e.target.value }))} />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={moduleModal.is_active} onChange={e => setModuleModal(m => ({ ...m, is_active: e.target.checked }))} />
              Active
            </label>
            <div className={styles.formActions}>
              <button type="submit" className={styles.submitBtn} disabled={moduleSaving}>{moduleSaving ? 'Saving…' : 'Save'}</button>
              <button type="button" className={styles.secondaryBtn} onClick={() => setModuleModal(null)}>Cancel</button>
            </div>
          </form>
        </ModalBackdrop>
      )}

      {/* ── Video modal ───────────────────────────────────────────── */}
      {videoModal && (
        <ModalBackdrop onClose={() => setVideoModal(null)}>
          <h3 style={{ margin: '0 0 16px' }}>{videoModal.id ? 'Edit Video' : 'New Video'}</h3>
          <form onSubmit={handleVideoSave}>
            <div className={styles.formGrid}>
              <div className={styles.formField}>
                <label className={styles.formLabel}>Title</label>
                <input className={styles.formInput} required value={videoModal.title} onChange={e => setVideoModal(v => ({ ...v, title: e.target.value }))} />
              </div>
              <div className={styles.formField}>
                <label className={styles.formLabel}>Module</label>
                <select className={styles.formSelect} value={videoModal.module_id ?? ''} onChange={e => setVideoModal(v => ({ ...v, module_id: e.target.value || null }))}>
                  <option value="">No module</option>
                  {modules.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
                </select>
              </div>
            </div>
            <div className={styles.formGrid}>
              <div className={styles.formField}>
                <label className={styles.formLabel}>YouTube link or video ID</label>
                <input className={styles.formInput} required placeholder="Paste the share link or the video ID" value={videoModal.youtube_id} onChange={e => setVideoModal(v => ({ ...v, youtube_id: e.target.value }))} />
                {extractYouTubeId(videoModal.youtube_id) && (
                  <img
                    src={`https://img.youtube.com/vi/${extractYouTubeId(videoModal.youtube_id)}/hqdefault.jpg`}
                    alt="preview"
                    style={{ marginTop: 8, width: 160, borderRadius: 6 }}
                    onError={(e) => { e.currentTarget.style.display = 'none' }}
                  />
                )}
              </div>
              <div className={styles.formField}>
                <label className={styles.formLabel}>Duration</label>
                <input className={styles.formInput} placeholder="e.g. 5:32" value={videoModal.duration ?? ''} onChange={e => setVideoModal(v => ({ ...v, duration: e.target.value }))} />
              </div>
            </div>
            <div className={styles.formField} style={{ marginBottom: 12 }}>
              <label className={styles.formLabel}>Description</label>
              <textarea className={styles.formInput} style={{ minHeight: 60, resize: 'vertical' }} value={videoModal.description ?? ''} onChange={e => setVideoModal(v => ({ ...v, description: e.target.value }))} />
            </div>
            <div className={styles.formGrid}>
              <div className={styles.formField}>
                <label className={styles.formLabel}>Audience</label>
                <select className={styles.formSelect} value={videoModal.audience} onChange={e => setVideoModal(v => ({ ...v, audience: e.target.value }))}>
                  <option value="all">All users</option>
                  <option value="admin">Admins only</option>
                </select>
              </div>
              <div className={styles.formField}>
                <label className={styles.formLabel}>Trade Vertical</label>
                <input className={styles.formInput} value={videoModal.trade_vertical} onChange={e => setVideoModal(v => ({ ...v, trade_vertical: e.target.value }))} placeholder="all" />
              </div>
              <div className={styles.formField}>
                <label className={styles.formLabel}>Sort Order</label>
                <input className={styles.formInput} type="number" value={videoModal.sort_order} onChange={e => setVideoModal(v => ({ ...v, sort_order: e.target.value }))} />
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, margin: '12px 0', cursor: 'pointer' }}>
              <input type="checkbox" checked={videoModal.is_active} onChange={e => setVideoModal(v => ({ ...v, is_active: e.target.checked }))} />
              Active
            </label>
            <div className={styles.formActions}>
              <button type="submit" className={styles.submitBtn} disabled={videoSaving}>{videoSaving ? 'Saving…' : 'Save'}</button>
              <button type="button" className={styles.secondaryBtn} onClick={() => setVideoModal(null)}>Cancel</button>
            </div>
          </form>
        </ModalBackdrop>
      )}
    </div>
  )
}

function ModalBackdrop({ children, onClose }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 24,
    }} onClick={onClose}>
      <div style={{
        background: 'var(--color-surface)', borderRadius: 12, padding: 24,
        maxWidth: 640, width: '100%', maxHeight: '90vh', overflowY: 'auto',
      }} onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}
