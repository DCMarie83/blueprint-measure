import { useRef, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useSessions } from '../../hooks/useSessions'
import { uploadBlueprint, validateFile } from '../../lib/uploadBlueprint'
import { getUserStorageUsage } from '../../utils/storageUsage'
import Modal from '../ui/Modal'
import PdfSplitModal from './PdfSplitModal'
import styles from './MultiFileUploader.module.css'

const MAX_CONCURRENT = 3

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function MultiFileUploader({ projectId, project, existingEmptySessions, storageLimitMb, onComplete }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { createSessionsBatch } = useSessions()
  const inputRef = useRef(null)
  const [dragOver, setDragOver] = useState(false)
  const [fileStates, setFileStates] = useState([])
  // status: 'queued' | 'uploading' | 'done' | 'error' | 'creating'
  const [batchError, setBatchError] = useState('')
  const [batchWarning, setBatchWarning] = useState('')
  const [showResumePrompt, setShowResumePrompt] = useState(null) // { files, emptyCount }
  const [splittableFile, setSplittableFile] = useState(null)
  const activeUploads = useRef(0)
  const fileQueue = useRef([])

  const updateFileState = useCallback((idx, updates) => {
    setFileStates(prev => prev.map((f, i) => i === idx ? { ...f, ...updates } : f))
  }, [])

  async function startUploadForFile(entry, idx) {
    activeUploads.current++
    updateFileState(idx, { status: 'uploading' })

    const { data: { session: authSession } } = await supabase.auth.getSession()
    const accessToken = authSession?.access_token
    if (!accessToken) {
      updateFileState(idx, { status: 'error', error: t('blueprint:multiUpload.notAuthenticated') })
      activeUploads.current--
      kickQueue()
      return
    }

    uploadBlueprint({
      file: entry.file,
      sessionId: entry.sessionId,
      userId: user.id,
      accessToken,
      onProgress(pct) {
        updateFileState(idx, { progress: pct })
      },
      onError(msg) {
        updateFileState(idx, { status: 'error', error: msg })
        activeUploads.current--
        kickQueue()
      },
      onSuccess() {
        updateFileState(idx, { status: 'done', progress: 100 })
        activeUploads.current--
        kickQueue()
      },
    })
  }

  function kickQueue() {
    while (activeUploads.current < MAX_CONCURRENT && fileQueue.current.length > 0) {
      const next = fileQueue.current.shift()
      startUploadForFile(next.entry, next.idx)
    }
    // Check if all done
    setFileStates(prev => {
      const allFinished = prev.length > 0 && prev.every(f => f.status === 'done' || f.status === 'error')
      if (allFinished) {
        setTimeout(() => onComplete?.(), 500)
      }
      return prev
    })
  }

  async function handleFiles(fileList) {
    setBatchError('')
    const files = Array.from(fileList)

    // Validate all files first
    const errors = []
    const warnings = []
    const splittable = []
    for (const file of files) {
      const result = validateFile(file)
      if (!result.valid && result.splittable) {
        splittable.push(file)
      } else if (!result.valid) {
        errors.push(`${file.name}: ${result.error}`)
      } else if (result.warning) {
        warnings.push(`${file.name}: ${result.warning}`)
      }
    }

    // Handle splittable files
    if (splittable.length > 0) {
      if (splittable.length > 1 || errors.length > 0 || files.length > splittable.length) {
        setBatchError(t('blueprint:multiUpload.oneLargePdf'))
        return
      }
      setSplittableFile(splittable[0])
      return
    }

    if (errors.length > 0) {
      setBatchError(errors.join('\n'))
      return
    }
    setBatchWarning(warnings.length > 0 ? warnings.join('\n') : '')

    // E2: Storage quota check
    if (storageLimitMb != null) {
      try {
        const usage = await getUserStorageUsage(user.id)
        const totalBatchBytes = files.reduce((sum, f) => sum + f.size, 0)
        const projectedBytes = usage.totalBytes + totalBatchBytes
        const limitBytes = storageLimitMb * 1024 * 1024
        if (projectedBytes > limitBytes) {
          setBatchError(
            t('blueprint:multiUpload.batchExceedsStorage', {
              batch: formatBytes(totalBatchBytes),
              remaining: formatBytes(limitBytes - usage.totalBytes),
              limit: formatBytes(limitBytes),
            })
          )
          return
        }
      } catch {
        // Allow on quota check failure
      }
    }

    // E1: Resume guard — check for empty sessions
    const emptyCount = existingEmptySessions?.length ?? 0
    if (emptyCount > 0) {
      setShowResumePrompt({ files, emptyCount })
      return
    }

    await startBatch(files)
  }

  async function startBatch(files) {
    // Create sessions for all files
    const initialStates = files.map(f => ({
      file: f,
      name: f.name.replace(/\.[^.]+$/, '').replace(/_/g, ' '),
      sessionId: null,
      status: 'creating',
      progress: 0,
      error: null,
    }))
    setFileStates(initialStates)

    const results = await createSessionsBatch({
      files,
      projectId,
    })

    // Update states with session IDs
    const updatedStates = results.map((r, i) => ({
      ...initialStates[i],
      sessionId: r.sessionId,
      status: r.error ? 'error' : 'queued',
      error: r.error,
    }))
    setFileStates(updatedStates)

    // Queue uploads for successful session creations
    fileQueue.current = []
    updatedStates.forEach((entry, idx) => {
      if (entry.sessionId && !entry.error) {
        fileQueue.current.push({ entry, idx })
      }
    })

    kickQueue()
  }

  function handleRetry(idx) {
    const entry = fileStates[idx]
    if (!entry?.sessionId) return
    fileQueue.current.push({ entry, idx })
    updateFileState(idx, { status: 'queued', error: null, progress: 0 })
    kickQueue()
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragOver(false)
    handleFiles(e.dataTransfer.files)
  }

  const isActive = fileStates.length > 0 && fileStates.some(f => f.status === 'uploading' || f.status === 'queued' || f.status === 'creating')
  const doneCount = fileStates.filter(f => f.status === 'done').length
  const errorCount = fileStates.filter(f => f.status === 'error').length

  return (
    <div className={styles.wrapper}>
      {/* Drop zone */}
      <div
        className={`${styles.dropzone} ${dragOver ? styles.dropzoneActive : ''}`}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !isActive && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.pdf"
          multiple
          className={styles.hidden}
          onChange={e => { handleFiles(e.target.files); e.target.value = '' }}
        />
        <div className={styles.dropzoneIcon}>📂</div>
        <div className={styles.dropzoneText}>
          <strong>{t('blueprint:multiUpload.dropMultiple')}</strong> {t('blueprint:multiUpload.orClickBrowse')}
        </div>
        <div className={styles.dropzoneSub}>
          {t('blueprint:multiUpload.fileHint')}
        </div>
      </div>

      {/* Batch error */}
      {batchError && (
        <div className={styles.batchError}>{batchError}</div>
      )}
      {batchWarning && !batchError && (
        <div style={{ color: '#f59e0b', fontSize: 12, padding: '8px 12px', marginTop: 8, background: 'rgba(245,158,11,0.08)', borderRadius: 4, whiteSpace: 'pre-line' }}>
          {batchWarning}
        </div>
      )}

      {/* Per-file progress list */}
      {fileStates.length > 0 && (
        <div className={styles.fileList}>
          {fileStates.map((f, i) => (
            <div key={i} className={styles.fileItem}>
              <span className={styles.fileName}>{f.name}</span>
              <span className={styles.fileSize}>{formatBytes(f.file.size)}</span>
              {f.status === 'creating' && <span className={`${styles.fileStatus} ${styles.statusQueued}`}>{t('blueprint:multiUpload.creating')}</span>}
              {f.status === 'queued' && <span className={`${styles.fileStatus} ${styles.statusQueued}`}>{t('blueprint:multiUpload.queued')}</span>}
              {f.status === 'uploading' && (
                <>
                  <div className={styles.fileProgress}>
                    <div className={styles.fileProgressFill} style={{ width: `${f.progress}%` }} />
                  </div>
                  <span className={`${styles.fileStatus} ${styles.statusUploading}`}>{f.progress}%</span>
                </>
              )}
              {f.status === 'done' && <span className={`${styles.fileStatus} ${styles.statusDone}`}>{t('blueprint:multiUpload.done')}</span>}
              {f.status === 'error' && (
                <>
                  <span className={`${styles.fileStatus} ${styles.statusError}`} title={f.error}>{t('blueprint:multiUpload.failed')}</span>
                  {f.sessionId && <button className={styles.retryBtn} onClick={() => handleRetry(i)}>{t('common:action.retry')}</button>}
                </>
              )}
            </div>
          ))}
          {(doneCount > 0 || errorCount > 0) && (
            <div className={styles.summary}>
              {doneCount > 0 && t('blueprint:multiUpload.uploadedCount', { count: doneCount })}
              {doneCount > 0 && errorCount > 0 && ' · '}
              {errorCount > 0 && t('blueprint:multiUpload.failedCount', { count: errorCount })}
            </div>
          )}
        </div>
      )}

      {/* E1 Resume prompt */}
      {showResumePrompt && (
        <Modal title={t('blueprint:multiUpload.emptyFoundTitle')} onClose={() => setShowResumePrompt(null)}>
          <p style={{ color: 'var(--color-text-muted)', marginBottom: 20 }}>
            {t('blueprint:multiUpload.emptyFoundBody', { count: showResumePrompt.emptyCount })}
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button
              style={{ background: 'none', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '9px 18px', color: 'var(--color-text-muted)', cursor: 'pointer' }}
              onClick={() => setShowResumePrompt(null)}
            >
              {t('common:action.cancel')}
            </button>
            <button
              style={{ background: 'var(--color-primary)', border: 'none', borderRadius: 'var(--radius)', padding: '9px 18px', color: 'white', fontWeight: 600, cursor: 'pointer' }}
              onClick={() => {
                const files = showResumePrompt.files
                setShowResumePrompt(null)
                startBatch(files)
              }}
            >
              {t('blueprint:multiUpload.createNew')}
            </button>
          </div>
        </Modal>
      )}

      {/* PDF Split modal */}
      {splittableFile && (
        <PdfSplitModal
          file={splittableFile}
          projectId={projectId}
          onComplete={() => {
            setSplittableFile(null)
            onComplete?.()
          }}
          onCancel={() => setSplittableFile(null)}
        />
      )}
    </div>
  )
}
