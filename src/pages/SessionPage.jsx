import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useSession } from '../hooks/useSession'
import { usePdf } from '../hooks/usePdf'
import { calcPixelsPerFoot } from '../utils/scaleOptions'
import { calculate } from '../utils/measurements'
import { exportCSV } from '../utils/csvExport'
import BlueprintCanvas from '../components/canvas/BlueprintCanvas'
import BlueprintUploader from '../components/canvas/BlueprintUploader'
import ScalePanel from '../components/canvas/ScalePanel'
import ZoneDrawPanel from '../components/zones/ZoneDrawPanel'
import ZoneList from '../components/zones/ZoneList'
import SessionSummary from '../components/zones/SessionSummary'
import PdfPageSelector from '../components/pdf/PdfPageSelector'
import styles from './SessionPage.module.css'

// SessionPage is the main working environment.
// Left sidebar: controls (scale, draw panel, zone list, export)
// Center: the blueprint canvas
export default function SessionPage() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const { session, zones, loading, error, saveZone, updateZone, redrawZone, deleteZone, updateSession } = useSession(sessionId)

  // ── Blueprint state ──────────────────────────────────────────────────────────
  const [blueprintUrl, setBlueprintUrl] = useState(null)
  const [blueprintType, setBlueprintType] = useState(null)

  // ── PDF state ────────────────────────────────────────────────────────────────
  const isPdf = blueprintType === 'application/pdf'
  const { pageCount, pdfLoading, renderPage } = usePdf(isPdf ? blueprintUrl : null)
  const [currentPage, setCurrentPage] = useState(1)
  const [renderedPageUrl, setRenderedPageUrl] = useState(null)
  const [thumbnails, setThumbnails] = useState({}) // { [pageNum]: dataUrl }

  // ── Scale state ──────────────────────────────────────────────────────────────
  const [pixelsPerFoot, setPixelsPerFoot] = useState(null)
  const [calibrating, setCalibrating] = useState(false)
  const [pendingCalibFeet, setPendingCalibFeet] = useState(null)

  // ── Canvas ref (used for resetView) ─────────────────────────────────────────
  const blueprintCanvasRef = useRef(null)

  // ── Drawing state ────────────────────────────────────────────────────────────
  const [isDrawing, setIsDrawing] = useState(false)
  const [activeZoneMeta, setActiveZoneMeta] = useState(null)
  const [drawnPoints, setDrawnPoints] = useState([])
  const [redrawingZoneId, setRedrawingZoneId] = useState(null)

  // ── Session restore ──────────────────────────────────────────────────────────
  // Runs when Supabase returns the session — restores blueprint URL and saved page.
  useEffect(() => {
    if (session?.blueprint_url && !blueprintUrl) {
      setBlueprintUrl(session.blueprint_url)
      setBlueprintType(session.blueprint_type)
      setCurrentPage(session.page_number ?? 1)
    }
  }, [session])

  // ── PDF page rendering ───────────────────────────────────────────────────────
  // Render the active page at full quality whenever the PDF loads or page changes.
  useEffect(() => {
    if (!isPdf || !pageCount) return
    setRenderedPageUrl(null)
    renderPage(currentPage, 1.5).then(url => {
      if (url) setRenderedPageUrl(url)
    })
  }, [isPdf, pageCount, currentPage, renderPage])

  // Generate thumbnails for every page at low resolution (0.2 scale).
  // Runs once per PDF load. Updates thumbnails state incrementally as each finishes.
  useEffect(() => {
    if (!isPdf || !pageCount) return
    setThumbnails({})
    for (let i = 1; i <= pageCount; i++) {
      const n = i
      renderPage(n, 0.2).then(url => {
        if (url) setThumbnails(prev => ({ ...prev, [n]: url }))
      })
    }
  }, [isPdf, pageCount, renderPage])

  // ── Derived: zones for current page ─────────────────────────────────────────
  // For PDFs filter to the active page. For image blueprints use all zones
  // (they all have page_number = 1 which is the only page).
  const pageZones = isPdf
    ? zones.filter(z => (z.page_number ?? 1) === currentPage)
    : zones

  // ── Handlers ─────────────────────────────────────────────────────────────────

  function handleUploaded({ url, type }) {
    setBlueprintUrl(url)
    setBlueprintType(type)
    // Reset PDF state for the newly uploaded file
    setCurrentPage(1)
    setRenderedPageUrl(null)
    setThumbnails({})
  }

  function handleScaleChange(ppf) {
    setPixelsPerFoot(ppf)
  }

  function handleStartCalibration(knownFeet) {
    setPendingCalibFeet(knownFeet)
    setCalibrating(true)
  }

  function handleCalibrationLine(pt1, pt2) {
    const dx = pt2.x - pt1.x
    const dy = pt2.y - pt1.y
    const pixelLength = Math.sqrt(dx * dx + dy * dy)
    const ppf = pixelLength / pendingCalibFeet
    setPixelsPerFoot(ppf)
    setCalibrating(false)
    setPendingCalibFeet(null)
  }

  // Switch to a different PDF page. Warns and cancels any active zone drawing.
  async function handlePageSwitch(pageNum) {
    if (pageNum === currentPage) return
    if (isDrawing) {
      const confirmed = window.confirm(
        'You have an active zone in progress. Switch pages and discard it?'
      )
      if (!confirmed) return
      // Cancel the in-progress zone before switching
      setIsDrawing(false)
      setActiveZoneMeta(null)
      setDrawnPoints([])
      setRedrawingZoneId(null)
    }
    setCurrentPage(pageNum)
    // Persist so the session reopens on the right page
    try {
      await updateSession({ page_number: pageNum })
    } catch (err) {
      console.error('Failed to save page number:', err)
    }
  }

  function handleStartDrawing({ name, description, surface_type, coat_count, type }) {
    setActiveZoneMeta({ name, description, surface_type, coat_count, type })
    setDrawnPoints([])
    setIsDrawing(true)
  }

  function handleRedrawZone(zone) {
    setRedrawingZoneId(zone.id)
    setActiveZoneMeta({
      name: zone.name,
      description: zone.description,
      surface_type: zone.surface_type,
      coat_count: zone.coat_count,
      type: zone.measurement_type,
      notes: zone.notes,
    })
    setDrawnPoints([])
    setIsDrawing(true)
  }

  const handlePointAdd = useCallback((pt) => {
    setDrawnPoints(prev => [...prev, pt])
  }, [])

  const handleZoneComplete = useCallback(async () => {
    if (!activeZoneMeta || drawnPoints.length < 1) return
    if (!pixelsPerFoot) {
      alert('Please set a scale before measuring.')
      return
    }

    const result = calculate(activeZoneMeta.type, drawnPoints, pixelsPerFoot)

    try {
      if (redrawingZoneId) {
        // Retrace — replace points and result on the existing zone record
        await redrawZone(redrawingZoneId, drawnPoints, result)
      } else {
        // New zone — include the current page so it stays on this page
        await saveZone({
          name: activeZoneMeta.name,
          description: activeZoneMeta.description,
          surface_type: activeZoneMeta.surface_type,
          coat_count: activeZoneMeta.coat_count,
          measurement_type: activeZoneMeta.type,
          points: drawnPoints,
          result,
          page_number: currentPage,
        })
      }
    } catch (err) {
      alert('Error saving zone: ' + err.message)
    }

    setIsDrawing(false)
    setActiveZoneMeta(null)
    setDrawnPoints([])
    setRedrawingZoneId(null)
  }, [activeZoneMeta, drawnPoints, pixelsPerFoot, saveZone, redrawZone, redrawingZoneId, currentPage])

  function handleCancelDrawing() {
    setIsDrawing(false)
    setActiveZoneMeta(null)
    setDrawnPoints([])
    setRedrawingZoneId(null)
  }

  async function handleUpdateZone(zoneId, updates) {
    try {
      await updateZone(zoneId, updates)
    } catch (err) {
      alert('Error updating zone: ' + err.message)
    }
  }

  async function handleDeleteZone(zoneId) {
    try {
      await deleteZone(zoneId)
    } catch (err) {
      alert('Error deleting zone: ' + err.message)
    }
  }

  function handleResetView() {
    blueprintCanvasRef.current?.resetView()
  }

  function handleExportCSV() {
    if (zones.length === 0) {
      alert('No zones to export yet.')
      return
    }
    exportCSV(session, zones)
  }

  // ── Loading / error screens ───────────────────────────────────────────────────

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner} /> Loading session…
      </div>
    )
  }

  if (error) {
    return (
      <div className={styles.loading}>
        <p>{error}</p>
        <button onClick={() => navigate('/dashboard')} className={styles.backBtn}>
          Back to Dashboard
        </button>
      </div>
    )
  }

  // ── Canvas props ──────────────────────────────────────────────────────────────

  // Color index for the active zone — preserves color during a redraw
  const redrawingZoneIndex = redrawingZoneId
    ? pageZones.findIndex(z => z.id === redrawingZoneId)
    : -1

  const activeZoneForCanvas = isDrawing
    ? {
        points: drawnPoints,
        measurement_type: activeZoneMeta?.type,
        colorIndex: redrawingZoneIndex >= 0 ? redrawingZoneIndex : pageZones.length,
        redrawingId: redrawingZoneId,
      }
    : null

  // For PDFs: pass the rendered data URL. For images: pass the storage URL directly.
  const canvasImageUrl = isPdf ? renderedPageUrl : blueprintUrl

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className={styles.layout}>
      {/* ── Sidebar ── */}
      <aside className={styles.sidebar}>

        {/* Header */}
        <div className={styles.sidebarHeader}>
          <Link to="/dashboard" className={styles.backLink}>← Dashboard</Link>
          <div className={styles.sessionInfo}>
            <div className={styles.sessionProject}>{session?.project_name}</div>
            <div className={styles.sessionClient}>{session?.client_name}</div>
          </div>
        </div>

        {/* Blueprint upload / replace */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Blueprint</div>
          {!blueprintUrl ? (
            <BlueprintUploader sessionId={sessionId} onUploaded={handleUploaded} />
          ) : (
            <div className={styles.blueprintLoaded}>
              <span className={styles.blueprintCheck}>✓</span> Blueprint loaded
              <button
                className={styles.replaceBtn}
                onClick={() => {
                  setBlueprintUrl(null)
                  setRenderedPageUrl(null)
                  setThumbnails({})
                  setCurrentPage(1)
                }}
              >
                Replace
              </button>
            </div>
          )}
        </div>

        {/* PDF page selector — only shown for multi-page PDFs */}
        {blueprintUrl && isPdf && pageCount > 1 && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>
              Pages ({pageCount})
            </div>
            <PdfPageSelector
              pageCount={pageCount}
              currentPage={currentPage}
              thumbnails={thumbnails}
              onPageSelect={handlePageSwitch}
            />
          </div>
        )}

        {/* Scale */}
        {blueprintUrl && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Scale</div>
            <ScalePanel
              pixelsPerFoot={pixelsPerFoot}
              onScaleChange={handleScaleChange}
              onStartCalibration={handleStartCalibration}
              calibrating={calibrating}
            />
          </div>
        )}

        {/* Summary totals — scoped to current page for PDFs */}
        {blueprintUrl && pageZones.length > 0 && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>
              {isPdf && pageCount > 1 ? `Page ${currentPage} Summary` : 'Summary'}
            </div>
            <SessionSummary zones={pageZones} />
          </div>
        )}

        {/* Add Zone */}
        {blueprintUrl && pixelsPerFoot && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>
              {isDrawing ? (redrawingZoneId ? 'Redrawing…' : 'Drawing…') : 'Add Zone'}
            </div>
            <ZoneDrawPanel
              onStart={handleStartDrawing}
              onCancel={handleCancelDrawing}
              isDrawing={isDrawing}
              pointCount={drawnPoints.length}
              onFinish={handleZoneComplete}
              drawingType={activeZoneMeta?.type}
            />
          </div>
        )}

        {/* Zone list — scoped to current page for PDFs */}
        {pageZones.length > 0 && (
          <div className={`${styles.section} ${styles.zoneListSection}`}>
            <div className={styles.sectionTitle}>
              Zones ({pageZones.length})
              {isPdf && pageCount > 1 && (
                <span className={styles.pageTag}> · Page {currentPage}</span>
              )}
            </div>
            <ZoneList
              zones={pageZones}
              onDelete={handleDeleteZone}
              onUpdate={handleUpdateZone}
              onRedraw={handleRedrawZone}
              redrawingZoneId={redrawingZoneId}
            />
          </div>
        )}

        {/* Export — always exports all zones across all pages */}
        {zones.length > 0 && (
          <div className={styles.section}>
            <button className={styles.exportBtn} onClick={handleExportCSV}>
              ↓ Export CSV
            </button>
          </div>
        )}

      </aside>

      {/* ── Canvas ── */}
      <main className={styles.canvasArea}>
        {blueprintUrl ? (
          <BlueprintCanvas
            ref={blueprintCanvasRef}
            imageUrl={canvasImageUrl}
            zones={pageZones}
            activeZone={activeZoneForCanvas}
            onPointAdd={handlePointAdd}
            onZoneComplete={handleZoneComplete}
            pixelsPerFoot={pixelsPerFoot}
            isDrawing={isDrawing}
            calibrating={calibrating}
            onCalibrationLine={handleCalibrationLine}
            redrawingZoneId={redrawingZoneId}
          />
        ) : (
          <div className={styles.emptyCanvas}>
            <div className={styles.emptyCanvasIcon}>📐</div>
            <p>Upload a blueprint to start measuring</p>
          </div>
        )}

        {/* Reset view button — always visible when a blueprint is loaded */}
        {blueprintUrl && (
          <button className={styles.resetViewBtn} onClick={handleResetView}>
            ⊡ Reset view
          </button>
        )}

        {/* PDF loading indicator */}
        {isPdf && pdfLoading && (
          <div className={styles.hint}>
            Loading PDF…
          </div>
        )}

        {/* Drawing hint */}
        {isDrawing && (
          <div className={styles.hint}>
            {activeZoneMeta?.type === 'count'
              ? 'Click each item to count it · Click Finish Zone when done'
              : redrawingZoneId
              ? 'Retrace the zone · Double-click or Finish Zone when done'
              : 'Click to place points · Double-click to finish'}
          </div>
        )}

        {calibrating && (
          <div className={styles.hint} style={{ background: 'rgba(245,158,11,0.15)', color: '#fbbf24' }}>
            Click two points that span your known distance
          </div>
        )}
      </main>
    </div>
  )
}
