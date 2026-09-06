import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// Documents rows linked to one record (RLS scopes to the company).
export function useLinkedDocuments(linkedType, linkedId) {
  const [documents, setDocuments] = useState([])

  const refetch = useCallback(async () => {
    if (!linkedId) { setDocuments([]); return }
    try {
      const { data } = await supabase
        .from('documents')
        .select('id, linked_type, linked_id, bucket_path, doc_type, original_filename, created_at')
        .eq('linked_type', linkedType)
        .eq('linked_id', linkedId)
        .order('created_at', { ascending: false })
      setDocuments(data ?? [])
    } catch { setDocuments([]) }
  }, [linkedType, linkedId])

  useEffect(() => { refetch() }, [refetch])

  return { documents, refetch }
}
