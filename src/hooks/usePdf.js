import { useState, useEffect, useRef, useCallback } from 'react'
import * as pdfjsLib from 'pdfjs-dist'

// Point pdfjs at its worker using a pinned CDN URL.
// Using a CDN URL is more reliable than the ?url Vite import, which can fail
// to resolve correctly in Vercel production builds when pdfjs-dist is excluded
// from Vite's pre-bundler (as it must be, to avoid mangling its dynamic imports).
// The version is pinned to match the installed pdfjs-dist package exactly.
pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://unpkg.com/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs'

// Loads a PDF from a URL and exposes utilities for rendering individual pages.
//
// Returns:
//   pageCount    — total number of pages (0 while loading)
//   pdfLoading   — true while the PDF document is being fetched
//   renderPage   — async (pageNum, scale?) => dataUrl | null
//   pdfPageInfo  — { widthPts, heightPts, widthInches, heightInches, pixelsPerInch }
//                  for the most recently rendered page (null before first render)
export function usePdf(url) {
  const [pageCount, setPageCount] = useState(0)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [pdfPageInfo, setPdfPageInfo] = useState(null)
  const pdfRef = useRef(null)

  useEffect(() => {
    if (!url) {
      pdfRef.current = null
      setPageCount(0)
      setPdfPageInfo(null)
      return
    }

    setPdfLoading(true)
    setPageCount(0)
    setPdfPageInfo(null)

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
  // Also updates pdfPageInfo with the page's physical dimensions and
  // the actual render resolution (pixelsPerInch) for the given scale.
  const renderPage = useCallback(async (pageNum, scale = 1.5) => {
    if (!pdfRef.current) return null
    try {
      const page = await pdfRef.current.getPage(pageNum)
      const viewport = page.getViewport({ scale })

      // PDF points are 1/72 of an inch. The base viewport (scale=1) gives
      // dimensions in points. Our scaled viewport gives rendered pixel dims.
      const baseViewport = page.getViewport({ scale: 1 })
      const widthPts    = baseViewport.width
      const heightPts   = baseViewport.height
      const widthInches  = widthPts / 72
      const heightInches = heightPts / 72

      // pixelsPerInch = how many rendered pixels per physical inch of the page.
      // This is the actual render DPI and is the foundation for accurate
      // scale-to-pixelsPerFoot conversion.
      const pixelsPerInch = viewport.width / widthInches

      const canvas = document.createElement('canvas')
      canvas.width = viewport.width
      canvas.height = viewport.height
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise

      // Update page info for the primary render (scale=1.5 used by the canvas).
      // Don't update for thumbnail renders (0.2) or AI detection renders (2.0/3.0)
      // since they use different scales and would give different pixelsPerInch values.
      if (scale === 1.5) {
        setPdfPageInfo({ widthPts, heightPts, widthInches, heightInches, pixelsPerInch })
      }

      return canvas.toDataURL('image/jpeg', 0.92)
    } catch (err) {
      console.error(`PDF render error (page ${pageNum}):`, err)
      return null
    }
  }, []) // stable — pdfRef is a ref, not state

  return { pageCount, pdfLoading, renderPage, pdfPageInfo }
}
