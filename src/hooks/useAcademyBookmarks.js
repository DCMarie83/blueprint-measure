import { useState, useEffect, useCallback } from 'react'

const STORAGE_KEY = 'rivetdog_academy_bookmarks'

export function useAcademyBookmarks() {
  const [bookmarks, setBookmarks] = useState(new Set())

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) setBookmarks(new Set(JSON.parse(raw)))
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...bookmarks]))
    } catch { /* ignore */ }
  }, [bookmarks])

  const isBookmarked = useCallback((videoId) => bookmarks.has(videoId), [bookmarks])

  const toggle = useCallback((videoId) => {
    setBookmarks(prev => {
      const next = new Set(prev)
      if (next.has(videoId)) next.delete(videoId)
      else next.add(videoId)
      return next
    })
  }, [])

  return { bookmarks, isBookmarked, toggle, count: bookmarks.size }
}
