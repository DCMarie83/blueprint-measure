import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useSessions } from '../../hooks/useSessions'
import { getPdfPageCount, extractPageRange, bytesToFile } from '../../lib/splitPdf'
import { uploadBlueprint, deriveSessionName } from '../../lib/uploadBlueprint'
import Modal from '../ui/Modal'

let nextRangeId = 1

function buildDefaultRanges(pageCount, baseName) {
  const ranges = []
  const chunkSize = 50
  for (let start = 1; start <= pageCount; start += chunkSize) {
    const end = Math.min(start + chunkSize - 1, pageCount)
    const id = nextRangeId++
    ranges.push({ id, start, end, name: `${baseName} Pages ${start}-${end}` })
  }
  return ranges
}

export default function PdfSplitModal({ file, projectId, onComplete, onCancel }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { createSession } = useSessions()
  const [pageCount, setPageCount] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [ranges, setRanges] = useState([])
  const [statuses, setStatuses] = useState({}) // { [id]: { status, message, progress } }
  const [processing, setProcessing] = useState(false)
  const [done, setDone] = useState(false)
  const cancelRef = useRef(false)
  const arrayBufferRef = useRef(null)

  const sizeMb = Math.round(file.size / 1024 / 1024)
  const baseName = deriveSessionName(file.name)

  // Load PDF and get page count on mount
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const ab = await file.arrayBuffer()
        if (cancelled) return
        arrayBufferRef.current = ab
        const count = await getPdfPageCount(ab)
        if (cancelled) return
        setPageCount(count)
        setRanges(buildDefaultRanges(count, baseName))
      } catch (err) {
        if (!cancelled) setLoadError(err.message)
      }
    }
    load()
    return () => { cancelled = true }
  }, [file, baseName])

  function updateRange(id, updates) {
    setRanges(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r))
  }

  function removeRange(id) {
    setRanges(prev => prev.filter(r => r.id !== id))
  }

  function addRange() {
    const lastEnd = ranges.length > 0 ? ranges[ranges.length - 1].end : 0
    const start = Math.min(lastEnd + 1, pageCount)
    const end = Math.min(start + 49, pageCount)
    const id = nextRangeId++
    setRanges(prev => [...prev, { id, start, end, name: `${baseName} Pages ${start}-${end}` }])
  }

  function validateRanges() {
    for (const r of ranges) {
      if (r.start < 1 || r.end > pageCount || r.start > r.end) return false
      if (r.end - r.start + 1 > 100) return false
      if (!r.name.trim()) return false
    }
    return ranges.length > 0
  }

  async function handleSplit() {
    setProcessing(true)
    cancelRef.current = false
    let anySucceeded = false

    for (const range of ranges) {
      if (cancelRef.current) break

      const id = range.id

      // Extract
      setStatuses(prev => ({ ...prev, [id]: { status: 'extracting', message: t('blueprint:split.extracting') } }))
      let bytes
      try {
        bytes = await extractPageRange(arrayBufferRef.current, range.start, range.end)
      } catch (err) {
        setStatuses(prev => ({ ...prev, [id]: { status: 'error', message: err.message } }))
        continue
      }

      if (cancelRef.current) break

      // Create session
      setStatuses(prev => ({ ...prev, [id]: { status: 'creating', message: t('blueprint:split.creating') } }))
      let session
      try {
        session = await createSession({
          projectName: range.name,
          projectId,
          description: null,
        })
      } catch (err) {
        setStatuses(prev => ({ ...prev, [id]: { status: 'error', message: err.message } }))
        continue
      }

      if (cancelRef.current) break

      // Upload
      setStatuses(prev => ({ ...prev, [id]: { status: 'uploading', message: t('blueprint:split.uploadingPct', { pct: 0 }), progress: 0 } }))
      const pdfFile = bytesToFile(bytes, `${range.name.replace(/\s+/g, '_')}.pdf`)
      const { data: { session: authSession } } = await supabase.auth.getSession()
      const accessToken = authSession?.access_token

      if (!accessToken) {
        setStatuses(prev => ({ ...prev, [id]: { status: 'error', message: t('blueprint:split.notAuthFull') } }))
        continue
      }

      try {
        await new Promise((resolve, reject) => {
          uploadBlueprint({
            file: pdfFile,
            sessionId: session.id,
            userId: user.id,
            accessToken,
            onProgress(pct) {
              setStatuses(prev => ({ ...prev, [id]: { status: 'uploading', message: t('blueprint:split.uploadingPct', { pct }), progress: pct } }))
            },
            onError(msg) {
              reject(new Error(msg))
            },
            onSuccess() {
              resolve()
            },
          })
        })
        setStatuses(prev => ({ ...prev, [id]: { status: 'done', message: t('blueprint:split.done') } }))
        anySucceeded = true
      } catch (err) {
        setStatuses(prev => ({ ...prev, [id]: { status: 'error', message: t('blueprint:split.uploadFailed', { message: err.message }) } }))
      }
    }

    setProcessing(false)
    setDone(true)
    if (anySucceeded) {
      onComplete?.()
    }
  }

  function handleCancel() {
    if (processing) {
      cancelRef.current = true
    } else {
      onCancel()
    }
  }

  function handleRetry(rangeId) {
    const range = ranges.find(r => r.id === rangeId)
    if (!range) return
    // Re-run just this single range
    setStatuses(prev => ({ ...prev, [rangeId]: { status: 'idle', message: '' } }))
    ;(async () => {
      setProcessing(true)

      setStatuses(prev => ({ ...prev, [rangeId]: { status: 'extracting', message: t('blueprint:split.extracting') } }))
      let bytes
      try {
        bytes = await extractPageRange(arrayBufferRef.current, range.start, range.end)
      } catch (err) {
        setStatuses(prev => ({ ...prev, [rangeId]: { status: 'error', message: err.message } }))
        setProcessing(false)
        return
      }

      setStatuses(prev => ({ ...prev, [rangeId]: { status: 'creating', message: t('blueprint:split.creating') } }))
      let session
      try {
        session = await createSession({
          projectName: range.name,
          projectId,
          description: null,
        })
      } catch (err) {
        setStatuses(prev => ({ ...prev, [rangeId]: { status: 'error', message: err.message } }))
        setProcessing(false)
        return
      }

      setStatuses(prev => ({ ...prev, [rangeId]: { status: 'uploading', message: t('blueprint:split.uploadingPct', { pct: 0 }), progress: 0 } }))
      const pdfFile = bytesToFile(bytes, `${range.name.replace(/\s+/g, '_')}.pdf`)
      const { data: { session: authSession } } = await supabase.auth.getSession()
      const accessToken = authSession?.access_token

      if (!accessToken) {
        setStatuses(prev => ({ ...prev, [rangeId]: { status: 'error', message: t('blueprint:split.notAuth') } }))
        setProcessing(false)
        return
      }

      try {
        await new Promise((resolve, reject) => {
          uploadBlueprint({
            file: pdfFile,
            sessionId: session.id,
            userId: user.id,
            accessToken,
            onProgress(pct) {
              setStatuses(prev => ({ ...prev, [rangeId]: { status: 'uploading', message: t('blueprint:split.uploadingPct', { pct }), progress: pct } }))
            },
            onError(msg) { reject(new Error(msg)) },
            onSuccess() { resolve() },
          })
        })
        setStatuses(prev => ({ ...prev, [rangeId]: { status: 'done', message: t('blueprint:split.done') } }))
        onComplete?.()
      } catch (err) {
        setStatuses(prev => ({ ...prev, [rangeId]: { status: 'error', message: t('blueprint:split.uploadFailed', { message: err.message }) } }))
      }
      setProcessing(false)
    })()
  }

  const isValid = pageCount && validateRanges()

  const STATUS_COLORS = {
    idle: 'var(--color-text-muted)',
    extracting: '#60a5fa',
    creating: '#60a5fa',
    uploading: '#60a5fa',
    done: '#86efac',
    error: '#ef4444',
  }

  return (
    <Modal title={t('blueprint:split.title')} onClose={handleCancel}>
      <div style={{ maxHeight: '70vh', overflowY: 'auto' }}>
        {/* Header info */}
        <div style={{ marginBottom: 16, color: 'var(--color-text-muted)', fontSize: 13 }}>
          <strong style={{ color: 'var(--color-text)' }}>{file.name}</strong>
          {' — '}{sizeMb} MB
          {pageCount && ` — ${t('blueprint:split.pagesCount', { count: pageCount })}`}
        </div>

        {/* Loading state */}
        {!pageCount && !loadError && (
          <div style={{ textAlign: 'center', padding: 20 }}>
            <div className="spinner" />
            <p style={{ marginTop: 8, color: 'var(--color-text-muted)', fontSize: 13 }}>{t('blueprint:split.readingPdf')}</p>
          </div>
        )}

        {/* Load error */}
        {loadError && (
          <div style={{ padding: 16, background: 'rgba(239,68,68,0.08)', borderRadius: 6, color: '#ef4444', fontSize: 13, marginBottom: 16 }}>
            {loadError}
          </div>
        )}

        {/* Range rows */}
        {pageCount && !loadError && (
          <>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 8 }}>
              {t('blueprint:split.definePrompt')}
            </div>

            {ranges.map((range, idx) => {
              const st = statuses[range.id]
              const rangeCount = range.end - range.start + 1
              const tooMany = rangeCount > 100
              const outOfBounds = range.start < 1 || range.end > pageCount || range.start > range.end
              const hasError = tooMany || outOfBounds

              return (
                <div key={range.id} style={{
                  display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8,
                  padding: '8px 10px', background: 'var(--color-surface, rgba(255,255,255,0.03))',
                  borderRadius: 6, border: hasError ? '1px solid rgba(239,68,68,0.3)' : '1px solid var(--color-border)',
                  flexWrap: 'wrap',
                }}>
                  {/* Page range inputs */}
                  <label style={{ fontSize: 12, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>{t('blueprint:split.pagesLabel')}</label>
                  <input
                    type="number"
                    min={1}
                    max={pageCount}
                    value={range.start}
                    onChange={e => updateRange(range.id, { start: parseInt(e.target.value) || 1 })}
                    disabled={processing}
                    style={{
                      width: 56, padding: '4px 6px', fontSize: 13, border: '1px solid var(--color-border)',
                      borderRadius: 4, background: 'var(--color-bg)', color: 'var(--color-text)', textAlign: 'center',
                    }}
                  />
                  <span style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>{t('blueprint:split.to')}</span>
                  <input
                    type="number"
                    min={1}
                    max={pageCount}
                    value={range.end}
                    onChange={e => updateRange(range.id, { end: parseInt(e.target.value) || 1 })}
                    disabled={processing}
                    style={{
                      width: 56, padding: '4px 6px', fontSize: 13, border: '1px solid var(--color-border)',
                      borderRadius: 4, background: 'var(--color-bg)', color: 'var(--color-text)', textAlign: 'center',
                    }}
                  />

                  {/* Name input */}
                  <input
                    type="text"
                    value={range.name}
                    onChange={e => updateRange(range.id, { name: e.target.value })}
                    disabled={processing}
                    placeholder={t('blueprint:split.blueprintName')}
                    style={{
                      flex: 1, minWidth: 140, padding: '4px 8px', fontSize: 13,
                      border: '1px solid var(--color-border)', borderRadius: 4,
                      background: 'var(--color-bg)', color: 'var(--color-text)',
                    }}
                  />

                  {/* Status or remove button */}
                  {st ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 120 }}>
                      <span style={{ fontSize: 12, color: STATUS_COLORS[st.status] }}>{st.message}</span>
                      {st.status === 'error' && !processing && (
                        <button
                          onClick={() => handleRetry(range.id)}
                          style={{
                            fontSize: 11, padding: '2px 8px', background: 'none',
                            border: '1px solid var(--color-border)', borderRadius: 4,
                            color: 'var(--color-text-muted)', cursor: 'pointer',
                          }}
                        >
                          {t('common:action.retry')}
                        </button>
                      )}
                    </div>
                  ) : (
                    <button
                      onClick={() => removeRange(range.id)}
                      disabled={ranges.length <= 1 || processing}
                      style={{
                        fontSize: 16, background: 'none', border: 'none',
                        color: ranges.length <= 1 ? 'var(--color-border)' : 'var(--color-text-muted)',
                        cursor: ranges.length <= 1 ? 'default' : 'pointer', padding: '0 4px',
                      }}
                      title={t('blueprint:split.removeRange')}
                    >
                      x
                    </button>
                  )}

                  {/* Validation messages */}
                  {hasError && (
                    <div style={{ width: '100%', fontSize: 11, color: '#ef4444', marginTop: 2 }}>
                      {tooMany && t('blueprint:split.tooManyPages', { count: rangeCount })}
                      {outOfBounds && t('blueprint:split.invalidRange')}
                    </div>
                  )}
                </div>
              )
            })}

            {/* Add range button */}
            {!processing && !done && (
              <button
                onClick={addRange}
                style={{
                  fontSize: 12, padding: '6px 12px', background: 'none',
                  border: '1px dashed var(--color-border)', borderRadius: 4,
                  color: 'var(--color-text-muted)', cursor: 'pointer', marginTop: 4, width: '100%',
                }}
              >
                {t('blueprint:split.addRange')}
              </button>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
        <button
          onClick={handleCancel}
          style={{
            background: 'none', border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius)', padding: '9px 18px',
            color: 'var(--color-text-muted)', cursor: 'pointer',
          }}
        >
          {done ? t('common:action.close') : processing ? t('blueprint:split.stopAfterCurrent') : t('common:action.cancel')}
        </button>
        {!done && (
          <button
            onClick={handleSplit}
            disabled={!isValid || processing}
            style={{
              background: isValid && !processing ? 'var(--color-primary)' : 'var(--color-border)',
              border: 'none', borderRadius: 'var(--radius)', padding: '9px 18px',
              color: 'white', fontWeight: 600,
              cursor: isValid && !processing ? 'pointer' : 'default',
            }}
          >
            {processing ? t('blueprint:split.splitting') : t('blueprint:split.splitUpload', { count: ranges.length })}
          </button>
        )}
      </div>
    </Modal>
  )
}
