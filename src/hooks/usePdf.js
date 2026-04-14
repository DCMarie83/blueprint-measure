import { useState, useEffect, useRef, useCallback } from 'react'
import * as pdfjsLib from 'pdfjs-dist'

// Point pdfjs at its worker. The ?url suffix tells Vite to treat this as a
// static asset and return the URL string rather than bundling the module.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

// Loads a PDF from a URL and exposes utilities for rendering individual pages.
//
// Returns:
//   pageCount   — total number of pages (0 while loading)
//   pdfLoading  — true while the PDF document is being fetched
//   renderPage  — async (pageNum, scale?) => dataUrl | null
export function usePdf(url) {
  const [pageCount, setPageCount] = useState(0)
  const [pdfLoading, setPdfLoading] = useState(false)
  const pdfRef = useRef(null)

  useEffect(() => {
    if (!url) {
      pdfRef.current = null
      setPageCount(0)
      return
    }

    setPdfLoading(true)
    setPageCount(0)

    const task = pdfjsLib.getDocument(url)

    task.promise
      .then(pdf => {
        pdfRef.current = pdf
        setPageCount(pdf.numPages)
        setPdfLoading(false)
      })
      .catch(err => {
        // AbortException is normal when the component unmounts mid-load
        if (err?.name !== 'AbortException') {
          console.error('PDF load error:', err)
        }
        setPdfLoading(false)
      })

    return () => {
      task.destroy()
      pdfRef.current = null
    }
  }, [url])

  // Renders a single page to a JPEG data URL.
  // scale=1.5 gives good canvas quality; use scale=0.2 for thumbnails.
  const renderPage = useCallback(async (pageNum, scale = 1.5) => {
    if (!pdfRef.current) return null
    try {
      const page = await pdfRef.current.getPage(pageNum)
      const viewport = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = viewport.width
      canvas.height = viewport.height
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
      return canvas.toDataURL('image/jpeg', 0.92)
    } catch (err) {
      console.error(`PDF render error (page ${pageNum}):`, err)
      return null
    }
  }, []) // stable — pdfRef is a ref, not state

  return { pageCount, pdfLoading, renderPage }
}
