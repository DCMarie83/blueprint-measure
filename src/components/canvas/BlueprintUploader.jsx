import { useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { uploadBlueprint, validateFile, MAX_FILE_SIZE_BYTES } from '../../lib/uploadBlueprint'
import styles from './BlueprintUploader.module.css'

const MAX_FILE_SIZE_GB = 1

export default function BlueprintUploader({ sessionId, projectId, onSplitFlowRedirect, onUploaded, onStorageCheck, oldBlueprintType }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const inputRef = useRef(null)
  const uploadRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [bytesUploaded, setBytesUploaded] = useState(0)
  const [bytesTotal, setBytesTotal] = useState(0)
  const [error, setError] = useState('')
  const [isSplittableError, setIsSplittableError] = useState(false)
  const [warning, setWarning] = useState('')
  const [failedFile, setFailedFile] = useState(null)

  const formatBytes = useCallback((bytes) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }, [])

  async function startUpload(file) {
    if (!file) return
    setError('')
    setIsSplittableError(false)
    setFailedFile(null)

    const validation = validateFile(file)
    if (!validation.valid) {
      if (validation.splittable) {
        setError('PDF is too large for direct upload. Use the multi-file drop zone on Job Overview to split a large PDF into multiple blueprints.')
        setIsSplittableError(true)
      } else {
        setError(validation.error)
      }
      return
    }
    setWarning(validation.warning || '')

    if (onStorageCheck) {
      const allowed = await onStorageCheck(file.size)
      if (!allowed) return
    }

    setUploading(true)
    setProgress(0)
    setBytesUploaded(0)
    setBytesTotal(file.size)

    const { data: { session: authSession } } = await supabase.auth.getSession()
    const accessToken = authSession?.access_token

    if (!accessToken) {
      setError('Not authenticated. Please sign in again.')
      setUploading(false)
      return
    }

    // If replacing and the file extension changed, remove the old file to avoid orphans
    if (oldBlueprintType) {
      const ext = file.name.split('.').pop()
      const mimeToExt = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' }
      const oldExt = mimeToExt[oldBlueprintType]
      if (oldExt && oldExt !== ext) {
        const oldPath = `${user.id}/${sessionId}/blueprint.${oldExt}`
        try {
          await supabase.storage.from('blueprints').remove([oldPath])
        } catch (e) {
          console.warn('[BlueprintUploader] Failed to remove old file:', e)
        }
      }
    }

    const { upload } = uploadBlueprint({
      file,
      sessionId,
      userId: user.id,
      accessToken,
      onProgress(pct, uploaded, total) {
        setProgress(pct)
        setBytesUploaded(uploaded)
        setBytesTotal(total)
      },
      onError(msg) {
        setError(`Upload failed: ${msg}. You can retry without re-selecting the file.`)
        setFailedFile(file)
        setUploading(false)
      },
      onSuccess({ url: cacheBustedUrl, path: storagePath }) {
        onUploaded({ url: cacheBustedUrl, path: storagePath, type: file.type, originalName: file.name })
        setUploading(false)
        setProgress(0)
        setFailedFile(null)
        uploadRef.current = null
      },
    })

    uploadRef.current = upload
  }

  function handleRetry() {
    if (failedFile) {
      startUpload(failedFile)
    } else if (uploadRef.current) {
      setError('')
      setUploading(true)
      uploadRef.current.start()
    }
  }

  function handleDrop(e) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    startUpload(file)
  }

  return (
    <div
      className={styles.dropzone}
      onDragOver={e => e.preventDefault()}
      onDrop={handleDrop}
      onClick={() => !uploading && inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.pdf"
        className={styles.hidden}
        onChange={e => startUpload(e.target.files[0])}
      />
      {uploading ? (
        <div className={styles.uploadingState}>
          <div className={styles.progressInfo}>
            <span className={styles.progressLabel}>Uploading… {progress}%</span>
            <span className={styles.progressBytes}>
              {formatBytes(bytesUploaded)} / {formatBytes(bytesTotal)}
            </span>
          </div>
          <div className={styles.progressBarTrack}>
            <div
              className={styles.progressBarFill}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      ) : (
        <>
          <div className={styles.icon}>📋</div>
          <div className={styles.text}>
            <strong>Drop blueprint here</strong> or click to browse
          </div>
          <div className={styles.sub}>JPG, PNG, or PDF — up to {MAX_FILE_SIZE_GB}GB</div>
          {warning && (
            <div style={{ color: '#f59e0b', fontSize: 12, marginTop: 6, padding: '6px 10px', background: 'rgba(245,158,11,0.08)', borderRadius: 4 }}>
              {warning}
            </div>
          )}
          {error && (
            <div className={styles.error}>
              {error}
              {failedFile && (
                <button className={styles.retryBtn} onClick={e => { e.stopPropagation(); handleRetry() }}>
                  Retry Upload
                </button>
              )}
              {isSplittableError && projectId && (
                <button
                  onClick={e => {
                    e.stopPropagation()
                    if (onSplitFlowRedirect) onSplitFlowRedirect()
                    else navigate(`/project/${projectId}`)
                  }}
                  style={{
                    marginTop: 8, padding: '8px 16px', background: 'var(--color-primary)',
                    color: 'white', border: 'none', borderRadius: 6, fontWeight: 600,
                    cursor: 'pointer', fontSize: 13,
                  }}
                >
                  Go to Job Overview
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
