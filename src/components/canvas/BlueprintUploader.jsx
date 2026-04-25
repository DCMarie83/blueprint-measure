import { useRef, useState, useCallback } from 'react'
import * as tus from 'tus-js-client'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import styles from './BlueprintUploader.module.css'

// Bucket-side limit must also be set to 150MB in Supabase Storage settings → blueprints bucket → File size limit. Already configured.
const MAX_FILE_SIZE_MB = 150
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024

// Handles uploading a blueprint image (JPG, PNG, or PDF) to Supabase Storage
// using tus resumable uploads so large files survive flaky connections.
// Requires tus-js-client (added for resumable upload support).
export default function BlueprintUploader({ sessionId, onUploaded, onStorageCheck }) {
  const { user } = useAuth()
  const inputRef = useRef(null)
  const uploadRef = useRef(null) // tus Upload instance for retry
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0) // 0–100
  const [bytesUploaded, setBytesUploaded] = useState(0)
  const [bytesTotal, setBytesTotal] = useState(0)
  const [error, setError] = useState('')
  const [failedFile, setFailedFile] = useState(null) // stash file for retry

  const formatBytes = useCallback((bytes) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }, [])

  async function startUpload(file) {
    if (!file) return
    setError('')
    setFailedFile(null)

    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
    if (!allowed.includes(file.type)) {
      setError('Please upload a JPG, PNG, or PDF file.')
      return
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError(`File too large. Maximum is ${MAX_FILE_SIZE_MB}MB.`)
      return
    }

    // If a storage check callback is provided, verify we're within limits before uploading
    if (onStorageCheck) {
      const allowed = await onStorageCheck(file.size)
      if (!allowed) return // onStorageCheck will set its own error message
    }

    setUploading(true)
    setProgress(0)
    setBytesUploaded(0)
    setBytesTotal(file.size)

    const ext = file.name.split('.').pop()
    const path = `${user.id}/${sessionId}/blueprint.${ext}`
    const bucketName = 'blueprints'

    // Get an auth token for the tus upload
    const { data: { session: authSession } } = await supabase.auth.getSession()
    const accessToken = authSession?.access_token

    if (!accessToken) {
      setError('Not authenticated. Please sign in again.')
      setUploading(false)
      return
    }

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL

    const upload = new tus.Upload(file, {
      endpoint: `${supabaseUrl}/storage/v1/upload/resumable`,
      retryDelays: [0, 1000, 3000, 5000],
      headers: {
        authorization: `Bearer ${accessToken}`,
        'x-upsert': 'true',
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName,
        objectName: path,
        contentType: file.type,
        cacheControl: '3600',
      },
      chunkSize: 6 * 1024 * 1024, // 6MB chunks
      onError(err) {
        setError(`Upload failed: ${err.message ?? 'Network error'}. You can retry without re-selecting the file.`)
        setFailedFile(file)
        setUploading(false)
      },
      onProgress(uploaded, total) {
        const pct = Math.round((uploaded / total) * 100)
        setProgress(pct)
        setBytesUploaded(uploaded)
        setBytesTotal(total)
      },
      async onSuccess() {
        try {
          // Get the public URL
          const { data: { publicUrl } } = supabase.storage
            .from(bucketName)
            .getPublicUrl(path)

          onUploaded({ url: publicUrl, type: file.type, originalName: file.name })

          // Save blueprint_url to the session record
          const { error: updateError } = await supabase
            .from('sessions')
            .update({ blueprint_url: publicUrl, blueprint_type: file.type })
            .eq('id', sessionId)

          if (updateError) throw new Error(updateError.message)
        } catch (err) {
          setError(err.message)
        } finally {
          setUploading(false)
          setProgress(0)
          setFailedFile(null)
          uploadRef.current = null
        }
      },
    })

    uploadRef.current = upload

    // Check for previous uploads to resume
    upload.findPreviousUploads().then(previousUploads => {
      if (previousUploads.length > 0) {
        upload.resumeUpload(previousUploads[0])
      }
      upload.start()
    })
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
          <div className={styles.sub}>JPG, PNG, or PDF — up to {MAX_FILE_SIZE_MB}MB</div>
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
