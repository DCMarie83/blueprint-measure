import { useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import styles from './BlueprintUploader.module.css'

// Handles uploading a blueprint image (JPG, PNG, or PDF) to Supabase Storage
// and saving the public URL back to the session record.
export default function BlueprintUploader({ sessionId, onUploaded }) {
  const { user } = useAuth()
  const inputRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  async function handleFile(file) {
    if (!file) return
    setError('')

    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
    if (!allowed.includes(file.type)) {
      setError('Please upload a JPG, PNG, or PDF file.')
      return
    }

    const maxMB = 20
    if (file.size > maxMB * 1024 * 1024) {
      setError(`File too large. Maximum is ${maxMB}MB.`)
      return
    }

    setUploading(true)

    try {
      // Upload to Supabase Storage bucket "blueprints"
      const ext = file.name.split('.').pop()
      const path = `${user.id}/${sessionId}/blueprint.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('blueprints')
        .upload(path, file, { upsert: true })

      if (uploadError) throw new Error(uploadError.message)

      // Get the public URL
      const { data: { publicUrl } } = supabase.storage
        .from('blueprints')
        .getPublicUrl(path)

      // If PDF, we'll render it via pdfjs — pass the url and type
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
    }
  }

  function handleDrop(e) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    handleFile(file)
  }

  return (
    <div
      className={styles.dropzone}
      onDragOver={e => e.preventDefault()}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.pdf"
        className={styles.hidden}
        onChange={e => handleFile(e.target.files[0])}
      />
      {uploading ? (
        <div className={styles.uploading}>
          <div className={styles.spinner} />
          Uploading…
        </div>
      ) : (
        <>
          <div className={styles.icon}>📋</div>
          <div className={styles.text}>
            <strong>Drop blueprint here</strong> or click to browse
          </div>
          <div className={styles.sub}>JPG, PNG, or PDF — up to 20MB</div>
          {error && <div className={styles.error}>{error}</div>}
        </>
      )}
    </div>
  )
}
