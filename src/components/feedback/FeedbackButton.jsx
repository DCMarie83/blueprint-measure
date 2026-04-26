import { useState, useRef, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import styles from './FeedbackButton.module.css'

const FEEDBACK_TYPES = [
  { value: 'bug',      label: 'Bug' },
  { value: 'feature',  label: 'Feature Request' },
  { value: 'question', label: 'Question' },
  { value: 'other',    label: 'Other' },
]

export default function FeedbackButton({ prefillDescription = '' }) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [type, setType] = useState('bug')
  const [description, setDescription] = useState(prefillDescription)
  const [screenshot, setScreenshot] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState(null) // { type: 'success' | 'error', message }
  const fileRef = useRef(null)

  // Listen for open-feedback events from ErrorBoundary
  useEffect(() => {
    function onOpenFeedback(e) {
      const prefill = e.detail?.prefill ?? ''
      setDescription(prefill)
      setOpen(true)
    }
    window.addEventListener('open-feedback', onOpenFeedback)
    return () => window.removeEventListener('open-feedback', onOpenFeedback)
  }, [])

  function handleOpen() {
    setOpen(true)
    if (prefillDescription) setDescription(prefillDescription)
  }

  function handleClose() {
    setOpen(false)
    setType('bug')
    setDescription(prefillDescription || '')
    setScreenshot(null)
    setToast(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  function handleRemoveScreenshot() {
    setScreenshot(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  function handleScreenshot(e) {
    const file = e.target.files[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setToast({ type: 'error', message: 'Screenshots must be image files.' })
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setToast({ type: 'error', message: 'Screenshot must be under 5MB.' })
      return
    }
    setScreenshot(file)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (description.trim().length < 10) {
      setToast({ type: 'error', message: 'Description must be at least 10 characters.' })
      return
    }
    if (description.trim().length > 2000) {
      setToast({ type: 'error', message: 'Description must be under 2000 characters.' })
      return
    }

    setSubmitting(true)
    try {
      let screenshotUrl = null

      // Upload screenshot if provided
      if (screenshot) {
        const ext = screenshot.name.split('.').pop()
        const path = `${user.id}/${Date.now()}.${ext}`
        const { error: uploadErr } = await supabase.storage
          .from('feedback-screenshots')
          .upload(path, screenshot)
        if (uploadErr) throw new Error('Screenshot upload failed: ' + uploadErr.message)
        const { data: { publicUrl } } = supabase.storage
          .from('feedback-screenshots')
          .getPublicUrl(path)
        screenshotUrl = publicUrl
      }

      // Get tenant_id from user profile
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('company_id')
        .eq('user_id', user.id)
        .single()

      // Try to extract session_id from current URL
      const urlMatch = window.location.pathname.match(/\/session\/([a-f0-9-]+)/)
      const sessionId = urlMatch ? urlMatch[1] : null

      const { error: insertErr } = await supabase
        .from('beta_feedback')
        .insert({
          tenant_id: profile?.company_id ?? null,
          user_id: user.id,
          session_id: sessionId,
          type,
          description: description.trim(),
          screenshot_url: screenshotUrl,
          page_url: window.location.href,
          user_agent: navigator.userAgent,
        })
      if (insertErr) throw new Error(insertErr.message)

      setToast({ type: 'success', message: 'Feedback received — thank you!' })
      setTimeout(() => { handleClose(); setToast(null) }, 1500)
    } catch (err) {
      setToast({ type: 'error', message: err.message })
    } finally {
      setSubmitting(false)
    }
  }

  if (!user) return null

  return (
    <>
      {/* Floating button */}
      <button
        className={styles.fab}
        onClick={handleOpen}
        title="Send feedback"
        aria-label="Send feedback"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      </button>

      {/* Modal */}
      {open && (
        <div className={styles.backdrop} onClick={handleClose}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.header}>
              <h3 className={styles.title}>Send Feedback</h3>
              <button className={styles.closeBtn} onClick={handleClose}>✕</button>
            </div>
            <form onSubmit={handleSubmit} className={styles.form}>
              <label className={styles.label}>
                Type
                <select value={type} onChange={e => setType(e.target.value)} className={styles.select}>
                  {FEEDBACK_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </label>

              <label className={styles.label}>
                Description *
                <textarea
                  className={styles.textarea}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="What happened? What did you expect?"
                  rows={5}
                  minLength={10}
                  maxLength={2000}
                  required
                />
                <span className={styles.charCount}>{description.length} / 2000</span>
              </label>

              <label className={styles.label}>
                Screenshot (optional)
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  onChange={handleScreenshot}
                  className={styles.fileInput}
                />
                {screenshot && (
                  <span className={styles.fileName}>
                    {screenshot.name}
                    <button type="button" className={styles.removeFileBtn} onClick={handleRemoveScreenshot}>✕</button>
                  </span>
                )}
              </label>

              <button
                type="submit"
                className={styles.submitBtn}
                disabled={submitting || description.trim().length < 10}
              >
                {submitting ? 'Sending…' : 'Send Feedback'}
              </button>
            </form>

            {toast && (
              <div className={toast.type === 'success' ? styles.toastSuccess : styles.toastError}>
                {toast.message}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
