import { useRef, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { uploadBlueprint, validateFile, MAX_FILE_SIZE_BYTES } from '../../lib/uploadBlueprint'
import styles from './BlueprintUploader.module.css'

const MAX_FILE_SIZE_GB = 1

export default function BlueprintUploader({ sessionId, onUploaded, onStorageCheck, oldBlueprintType }) {
  const { user } = useAuth()
  const inputRef = useRef(null)
  const uploadRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [bytesUploaded, setBytesUploaded] = useState(0)
  const [bytesTotal, setBytesTotal] = useState(0)
  const [error, setError] = useState('')
  const [failedFile, setFailedFile] = useState(null)

  const formatBytes = useCallback((bytes) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }, [])

  async function startUpload(file) {
    if (!file) return
    setError('')
    setFailedFile(null)

    const validationError = validateFile(file)
    if (validationError) {
      setError(validationError)
      return
    }

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
      onSuccess(cacheBustedUrl) {
        onUploaded({ url: cacheBustedUrl, type: file.type, originalName: file.name })
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
          {error && (
            <div className={styles.error}>
              {error}
              {failedFile && (
                <button className={styles.retryBtn} onClick={e => { e.stopPropagation(); handleRetry() }}>
                  Retry Upload
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
