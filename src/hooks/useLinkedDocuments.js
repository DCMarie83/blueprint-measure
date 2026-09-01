import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// Documents rows linked to one record (RLS scopes to the company).
export function useLinkedDocuments(linkedType, linkedId) {
  const [documents, setDocuments] = useState([])

  useEffect(() => {
    if (!linkedId) { setDocuments([]); return }
    let cancelled = false
    ;(async () => {
      try {
        const { data } = await supabase
          .from('documents')
          .select('id, linked_type, linked_id, bucket_path, doc_type, original_filename, created_at')
          .eq('linked_type', linkedType)
          .eq('linked_id', linkedId)
          .order('created_at', { ascending: false })
        if (!cancelled) setDocuments(data ?? [])
      } catch { if (!cancelled) setDocuments([]) }
    })()
    return () => { cancelled = true }
  }, [linkedType, linkedId])

  return documents
}
