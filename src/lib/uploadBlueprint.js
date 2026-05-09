import * as tus from 'tus-js-client'
import { supabase } from './supabase'

const MAX_FILE_SIZE_GB = 1
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_GB * 1024 * 1024 * 1024
export const HARD_LIMIT_FILE_SIZE_BYTES = 200 * 1024 * 1024
export const WARN_FILE_SIZE_BYTES = 50 * 1024 * 1024
export const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']

export function validateFile(file) {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { valid: false, error: 'Please upload a JPG, PNG, or PDF file.' }
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { valid: false, error: `File too large. Maximum is ${MAX_FILE_SIZE_GB}GB.` }
  }
  const sizeMb = Math.round(file.size / 1024 / 1024)
  if (file.type === 'application/pdf' && file.size > HARD_LIMIT_FILE_SIZE_BYTES) {
    return { valid: false, splittable: true, error: `PDF is too large (${sizeMb} MB). Use the split feature to break it into smaller blueprints.` }
  }
  if (file.size > WARN_FILE_SIZE_BYTES) {
    return { valid: true, warning: `Large file (${sizeMb} MB) — may take a while to upload and render.` }
  }
  return { valid: true }
}

export function deriveSessionName(filename) {
  const name = filename.replace(/\.[^.]+$/, '')
  return name.replace(/_/g, ' ')
}

// Starts a TUS resumable upload for a single file.
// Returns { upload, abort } — upload is the TUS instance, abort() cancels it.
export function uploadBlueprint({ file, sessionId, userId, accessToken, onProgress, onError, onSuccess }) {
  const ext = file.name.split('.').pop()
  const path = `${userId}/${sessionId}/blueprint.${ext}`
  const bucketName = 'blueprints'
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
    chunkSize: 6 * 1024 * 1024,
    onError(err) {
      onError?.(err.message ?? 'Network error')
    },
    onProgress(uploaded, total) {
      onProgress?.(Math.round((uploaded / total) * 100), uploaded, total)
    },
    async onSuccess() {
      try {
        const { data: { publicUrl } } = supabase.storage
          .from(bucketName)
          .getPublicUrl(path)

        const cacheBustedUrl = publicUrl + (publicUrl.includes('?') ? '&' : '?') + 'v=' + Date.now()

        const { error: updateError } = await supabase
          .from('sessions')
          .update({ blueprint_url: cacheBustedUrl, blueprint_type: file.type })
          .eq('id', sessionId)

        if (updateError) throw new Error(updateError.message)
        onSuccess?.(cacheBustedUrl)
      } catch (err) {
        onError?.(err.message)
      }
    },
  })

  upload.findPreviousUploads().then(previousUploads => {
    if (previousUploads.length > 0) {
      upload.resumeUpload(previousUploads[0])
    }
    upload.start()
  })

  return {
    upload,
    abort() { upload.abort() },
  }
}
