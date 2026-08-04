import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  getAllModules, getAllVideos, createModule, updateModule, deleteModule,
  createVideo, updateVideo, deleteVideo, getQuestionsForInbox, answerQuestion,
  extractYouTubeId,
} from '../../data/academyVideos'
import { supabase } from '../../lib/supabase'
import { AudienceCheckboxes, AudienceBadges } from '../../components/admin/AudienceControls'
import { visibilitySummary } from '../../lib/academyVisibility'
import styles from './sections.module.css'

// Reachability indicator, computed by the SAME shared rule the tenant pages use — so
// the badge can never claim a visibility the viewer doesn't actually get.
function VisibleTo({ row }) {
  const { t } = useTranslation()
  const s = visibilitySummary(row)
  return (
    <span style={{ fontSize: 12, fontWeight: 600, color: s.reason ? 'var(--color-danger, #dc2626)' : 'var(--color-text)' }}>
      {s.reason ? t('admin:academy.nobody', { reason: s.reason }) : s.text}
    </span>
  )
}

// New rows default to Contractors, non-admin — a deliberate authoring default.
// audiences is a text[] of families (never 'all'); admin_only is the role lane
// (visible to company admins only when true).
const EMPTY_MODULE = { title: '', description: '', sort_order: 0, is_active: true, audiences: ['fieldos'], admin_only: false, module_group: 'core' }
const EMPTY_VIDEO = { module_id: '', title: '', description: '', youtube_id: '', duration: '', audiences: ['fieldos'], admin_only: false, trade_vertical: 'all', sort_order: 0, is_active: true }

export default function AcademyAdminPage() {
  const { t } = useTranslation()
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
    if (!(moduleModal.audiences?.length)) { alert(t('admin:academy.pickAudience')); return }
    setModuleSaving(true)
    try {
      const payload = {
        title: moduleModal.title,
        description: moduleModal.description || null,
        sort_order: parseInt(moduleModal.sort_order) || 0,
        is_active: moduleModal.is_active,
        audiences: moduleModal.audiences,
        admin_only: !!moduleModal.admin_only,
        module_group: moduleModal.module_group || 'core',
      }
      if (moduleModal.id) await updateModule(moduleModal.id, payload)
      else await createModule(payload)
      setModuleModal(null)
      await loadContent()
    } catch (err) {
      alert(t('admin:academy.error', { message: err.message }))
    } finally {
      setModuleSaving(false)
    }
  }

  async function handleModuleDelete(id) {
    if (!window.confirm(t('admin:academy.deleteModuleConfirm'))) return
    try {
      await deleteModule(id)
      await loadContent()
    } catch (err) {
      alert(t('admin:academy.error', { message: err.message }))
    }
  }

  // ── Video CRUD ─────────────────────────────────────────────────────────

  async function handleVideoSave(e) {
    e.preventDefault()
    if (!(videoModal.audiences?.length)) { alert(t('admin:academy.pickAudience')); return }
    setVideoSaving(true)
    try {
      const payload = {
        module_id: videoModal.module_id || null,
        title: videoModal.title,
        description: videoModal.description || null,
        youtube_id: extractYouTubeId(videoModal.youtube_id),
        duration: videoModal.duration || null,
        audiences: videoModal.audiences,
        admin_only: !!videoModal.admin_only,
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
      alert(t('admin:academy.error', { message: err.message }))
    } finally {
      setVideoSaving(false)
    }
  }

  async function handleVideoDelete(id) {
    if (!window.confirm(t('admin:academy.deleteVideoConfirm'))) return
    try {
      await deleteVideo(id)
      await loadContent()
    } catch (err) {
      alert(t('admin:academy.error', { message: err.message }))
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
      alert(t('admin:academy.error', { message: err.message }))
    } finally {
      setAnswerSaving(null)
    }
  }

  if (loading) return <div className={styles.empty}>{t('common:misc.loading')}</div>

  return (
    <div>
      <h1 className={styles.pageTitle}>{t('admin:academy.title')}</h1>

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button className={tab === 'content' ? styles.addBtn : styles.secondaryBtn} onClick={() => setTab('content')}>{t('admin:academy.tabContent')}</button>
        <button className={tab === 'inbox' ? styles.addBtn : styles.secondaryBtn} onClick={() => setTab('inbox')}>
          {t('admin:academy.qaInbox')} {questions.filter(q => !q.answer).length > 0 && `(${questions.filter(q => !q.answer).length})`}
        </button>
      </div>

      {/* ── Content tab ───────────────────────────────────────────── */}
      {tab === 'content' && (
        <>
          {/* Modules */}
          <div className={styles.sectionCard}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h2 className={styles.sectionCardTitle} style={{ margin: 0 }}>{t('admin:academy.modules')}</h2>
              <button className={styles.addBtn} onClick={() => setModuleModal({ ...EMPTY_MODULE })}>{t('admin:academy.addModule')}</button>
            </div>
            {modules.length === 0 ? (
              <div className={styles.empty}>{t('admin:academy.noModules')}</div>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th className={styles.th}>{t('admin:academy.colOrder')}</th>
                      <th className={styles.th}>{t('admin:academy.colTitle')}</th>
                      <th className={styles.th}>{t('admin:academy.colAudience')}</th>
                      <th className={styles.th}>{t('admin:academy.colVisibleTo')}</th>
                      <th className={styles.th}>{t('admin:academy.colStatus')}</th>
                      <th className={styles.th}>{t('admin:academy.colVideos')}</th>
                      <th className={styles.th}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {modules.map(mod => (
                      <tr key={mod.id} className={styles.tr}>
                        <td className={styles.td}>{mod.sort_order}</td>
                        <td className={styles.td} style={{ fontWeight: 600 }}>{mod.title}</td>
                        <td className={styles.td}><AudienceBadges value={mod.audiences} adminOnly={mod.admin_only} /></td>
                        <td className={styles.td}><VisibleTo row={mod} /></td>
                        <td className={styles.td}>
                          <span className={`${styles.badge} ${mod.is_active ? styles.badgeActive : styles.badgeInactive}`}>
                            {mod.is_active ? t('admin:academy.statusActive') : t('admin:academy.statusInactive')}
                          </span>
                        </td>
                        <td className={styles.td}>{videos.filter(v => v.module_id === mod.id).length}</td>
                        <td className={styles.td}>
                          <button className={styles.iconBtn} onClick={() => setModuleModal({ ...mod })}>{t('common:action.edit')}</button>
                          <button className={styles.deleteBtn} style={{ marginLeft: 6 }} onClick={() => handleModuleDelete(mod.id)}>{t('common:action.delete')}</button>
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
              <h2 className={styles.sectionCardTitle} style={{ margin: 0 }}>{t('admin:academy.videos')}</h2>
              <button className={styles.addBtn} onClick={() => setVideoModal({ ...EMPTY_VIDEO })}>{t('admin:academy.addVideo')}</button>
            </div>
            {videos.length === 0 ? (
              <div className={styles.empty}>{t('admin:academy.noVideos')}</div>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th className={styles.th}></th>
                      <th className={styles.th}>{t('admin:academy.colTitle')}</th>
                      <th className={styles.th}>{t('admin:academy.colModule')}</th>
                      <th className={styles.th}>{t('admin:academy.colAudience')}</th>
                      <th className={styles.th}>{t('admin:academy.colVisibleTo')}</th>
                      <th className={styles.th}>{t('admin:academy.colTrade')}</th>
                      <th className={styles.th}>{t('admin:academy.colStatus')}</th>
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
                          <td className={styles.td}><AudienceBadges value={vid.audiences} adminOnly={vid.admin_only} /></td>
                          <td className={styles.td}><VisibleTo row={vid} /></td>
                          <td className={styles.td}>{vid.trade_vertical}</td>
                          <td className={styles.td}>
                            <span className={`${styles.badge} ${vid.is_active ? styles.badgeActive : styles.badgeInactive}`}>
                              {vid.is_active ? t('admin:academy.statusActive') : t('admin:academy.statusInactive')}
                            </span>
                          </td>
                          <td className={styles.td}>
                            <button className={styles.iconBtn} onClick={() => setVideoModal({ ...vid })}>{t('common:action.edit')}</button>
                            <button className={styles.deleteBtn} style={{ marginLeft: 6 }} onClick={() => handleVideoDelete(vid.id)}>{t('common:action.delete')}</button>
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
          <h2 className={styles.sectionCardTitle}>{t('admin:academy.qaInbox')}</h2>
          {questions.length === 0 ? (
            <div className={styles.empty}>{t('admin:academy.noQuestions')}</div>
          ) : (
            questions.map(q => (
              <div key={q.id} style={{
                padding: 16, borderBottom: '1px solid var(--color-border)',
                background: !q.answer ? 'rgba(245,158,11,0.03)' : 'transparent',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                      {q.companies?.name ?? t('admin:academy.unknown')} &middot; {new Date(q.created_at).toLocaleDateString()}
                      {q.academy_videos?.title && <> &middot; {t('admin:academy.re')} {q.academy_videos.title}</>}
                      {!q.answer && <span className={styles.pendingBadge}>{t('admin:academy.unanswered')}</span>}
                    </span>
                    <p style={{ fontSize: 14, fontWeight: 500, margin: '6px 0 0', color: 'var(--color-text)' }}>{q.question}</p>
                    <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{t('admin:academy.notify')} {q.notify_method}</span>
                  </div>
                </div>
                <div style={{ marginTop: 10 }}>
                  <textarea
                    className={styles.formInput}
                    style={{ width: '100%', minHeight: 60, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'var(--font-body)' }}
                    value={answerDrafts[q.id] ?? ''}
                    onChange={e => setAnswerDrafts(prev => ({ ...prev, [q.id]: e.target.value }))}
                    placeholder={t('admin:academy.answerPlaceholder')}
                  />
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 8 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', color: 'var(--color-text-muted)' }}>
                      <input
                        type="checkbox"
                        checked={publishToggles[q.id] ?? false}
                        onChange={e => setPublishToggles(prev => ({ ...prev, [q.id]: e.target.checked }))}
                      />
                      {t('admin:academy.publishToPublic')}
                    </label>
                    <button
                      className={styles.submitBtn}
                      disabled={!answerDrafts[q.id]?.trim() || answerSaving === q.id}
                      onClick={() => handleAnswerSave(q)}
                    >
                      {answerSaving === q.id ? t('admin:academy.saving') : t('admin:academy.saveAnswer')}
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
          <h3 style={{ margin: '0 0 16px' }}>{moduleModal.id ? t('admin:academy.editModule') : t('admin:academy.newModule')}</h3>
          <form onSubmit={handleModuleSave}>
            <div className={styles.formGrid}>
              <div className={styles.formField}>
                <label className={styles.formLabel}>{t('admin:academy.fieldTitle')}</label>
                <input className={styles.formInput} required value={moduleModal.title} onChange={e => setModuleModal(m => ({ ...m, title: e.target.value }))} />
              </div>
              <div className={styles.formField}>
                <label className={styles.formLabel}>{t('admin:academy.fieldSortOrder')}</label>
                <input className={styles.formInput} type="number" value={moduleModal.sort_order} onChange={e => setModuleModal(m => ({ ...m, sort_order: e.target.value }))} />
              </div>
            </div>
            <div className={styles.formField} style={{ marginBottom: 12 }}>
              <label className={styles.formLabel}>{t('admin:academy.fieldDescription')}</label>
              <textarea className={styles.formInput} style={{ minHeight: 60, resize: 'vertical' }} value={moduleModal.description ?? ''} onChange={e => setModuleModal(m => ({ ...m, description: e.target.value }))} />
            </div>
            <div className={styles.formGrid}>
              <div className={styles.formField}>
                <label className={styles.formLabel}>{t('admin:academy.fieldAudience')}</label>
                <AudienceCheckboxes
                  value={moduleModal.audiences}
                  onChange={next => setModuleModal(m => ({ ...m, audiences: next }))}
                  adminOnly={moduleModal.admin_only}
                  onAdminOnlyChange={next => setModuleModal(m => ({ ...m, admin_only: next }))}
                />
              </div>
              <div className={styles.formField}>
                <label className={styles.formLabel}>{t('admin:academy.fieldSection')}</label>
                <select className={styles.formSelect} value={moduleModal.module_group || 'core'} onChange={e => setModuleModal(m => ({ ...m, module_group: e.target.value }))}>
                  <option value="start_here">{t('admin:academy.sectionStartHere')}</option>
                  <option value="core">{t('admin:academy.sectionCore')}</option>
                  <option value="advanced">{t('admin:academy.sectionAdvanced')}</option>
                </select>
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={moduleModal.is_active} onChange={e => setModuleModal(m => ({ ...m, is_active: e.target.checked }))} />
              {t('admin:academy.active')}
            </label>
            <div className={styles.formActions}>
              <button type="submit" className={styles.submitBtn} disabled={moduleSaving}>{moduleSaving ? t('admin:academy.saving') : t('common:action.save')}</button>
              <button type="button" className={styles.secondaryBtn} onClick={() => setModuleModal(null)}>{t('common:action.cancel')}</button>
            </div>
          </form>
        </ModalBackdrop>
      )}

      {/* ── Video modal ───────────────────────────────────────────── */}
      {videoModal && (
        <ModalBackdrop onClose={() => setVideoModal(null)}>
          <h3 style={{ margin: '0 0 16px' }}>{videoModal.id ? t('admin:academy.editVideo') : t('admin:academy.newVideo')}</h3>
          <form onSubmit={handleVideoSave}>
            <div className={styles.formGrid}>
              <div className={styles.formField}>
                <label className={styles.formLabel}>{t('admin:academy.fieldTitle')}</label>
                <input className={styles.formInput} required value={videoModal.title} onChange={e => setVideoModal(v => ({ ...v, title: e.target.value }))} />
              </div>
              <div className={styles.formField}>
                <label className={styles.formLabel}>{t('admin:academy.fieldModule')}</label>
                <select className={styles.formSelect} value={videoModal.module_id ?? ''} onChange={e => setVideoModal(v => ({ ...v, module_id: e.target.value || null }))}>
                  <option value="">{t('admin:academy.noModuleOption')}</option>
                  {modules.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
                </select>
              </div>
            </div>
            <div className={styles.formGrid}>
              <div className={styles.formField}>
                <label className={styles.formLabel}>{t('admin:academy.fieldYoutube')}</label>
                <input className={styles.formInput} required placeholder={t('admin:academy.youtubePlaceholder')} value={videoModal.youtube_id} onChange={e => setVideoModal(v => ({ ...v, youtube_id: e.target.value }))} />
                {extractYouTubeId(videoModal.youtube_id) && (
                  <img
                    src={`https://img.youtube.com/vi/${extractYouTubeId(videoModal.youtube_id)}/hqdefault.jpg`}
                    alt={t('admin:academy.previewAlt')}
                    style={{ marginTop: 8, width: 160, borderRadius: 6 }}
                    onError={(e) => { e.currentTarget.style.display = 'none' }}
                  />
                )}
              </div>
              <div className={styles.formField}>
                <label className={styles.formLabel}>{t('admin:academy.fieldDuration')}</label>
                <input className={styles.formInput} placeholder={t('admin:academy.durationPlaceholder')} value={videoModal.duration ?? ''} onChange={e => setVideoModal(v => ({ ...v, duration: e.target.value }))} />
              </div>
            </div>
            <div className={styles.formField} style={{ marginBottom: 12 }}>
              <label className={styles.formLabel}>{t('admin:academy.fieldDescription')}</label>
              <textarea className={styles.formInput} style={{ minHeight: 60, resize: 'vertical' }} value={videoModal.description ?? ''} onChange={e => setVideoModal(v => ({ ...v, description: e.target.value }))} />
            </div>
            <div className={styles.formGrid}>
              <div className={styles.formField}>
                <label className={styles.formLabel}>{t('admin:academy.fieldAudience')}</label>
                <AudienceCheckboxes
                  value={videoModal.audiences}
                  onChange={next => setVideoModal(v => ({ ...v, audiences: next }))}
                  adminOnly={videoModal.admin_only}
                  onAdminOnlyChange={next => setVideoModal(v => ({ ...v, admin_only: next }))}
                />
              </div>
              <div className={styles.formField}>
                <label className={styles.formLabel}>{t('admin:academy.fieldTradeVertical')}</label>
                <input className={styles.formInput} value={videoModal.trade_vertical} onChange={e => setVideoModal(v => ({ ...v, trade_vertical: e.target.value }))} placeholder={t('admin:academy.tradeVerticalPlaceholder')} />
              </div>
              <div className={styles.formField}>
                <label className={styles.formLabel}>{t('admin:academy.fieldSortOrder')}</label>
                <input className={styles.formInput} type="number" value={videoModal.sort_order} onChange={e => setVideoModal(v => ({ ...v, sort_order: e.target.value }))} />
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, margin: '12px 0', cursor: 'pointer' }}>
              <input type="checkbox" checked={videoModal.is_active} onChange={e => setVideoModal(v => ({ ...v, is_active: e.target.checked }))} />
              {t('admin:academy.active')}
            </label>
            <div className={styles.formActions}>
              <button type="submit" className={styles.submitBtn} disabled={videoSaving}>{videoSaving ? t('admin:academy.saving') : t('common:action.save')}</button>
              <button type="button" className={styles.secondaryBtn} onClick={() => setVideoModal(null)}>{t('common:action.cancel')}</button>
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
