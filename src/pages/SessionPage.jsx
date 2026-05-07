import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { useSession } from '../hooks/useSession'
import { usePdf } from '../hooks/usePdf'
import { SCALE_OPTIONS, calcPixelsPerFoot } from '../utils/scaleOptions'
import { parseFeetInches, formatSF, formatLF } from '../utils/fractions'
import { calculate, calculateSF, calculateCeilingSF, calculateWallSF, rescaleZone } from '../utils/measurements'
import { exportCSV } from '../utils/csvExport'
import { downloadPdfWithMeasurements } from '../utils/pdfExport'
import { detectScaleFromImage } from '../utils/detectScale'
import { evaluateZoneTest } from '../utils/testEvaluation'
import { getCompanyStorageUsage } from '../utils/storageUsage'
import BlueprintCanvas from '../components/canvas/BlueprintCanvas'
import BlueprintUploader from '../components/canvas/BlueprintUploader'
import Modal from '../components/ui/Modal'
import ScalePanel from '../components/canvas/ScalePanel'
import ScaleChangeDialog from '../components/canvas/ScaleChangeDialog'
import ZoneDrawPanel from '../components/zones/ZoneDrawPanel'
import ZoneList from '../components/zones/ZoneList'
import SessionSummary from '../components/zones/SessionSummary'
import PdfPageSelector from '../components/pdf/PdfPageSelector'
import PdfPageManager from '../components/pdf/PdfPageManager'
import UserMenu from '../components/UserMenu'
import styles from './SessionPage.module.css'

// SessionPage is the main working environment.
// Left sidebar: controls (scale, draw panel, zone list, export)
// Center: the blueprint canvas
const ADMIN_EMAIL = 'main@ngautomationhub.com'
const DEFAULT_TEST_INPUT = { segments: [], countVerified: null, notes: '' }

export default function SessionPage() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const isAdmin = user?.email === ADMIN_EMAIL
  const { session, zones, enabledFeatures, loading, error, saveZone, updateZone, updateZoneLabelOffset, redrawZone, deleteZone, updateSession, refetch } = useSession(sessionId)

  // ── Blueprint state ──────────────────────────────────────────────────────────
  const [blueprintUrl, setBlueprintUrl] = useState(null)
  const [blueprintType, setBlueprintType] = useState(null)
  const [replacingBlueprintType, setReplacingBlueprintType] = useState(null)
  const [showReplaceConfirm, setShowReplaceConfirm] = useState(false)
  const [replaceError, setReplaceError] = useState('')

  // ── PDF state ────────────────────────────────────────────────────────────────
  const isPdf = blueprintType === 'application/pdf'
  const { pageCount, pdfLoading, renderPage, pdfPageInfo } = usePdf(isPdf ? blueprintUrl : null)
  // Actual render resolution from PDF metadata. Falls back to 96 for non-PDF images.
  const pixelsPerInch = (isPdf && pdfPageInfo?.pixelsPerInch) ? pdfPageInfo.pixelsPerInch : 96

  const [currentPage, setCurrentPage] = useState(1)
  const [renderedPageUrl, setRenderedPageUrl] = useState(null)
  const [thumbnails, setThumbnails] = useState({}) // { [pageNum]: dataUrl }

  // ── Scale state ──────────────────────────────────────────────────────────────
  // pageScales: { [pageNumber]: pixelsPerFoot } — each PDF page has its own scale.
  // pixelsPerFoot is derived from the current page's entry (null if not yet set).
  const [pageScales, setPageScales] = useState({})
  const pixelsPerFoot = pageScales[currentPage] ?? null
  const [calibrating, setCalibrating] = useState(false)
  const [pendingCalibFeet, setPendingCalibFeet] = useState(null)

  // ── Canvas ref (used for resetView) ─────────────────────────────────────────
  const blueprintCanvasRef = useRef(null)

  // ── Drawing state ────────────────────────────────────────────────────────────
  const [isDrawing, setIsDrawing] = useState(false)
  const [activeZoneMeta, setActiveZoneMeta] = useState(null)
  const [drawnPoints, setDrawnPoints] = useState([])
  const [redrawingZoneId, setRedrawingZoneId] = useState(null)

  // ── Multi-segment accumulation (LF and count zones only) ─────────────────────
  // After finishing each segment the user can add more disconnected segments that
  // accumulate into one zone total before saving.
  const [finishedSegments, setFinishedSegments] = useState([]) // [{ points: [] }]
  const [isAccumulating, setIsAccumulating] = useState(false)

  // ── Zone visibility (hide/show layers on canvas) ──────────────────────────────
  const [hiddenZoneIds, setHiddenZoneIds] = useState(new Set())

  // ── AI scale detection ────────────────────────────────────────────────────────
  // pendingScaleDetection is set to true when a new blueprint is uploaded (not on
  // session restore) so the detection only fires on fresh uploads.
  const [pendingScaleDetection, setPendingScaleDetection] = useState(false)
  const [detectingScale, setDetectingScale] = useState(false)
  const [scaleDetectionBanner, setScaleDetectionBanner] = useState(null) // { label }

  // ── PDF download state ────────────────────────────────────────────────────────
  const [downloadingPdf, setDownloadingPdf] = useState(false)

  // ── Test mode (super admin only) ────────────────────────────────────────────
  const [isTestMode, setIsTestMode] = useState(false)
  const [testData, setTestData] = useState({}) // { [zoneId]: { width, depth, statedValue, useDimensions, countVerified, notes } }
  const [savingTests, setSavingTests] = useState(false)

  // ── Calibration suggestion (all users) ──────────────────────────────────────
  // Fires when 3 consecutive test FAIL results are logged, or when 3+ soft
  // warnings are showing across zones. Visible to all users, not just admin.
  const [consecutiveFailCount, setConsecutiveFailCount] = useState(0)
  const [calibBannerInput, setCalibBannerInput] = useState('')

  // ── Page metadata (naming + soft-delete) ─────────────────────────────────────
  const [pageMetadata, setPageMetadata] = useState({})
  const [showPageManager, setShowPageManager] = useState(false)
  const [pendingPageManager, setPendingPageManager] = useState(false)

  // ── Save status ─────────────────────────────────────────────────────────────
  const [lastSavedAt, setLastSavedAt] = useState(null)
  const [manualSaving, setManualSaving] = useState(false)

  // ── Scale change rescale prompt ───────────────────────────────────────────────
  const [pendingScaleChange, setPendingScaleChange] = useState(null) // { oldPPF, newPPF }
  const [rescaleToast, setRescaleToast] = useState('')

  // ── Summary collapsed state (persists via localStorage) ─────────────────────
  const [summaryCollapsed, setSummaryCollapsed] = useState(() => localStorage.getItem('bm_summary_collapsed') === 'true')
  function toggleSummaryCollapsed() {
    setSummaryCollapsed(v => { const next = !v; localStorage.setItem('bm_summary_collapsed', String(next)); return next })
  }

  // ── Ortho mode (persists via localStorage) ───────────────────────────────────
  const [orthoMode, setOrthoMode] = useState(() => localStorage.getItem('bm_ortho_mode') === 'true')
  function toggleOrtho() {
    setOrthoMode(v => { const next = !v; localStorage.setItem('bm_ortho_mode', String(next)); return next })
  }

  // Keyboard shortcut "O" for ortho toggle (only when not in an input)
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'o' || e.key === 'O') {
        const tag = document.activeElement?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
        toggleOrtho()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ── Pixel sanity check (all users, all tiers) ────────────────────────────────
  // After any scale change, checks if the drawing dimensions are reasonable.
  // null = no check run yet, object = check result.
  const [scaleSanity, setScaleSanity] = useState(null) // { widthFt, heightFt, passes, source }
  // source: 'dropdown' | 'calibration' | 'ai'

  // ── Session restore ──────────────────────────────────────────────────────────
  // Runs when Supabase returns the session — restores blueprint URL and saved page.
  useEffect(() => {
    if (session?.blueprint_url && !blueprintUrl) {
      // Fall back to URL extension if blueprint_type wasn't saved (older sessions)
      let type = session.blueprint_type
      if (!type) {
        const lower = session.blueprint_url.toLowerCase()
        if (lower.includes('.pdf')) type = 'application/pdf'
        else if (lower.includes('.png')) type = 'image/png'
        else type = 'image/jpeg'
      }
      setBlueprintUrl(session.blueprint_url)
      setBlueprintType(type)
      setCurrentPage(session.page_number ?? 1)
      // Restore per-page scales saved in a previous session
      if (session.page_scales && Object.keys(session.page_scales).length > 0) {
        setPageScales(session.page_scales)
      }
      // Restore page metadata (names + hidden flags)
      if (session.page_metadata && Object.keys(session.page_metadata).length > 0) {
        setPageMetadata(session.page_metadata)
      }
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

  // ── Auto-open page manager after fresh PDF upload ────────────────────────────
  useEffect(() => {
    if (pendingPageManager && pageCount > 0) {
      setShowPageManager(true)
      setPendingPageManager(false)
    }
  }, [pendingPageManager, pageCount])

  // Helper: get count of visible (non-hidden) pages
  const visiblePageCount = isPdf && pageCount > 0
    ? Array.from({ length: pageCount }, (_, i) => i + 1).filter(
        p => !pageMetadata[String(p)]?.hidden
      ).length
    : pageCount

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
    setReplacingBlueprintType(null)
    // Reset PDF state for the newly uploaded file
    setCurrentPage(1)
    setRenderedPageUrl(null)
    setThumbnails({})
    setPageMetadata({})
    // For PDFs, open the page manager after thumbnails load so user can name/hide pages
    if (type === 'application/pdf') {
      // We'll show the manager once pageCount is available (useEffect below)
      setPendingPageManager(true)
    }
    // Trigger AI scale detection for eligible plans
    if (enabledFeatures?.ai_scale_detection) {
      setPendingScaleDetection(true)
      setScaleDetectionBanner(null)
    }
  }

  // Save page metadata (names + hidden flags) to the session record
  async function handleSavePageMetadata(metadata) {
    setPageMetadata(metadata)
    setShowPageManager(false)
    try {
      await updateSession({ page_metadata: metadata })
      setLastSavedAt(new Date())
      // If current page is now hidden, jump to the first visible page
      if (metadata[String(currentPage)]?.hidden) {
        for (let i = 1; i <= pageCount; i++) {
          if (!metadata[String(i)]?.hidden) {
            setCurrentPage(i)
            break
          }
        }
      }
    } catch (err) {
      console.error('Failed to save page metadata:', err)
    }
  }

  // Save a new scale for the current page and persist it to the database.
  async function applyScaleChange(ppf) {
    const newScales = { ...pageScales, [currentPage]: ppf }
    setPageScales(newScales)
    runScaleSanityCheck(ppf, 'dropdown')
    try {
      await updateSession({ page_scales: newScales })
      setLastSavedAt(new Date())
    } catch (err) {
      console.error('Failed to save page scale:', err)
    }
  }

  function findScaleLabel(ppf) {
    if (!ppf) return 'Custom scale'
    const match = SCALE_OPTIONS.find(o =>
      o.inchesPerFoot &&
      Math.abs(calcPixelsPerFoot(o.inchesPerFoot, pixelsPerInch) - ppf) < 0.5
    )
    return match?.label ?? 'Custom scale'
  }

  // Rescale all zones on the current page using the given pixelsPerFoot
  async function rescaleZonesOnCurrentPage(newPPF) {
    const zonesOnPage = zones.filter(z => (z.page_number ?? 1) === currentPage)
    if (zonesOnPage.length === 0) return 0
    let count = 0
    const updates = zonesOnPage
      .filter(z => z.measurement_type !== 'count')
      .map(z => {
        const rescaled = rescaleZone(z, newPPF)
        if (rescaled.result === z.result) return null
        count++
        return { id: z.id, result: rescaled.result, gross_wall_sf: rescaled.gross_wall_sf, net_wall_sf: rescaled.net_wall_sf }
      })
      .filter(Boolean)

    await Promise.all(updates.map(u =>
      supabase.from('zones').update({ result: u.result, gross_wall_sf: u.gross_wall_sf ?? null, net_wall_sf: u.net_wall_sf ?? null }).eq('id', u.id)
    ))

    // Refresh zones from DB to get accurate state
    await refetch()
    setLastSavedAt(new Date())
    return count
  }

  // Intercept scale changes to prompt for zone rescale when zones exist
  function handleScaleChange(ppf) {
    const oldPPF = pageScales[currentPage]
    const zonesOnPage = zones.filter(z => (z.page_number ?? 1) === currentPage)

    // First scale set, no zones, or negligible change — apply immediately
    if (!oldPPF || zonesOnPage.length === 0 || Math.abs(oldPPF - ppf) < 0.5) {
      applyScaleChange(ppf)
      return
    }

    // Zones exist and scale is changing — show prompt
    setPendingScaleChange({
      oldPPF, newPPF: ppf, zoneCount: zonesOnPage.length,
      oldLabel: findScaleLabel(oldPPF),
      newLabel: findScaleLabel(ppf),
    })
  }

  // Pixel sanity check — pure math, no API calls.
  // Computes the drawing dimensions in feet at the given scale and checks
  // if they fall within a reasonable range for an architectural drawing.
  function runScaleSanityCheck(ppf, source) {
    const dims = blueprintCanvasRef.current?.getImageDimensions()
    if (!dims || !ppf) { setScaleSanity(null); return null }
    const widthFt  = Math.round(dims.width  / ppf * 10) / 10
    const heightFt = Math.round(dims.height / ppf * 10) / 10
    const passes = widthFt >= 5 && widthFt <= 500 && heightFt >= 5 && heightFt <= 500
    const result = { widthFt, heightFt, passes, source }
    setScaleSanity(result)
    return result
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
    handleScaleChange(ppf)
    setCalibrating(false)
    setPendingCalibFeet(null)
    // Successful recalibration dismisses the calibration banner
    setConsecutiveFailCount(0)
    setCalibBannerInput('')
    // Run sanity check immediately after calibration
    runScaleSanityCheck(ppf, 'calibration')
  }

  // Switch to a different PDF page. Warns and cancels any active zone drawing.
  async function handlePageSwitch(pageNum) {
    if (pageNum === currentPage) return
    if (isDrawing || isAccumulating) {
      const confirmed = window.confirm(
        'You have an active zone in progress. Switch pages and discard it?'
      )
      if (!confirmed) return
      // Cancel the in-progress zone before switching
      setIsDrawing(false)
      setIsAccumulating(false)
      setFinishedSegments([])
      setActiveZoneMeta(null)
      setDrawnPoints([])
      setRedrawingZoneId(null)
    }
    setCurrentPage(pageNum)
    // Reset sanity check for the new page
    setScaleSanity(null)
    // Persist so the session reopens on the right page
    try {
      await updateSession({ page_number: pageNum })
    } catch (err) {
      console.error('Failed to save page number:', err)
    }
  }

  function handleStartDrawing({ name, description, surface_type, coat_count, type,
    ceiling_type, ceiling_peak_height, ceiling_wall_height,
    ceiling_tray_perimeter, ceiling_drop_depth,
    ceiling_low_wall_height, ceiling_high_wall_height, color,
    wall_height, opening_deductions }) {
    setActiveZoneMeta({
      name, description, surface_type, coat_count, type,
      ceiling_type: ceiling_type ?? null,
      ceiling_peak_height:    ceiling_peak_height    ?? null,
      ceiling_wall_height:    ceiling_wall_height    ?? null,
      ceiling_tray_perimeter: ceiling_tray_perimeter ?? null,
      ceiling_drop_depth:     ceiling_drop_depth     ?? null,
      ceiling_low_wall_height:  ceiling_low_wall_height  ?? null,
      ceiling_high_wall_height: ceiling_high_wall_height ?? null,
      color: color ?? null,
      wall_height: wall_height ?? null,
      opening_deductions: opening_deductions ?? null,
    })
    setFinishedSegments([])
    setIsAccumulating(false)
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
      ceiling_type: zone.ceiling_type ?? null,
      ceiling_peak_height:    zone.ceiling_peak_height    ?? null,
      ceiling_wall_height:    zone.ceiling_wall_height    ?? null,
      ceiling_tray_perimeter: zone.ceiling_tray_perimeter ?? null,
      ceiling_drop_depth:     zone.ceiling_drop_depth     ?? null,
      ceiling_low_wall_height:  zone.ceiling_low_wall_height  ?? null,
      ceiling_high_wall_height: zone.ceiling_high_wall_height ?? null,
      color: zone.color ?? null,
      wall_height: zone.wall_height ?? null,
      opening_deductions: zone.opening_deductions ?? null,
    })
    setFinishedSegments([])
    setIsAccumulating(false)
    setDrawnPoints([])
    setIsDrawing(true)
  }

  const handlePointAdd = useCallback((pt) => {
    setDrawnPoints(prev => [...prev, pt])
  }, [])

  function handleUndoPoint() {
    setDrawnPoints(prev => prev.slice(0, -1))
  }

  // Keyboard shortcuts active while drawing:
  //   U  or  Ctrl/Cmd+Z  — remove the last placed point
  useEffect(() => {
    function onKeyDown(e) {
      if (!isDrawing) return
      const isUndo = e.key === 'u' || e.key === 'U' ||
        (e.key === 'z' && (e.ctrlKey || e.metaKey))
      if (isUndo) {
        e.preventDefault()
        setDrawnPoints(prev => prev.slice(0, -1))
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isDrawing])

  const handleZoneComplete = useCallback(async () => {
    if (!activeZoneMeta || drawnPoints.length < 1) return
    if (!pixelsPerFoot) {
      alert('Please set a scale before measuring.')
      return
    }

    // LF and count zones enter accumulation mode: the finished segment is added
    // to the running list and the user can trace additional disconnected segments
    // before clicking "Done — Save Zone" to finalise.
    if (activeZoneMeta.type === 'LF' || activeZoneMeta.type === 'count') {
      setFinishedSegments(prev => [...prev, { points: drawnPoints }])
      setDrawnPoints([])
      setIsDrawing(false)
      setIsAccumulating(true)
      return
    }

    // SF zones: save immediately (single polygon only)
    let result = calculate(activeZoneMeta.type, drawnPoints, pixelsPerFoot)

    if (activeZoneMeta.surface_type === 'Ceiling' &&
        activeZoneMeta.ceiling_type && activeZoneMeta.ceiling_type !== 'flat') {
      const { adjustedSF } = calculateCeilingSF(result, activeZoneMeta.ceiling_type, {
        pitchRise:     parseInt(activeZoneMeta.ceiling_pitch_rise)       || 0,
        peakHeight:    parseFloat(activeZoneMeta.ceiling_peak_height)    || 0,
        wallHeight:    parseFloat(activeZoneMeta.ceiling_wall_height)    || 0,
        trayPerimeter: parseFloat(activeZoneMeta.ceiling_tray_perimeter) || 0,
        dropDepth:     parseFloat(activeZoneMeta.ceiling_drop_depth)     || 0,
        lowWallHeight:  parseFloat(activeZoneMeta.ceiling_low_wall_height)  || 0,
        highWallHeight: parseFloat(activeZoneMeta.ceiling_high_wall_height) || 0,
      }, drawnPoints, pixelsPerFoot)
      result = adjustedSF
    }

    // Wall mode: replace result with net wall SF when wall height is provided
    let wallData = {}
    if (activeZoneMeta.surface_type === 'Wall' && activeZoneMeta.wall_height) {
      const w = calculateWallSF(drawnPoints, pixelsPerFoot,
        activeZoneMeta.wall_height, activeZoneMeta.opening_deductions)
      result = w.netWallSF
      wallData = { gross_wall_sf: w.grossWallSF, net_wall_sf: w.netWallSF }
    }

    try {
      if (redrawingZoneId) {
        await redrawZone(redrawingZoneId, drawnPoints, result)
      } else {
        await saveZone({
          name: activeZoneMeta.name,
          description: activeZoneMeta.description,
          surface_type: activeZoneMeta.surface_type,
          coat_count: activeZoneMeta.coat_count,
          ceiling_type: activeZoneMeta.ceiling_type ?? null,
          ceiling_peak_height:    activeZoneMeta.ceiling_peak_height    ?? null,
          ceiling_wall_height:    activeZoneMeta.ceiling_wall_height    ?? null,
          ceiling_tray_perimeter: activeZoneMeta.ceiling_tray_perimeter ?? null,
          ceiling_drop_depth:     activeZoneMeta.ceiling_drop_depth     ?? null,
          ceiling_low_wall_height:  activeZoneMeta.ceiling_low_wall_height  ?? null,
          ceiling_high_wall_height: activeZoneMeta.ceiling_high_wall_height ?? null,
          ceiling_pitch_rise:       activeZoneMeta.ceiling_pitch_rise       ?? null,
          color: activeZoneMeta.color ?? null,
          wall_height: activeZoneMeta.wall_height ?? null,
          opening_deductions: activeZoneMeta.opening_deductions ?? null,
          ...wallData,
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

  // Start drawing the next disconnected segment within the same zone.
  function handleAddSegment() {
    setDrawnPoints([])
    setIsDrawing(true)
  }

  // Combine all finished segments (+ any current in-progress points) into one
  // zone record and save it. Called when the user clicks "Done — Save Zone".
  const handleFinalizeZone = useCallback(async () => {
    if (!activeZoneMeta) return
    if (!pixelsPerFoot) {
      alert('Please set a scale before measuring.')
      return
    }

    // Include any in-progress points as a final segment
    const allSegments = drawnPoints.length > 0
      ? [...finishedSegments, { points: drawnPoints }]
      : finishedSegments

    if (allSegments.length === 0) return

    // Build flat points array with null sentinels between segments
    const combinedPoints = []
    allSegments.forEach((seg, i) => {
      if (i > 0) combinedPoints.push(null)
      combinedPoints.push(...seg.points)
    })

    const result = calculate(activeZoneMeta.type, combinedPoints, pixelsPerFoot)

    try {
      if (redrawingZoneId) {
        await redrawZone(redrawingZoneId, combinedPoints, result)
      } else {
        await saveZone({
          name: activeZoneMeta.name,
          description: activeZoneMeta.description,
          surface_type: activeZoneMeta.surface_type,
          coat_count: activeZoneMeta.coat_count,
          ceiling_type: activeZoneMeta.ceiling_type ?? null,
          ceiling_peak_height:    activeZoneMeta.ceiling_peak_height    ?? null,
          ceiling_wall_height:    activeZoneMeta.ceiling_wall_height    ?? null,
          ceiling_tray_perimeter: activeZoneMeta.ceiling_tray_perimeter ?? null,
          ceiling_drop_depth:     activeZoneMeta.ceiling_drop_depth     ?? null,
          ceiling_low_wall_height:  activeZoneMeta.ceiling_low_wall_height  ?? null,
          ceiling_high_wall_height: activeZoneMeta.ceiling_high_wall_height ?? null,
          ceiling_pitch_rise:       activeZoneMeta.ceiling_pitch_rise       ?? null,
          color: activeZoneMeta.color ?? null,
          measurement_type: activeZoneMeta.type,
          points: combinedPoints,
          result,
          page_number: currentPage,
        })
      }
    } catch (err) {
      alert('Error saving zone: ' + err.message)
      return
    }

    setIsDrawing(false)
    setIsAccumulating(false)
    setFinishedSegments([])
    setActiveZoneMeta(null)
    setDrawnPoints([])
    setRedrawingZoneId(null)
  }, [activeZoneMeta, finishedSegments, drawnPoints, pixelsPerFoot, saveZone, redrawZone, redrawingZoneId, currentPage])

  function handleCancelDrawing() {
    setIsDrawing(false)
    setIsAccumulating(false)
    setFinishedSegments([])
    setActiveZoneMeta(null)
    setDrawnPoints([])
    setRedrawingZoneId(null)
  }

  function handleToggleZoneVisibility(zoneId) {
    setHiddenZoneIds(prev => {
      const next = new Set(prev)
      if (next.has(zoneId)) next.delete(zoneId)
      else next.add(zoneId)
      return next
    })
  }

  async function handleUpdateZone(zoneId, updates) {
    try {
      let finalUpdates = { ...updates }
      const zone = zones.find(z => z.id === zoneId)

      // Only recalculate the stored result when ceiling-specific fields actually
      // changed. Editing name, notes, or coat_count should never silently alter
      // the measurement result.
      if (zone && pixelsPerFoot && zone.points && zone.measurement_type === 'SF') {
        const ceilingParamsChanged =
          updates.surface_type       !== zone.surface_type ||
          updates.ceiling_type       !== zone.ceiling_type ||
          updates.ceiling_peak_height    !== zone.ceiling_peak_height ||
          updates.ceiling_wall_height    !== zone.ceiling_wall_height ||
          updates.ceiling_tray_perimeter !== zone.ceiling_tray_perimeter ||
          updates.ceiling_drop_depth     !== zone.ceiling_drop_depth ||
          updates.ceiling_low_wall_height  !== zone.ceiling_low_wall_height ||
          updates.ceiling_high_wall_height !== zone.ceiling_high_wall_height ||
          updates.ceiling_pitch_rise       !== zone.ceiling_pitch_rise

        if (ceilingParamsChanged) {
          if (updates.surface_type === 'Ceiling' && updates.ceiling_type && updates.ceiling_type !== 'flat') {
            const baseSF = calculateSF(zone.points, pixelsPerFoot)
            const { adjustedSF } = calculateCeilingSF(baseSF, updates.ceiling_type, {
              pitchRise:     parseInt(updates.ceiling_pitch_rise)       || 0,
              peakHeight:    parseFloat(updates.ceiling_peak_height)    || 0,
              wallHeight:    parseFloat(updates.ceiling_wall_height)    || 0,
              trayPerimeter: parseFloat(updates.ceiling_tray_perimeter) || 0,
              dropDepth:     parseFloat(updates.ceiling_drop_depth)     || 0,
              lowWallHeight:  parseFloat(updates.ceiling_low_wall_height)  || 0,
              highWallHeight: parseFloat(updates.ceiling_high_wall_height) || 0,
            }, zone.points, pixelsPerFoot)
            finalUpdates.result = adjustedSF
          } else if (updates.surface_type !== 'Ceiling' || updates.ceiling_type === 'flat') {
            // Switched away from a ceiling adjustment — restore the flat SF
            finalUpdates.result = calculateSF(zone.points, pixelsPerFoot)
          }
        }

        // Wall recalculation: check if wall params changed
        const wallParamsChanged =
          updates.wall_height !== zone.wall_height ||
          JSON.stringify(updates.opening_deductions) !== JSON.stringify(zone.opening_deductions) ||
          updates.surface_type !== zone.surface_type

        if (wallParamsChanged) {
          if (updates.surface_type === 'Wall' && updates.wall_height) {
            const w = calculateWallSF(zone.points, pixelsPerFoot,
              updates.wall_height, updates.opening_deductions)
            finalUpdates.result = w.netWallSF
            finalUpdates.gross_wall_sf = w.grossWallSF
            finalUpdates.net_wall_sf = w.netWallSF
          } else if (zone.wall_height && updates.surface_type !== 'Wall') {
            // Switched away from wall mode — restore floor SF
            finalUpdates.result = calculateSF(zone.points, pixelsPerFoot)
            finalUpdates.gross_wall_sf = null
            finalUpdates.net_wall_sf = null
          }
        }
      }

      await updateZone(zoneId, finalUpdates)
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

  async function handleLabelOffsetChange(zoneId, offsetX, offsetY) {
    try {
      await updateZoneLabelOffset(zoneId, offsetX, offsetY)
    } catch (err) {
      console.error('Failed to save label position:', err)
    }
  }

  function handleExportCSV() {
    if (zones.length === 0) {
      alert('No zones to export yet.')
      return
    }
    exportCSV(session, zones, enabledFeatures)
  }

  async function handleManualSave() {
    setManualSaving(true)
    try {
      await updateSession({ page_scales: pageScales, page_number: currentPage })
      setLastSavedAt(new Date())
    } catch (err) {
      alert('Save failed — ' + err.message)
    } finally {
      setManualSaving(false)
    }
  }

  // ── Test mode handlers ────────────────────────────────────────────────────────

  function handleTestDataChange(zoneId, updates) {
    setTestData(prev => ({
      ...prev,
      [zoneId]: { ...(prev[zoneId] ?? DEFAULT_TEST_INPUT), ...updates },
    }))
  }

  async function handleLogTest(zone) {
    const input = testData[zone.id]
    const ev = evaluateZoneTest(zone, input, pixelsPerFoot)
    if (!ev.verdict) return false

    const segs = input?.segments ?? []
    const hasSegments = segs.length > 0
    const type = zone.measurement_type

    // For single W×D segment, populate legacy width/depth fields
    let statedWidth = null, statedDepth = null
    if (type === 'SF' && segs.length === 1 && segs[0].mode !== 'direct') {
      statedWidth = parseFeetInches(segs[0].width)
      statedDepth = parseFeetInches(segs[0].depth)
    }

    // Build segments payload for jsonb column
    let segmentsPayload = null
    if (hasSegments) {
      segmentsPayload = segs.map(s => {
        if (type === 'SF') {
          const w = parseFeetInches(s.width)
          const d = parseFeetInches(s.depth)
          return {
            label: s.label || null,
            mode: s.mode === 'direct' ? 'direct' : 'wd',
            width: s.mode !== 'direct' ? w : null,
            depth: s.mode !== 'direct' ? d : null,
            sf: s.mode === 'direct' ? (parseFloat(s.sf) || 0) : Math.round((w || 0) * (d || 0) * 100) / 100,
          }
        }
        return { label: s.label || null, lf: parseFeetInches(s.lf) ?? 0 }
      })
    }

    const payload = {
      session_id: sessionId,
      zone_id: zone.id,
      user_id: user.id,
      zone_name: zone.name,
      measurement_type: type,
      stated_width: statedWidth,
      stated_depth: statedDepth,
      stated_sf: type === 'SF' ? ev.stated : null,
      stated_lf: type === 'LF' ? ev.stated : null,
      stated_segments: segmentsPayload,
      measured_value: zone.result ?? 0,
      variance: ev.variance ?? 0,
      variance_pct: ev.variancePct ?? 0,
      verdict: ev.verdict,
      error_code: ev.errorCode ?? null,
      error_message: ev.errorMessage ?? null,
      notes: input?.notes || null,
    }

    const { error: err } = await supabase.from('session_test_logs').insert(payload)
    if (err) { alert('Failed to log test: ' + err.message); return false }

    // Track consecutive fails for the calibration suggestion banner
    if (ev.verdict === 'FAIL') {
      setConsecutiveFailCount(prev => prev + 1)
    } else {
      setConsecutiveFailCount(0)
    }

    return true
  }

  async function handleSaveAllTests() {
    setSavingTests(true)
    let saved = 0
    for (const zone of pageZones) {
      const ev = evaluateZoneTest(zone, testData[zone.id], pixelsPerFoot)
      if (ev.verdict) {
        const ok = await handleLogTest(zone)
        if (ok) saved++
      }
    }
    setSavingTests(false)
    if (saved > 0) alert(`${saved} test result${saved > 1 ? 's' : ''} logged.`)
  }

  // Computed test summary
  const testSummary = useMemo(() => {
    let pass = 0, fail = 0, total = 0
    for (const zone of pageZones) {
      const ev = evaluateZoneTest(zone, testData[zone.id], pixelsPerFoot)
      if (ev.verdict) { total++; if (ev.verdict === 'PASS') pass++; else fail++ }
    }
    return { total, pass, fail, verdict: fail > 0 ? 'INACCURATE' : total > 0 ? 'ACCURATE' : null }
  }, [pageZones, testData, pixelsPerFoot])

  // ── AI scale detection ────────────────────────────────────────────────────────
  // Runs after a new blueprint upload when the feature flag is enabled.
  // For PDFs it waits for the first page to finish rendering before calling the API.
  useEffect(() => {
    if (!pendingScaleDetection) return
    if (!blueprintUrl) return

    const isPdfBlueprint = blueprintType === 'application/pdf'

    // For PDFs, wait until the first page has been rendered to a data URL
    if (isPdfBlueprint && !renderedPageUrl) return

    async function run() {
      setDetectingScale(true)
      setPendingScaleDetection(false)
      try {
        // For PDFs, render at 2x for the AI (faster than 3x, sufficient for title block)
        const imageUrl = isPdfBlueprint ? await renderPage(1, 2.0) : blueprintUrl
        const result = await detectScaleFromImage(imageUrl)
        if (result?.inchesPerFoot) {
          const ppf = calcPixelsPerFoot(result.inchesPerFoot, pixelsPerInch)
          await handleScaleChange(ppf)
          setScaleDetectionBanner({ label: result.label })
        }
      } catch (err) {
        console.error('Scale detection error:', err)
      } finally {
        setDetectingScale(false)
      }
    }
    run()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingScaleDetection, renderedPageUrl, blueprintUrl, blueprintType])

  // ── Download handlers ─────────────────────────────────────────────────────────

  // Download the original blueprint file (fetched as blob to work cross-origin)
  async function handleDownloadClean() {
    if (!blueprintUrl) return
    try {
      const resp = await fetch(blueprintUrl)
      const blob = await resp.blob()
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      const ext = blueprintType === 'application/pdf' ? 'pdf'
        : blueprintType === 'image/png' ? 'png' : 'jpg'
      a.download = `${(session?.project_name || 'blueprint').replace(/[^a-z0-9_-]/gi, '_')}.${ext}`
      a.click()
      URL.revokeObjectURL(blobUrl)
    } catch (err) {
      alert('Download failed: ' + err.message)
    }
  }

  // Generate a PDF with zone overlays drawn over each blueprint page
  async function handleDownloadWithMeasurements() {
    if (!blueprintUrl || zones.length === 0) return
    setDownloadingPdf(true)
    try {
      await downloadPdfWithMeasurements({
        session,
        zones,
        renderPage,
        pageCount,
        isPdf,
        blueprintUrl,
      })
    } catch (err) {
      alert('PDF export failed: ' + err.message)
    } finally {
      setDownloadingPdf(false)
    }
  }

  // ── Manual AI scale detection (triggered by the Detect Scale button) ────────
  // Renders at 2x (fast, sufficient for title block text), detects scale, then
  // runs the pixel sanity check to confirm the detected value makes sense.
  async function handleDetectScale() {
    if (!blueprintUrl) return
    const isPdfBlueprint = blueprintType === 'application/pdf'

    let imageUrl
    if (isPdfBlueprint) {
      imageUrl = await renderPage(currentPage, 2.0)
    } else {
      imageUrl = blueprintUrl
    }
    if (!imageUrl) return

    try {
      const result = await detectScaleFromImage(imageUrl)
      if (result?.inchesPerFoot) {
        const ppf = calcPixelsPerFoot(result.inchesPerFoot, pixelsPerInch)
        await handleScaleChange(ppf)
        // Run sanity check and set banner based on result
        const sanity = runScaleSanityCheck(ppf, 'ai')
        if (sanity?.passes) {
          setScaleDetectionBanner({ label: result.label, verified: true })
        } else {
          setScaleDetectionBanner({ label: result.label, verified: false })
        }
      } else {
        alert('Could not detect a scale on this page. Try a page with a visible title block, or set the scale manually.')
      }
    } catch (err) {
      console.error('Scale detection error:', err)
      alert('Scale detection failed: ' + err.message)
    }
  }

  // ── Ceiling SF preview ────────────────────────────────────────────────────────
  // Computed in real-time as the contractor places points while drawing a ceiling
  // zone with a non-flat ceiling type. Passed to ZoneDrawPanel for display.
  // Must stay here (before the early returns) so hook call order is always stable.
  const sfPreview = useMemo(() => {
    if (!isDrawing || !activeZoneMeta ||
        activeZoneMeta.surface_type !== 'Ceiling' ||
        !activeZoneMeta.ceiling_type || activeZoneMeta.ceiling_type === 'flat' ||
        drawnPoints.length < 3 || !pixelsPerFoot) {
      return null
    }
    const flat = calculateSF(drawnPoints, pixelsPerFoot)
    const { adjustedSF, adjustment } = calculateCeilingSF(flat, activeZoneMeta.ceiling_type, {
      pitchRise:     parseInt(activeZoneMeta.ceiling_pitch_rise)       || 0,
      peakHeight:    parseFloat(activeZoneMeta.ceiling_peak_height)    || 0,
      wallHeight:    parseFloat(activeZoneMeta.ceiling_wall_height)    || 0,
      trayPerimeter: parseFloat(activeZoneMeta.ceiling_tray_perimeter) || 0,
      dropDepth:     parseFloat(activeZoneMeta.ceiling_drop_depth)     || 0,
      lowWallHeight:  parseFloat(activeZoneMeta.ceiling_low_wall_height)  || 0,
      highWallHeight: parseFloat(activeZoneMeta.ceiling_high_wall_height) || 0,
    }, drawnPoints, pixelsPerFoot)
    return { flat, adjusted: adjustedSF, adjustment }
  }, [isDrawing, activeZoneMeta, drawnPoints, pixelsPerFoot])

  // ── Wall SF preview ──────────────────────────────────────────────────────────
  // Live wall calculation shown while drawing a Wall/SF zone with height entered.
  const wallPreview = useMemo(() => {
    if (!isDrawing || !activeZoneMeta ||
        activeZoneMeta.surface_type !== 'Wall' || activeZoneMeta.type !== 'SF' ||
        !activeZoneMeta.wall_height || drawnPoints.length < 3 || !pixelsPerFoot) {
      return null
    }
    const floorSF = calculateSF(drawnPoints, pixelsPerFoot)
    const w = calculateWallSF(drawnPoints, pixelsPerFoot,
      activeZoneMeta.wall_height, activeZoneMeta.opening_deductions)
    return { floorSF, ...w }
  }, [isDrawing, activeZoneMeta, drawnPoints, pixelsPerFoot])

  // ── Soft warning count (all users) ────────────────────────────────────────────
  // Counts zones with implausibly small results that suggest a miscalibrated scale.
  const softWarningCount = useMemo(() => {
    let count = 0
    for (const zone of pageZones) {
      const r = zone.result ?? 0
      const pts = zone.points?.filter(p => p !== null && p !== undefined) ?? []
      if (zone.measurement_type === 'SF' && r > 0 && r < 10) { count++; continue }
      if (zone.measurement_type === 'LF' && r > 0 && r < 1) { count++; continue }
      if (zone.measurement_type === 'SF' && pts.length > 4 && r > 0 && r < 20) count++
    }
    return count
  }, [pageZones])

  // Show calibration banner when 3+ consecutive test fails OR 3+ soft warnings
  const showCalibBanner = consecutiveFailCount >= 3 || softWarningCount >= 3

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

  // Combine finished segments (null-separated) + current in-progress points into
  // one flat array so the canvas can render all segments simultaneously.
  const activeCanvasPoints = (() => {
    const pts = []
    finishedSegments.forEach((seg, i) => {
      if (i > 0) pts.push(null)
      pts.push(...seg.points)
    })
    if (drawnPoints.length > 0) {
      if (pts.length > 0) pts.push(null)
      pts.push(...drawnPoints)
    }
    return pts
  })()

  const activeZoneForCanvas = (isDrawing || isAccumulating)
    ? {
        points: activeCanvasPoints,
        measurement_type: activeZoneMeta?.type,
        color: activeZoneMeta?.color ?? null,
        colorIndex: redrawingZoneIndex >= 0 ? redrawingZoneIndex : pageZones.length,
        redrawingId: redrawingZoneId,
      }
    : null

  // Running total from all completed segments (for ZoneDrawPanel accumulation UI)
  const accumulatedResult = (() => {
    if (finishedSegments.length === 0 || !pixelsPerFoot || !activeZoneMeta) return 0
    const pts = []
    finishedSegments.forEach((seg, i) => {
      if (i > 0) pts.push(null)
      pts.push(...seg.points)
    })
    return calculate(activeZoneMeta.type, pts, pixelsPerFoot) ?? 0
  })()

  // For PDFs: pass the rendered data URL. For images: pass the storage URL directly.
  const canvasImageUrl = isPdf ? renderedPageUrl : blueprintUrl

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className={styles.layout}>
      {/* ── Sidebar ── */}
      <aside className={`${styles.sidebar} ${isTestMode ? styles.sidebarTestMode : ''}`}>

        {/* Print-only report header */}
        <div className={styles.printReportHeader}>
          <h1>BlueprintMeasure — Test Report</h1>
          <div>Project: {session?.project_name} | Client: {session?.client_name}</div>
          <div>Tester: {user?.email} | Date: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
        </div>

        {/* Header */}
        <div className={styles.sidebarHeader}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className={styles.backLink} style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 12 }}>
              <Link to="/dashboard" style={{ color: 'var(--color-text-muted)', textDecoration: 'none' }}>Dashboard</Link>
              {session?.project_id && (
                <>
                  <span style={{ color: 'var(--color-text-muted)', opacity: 0.5 }}>/</span>
                  <Link to={`/project/${session.project_id}`} style={{ color: 'var(--color-text-muted)', textDecoration: 'none' }}>{session?.project_name}</Link>
                </>
              )}
            </div>
            <UserMenu />
          </div>
          <div className={styles.sessionInfo}>
            <div className={styles.sessionProject}>{session?.project_name}</div>
            <div className={styles.sessionClient}>{session?.client_name}</div>
            <div className={styles.saveRow}>
              <span className={styles.lastSaved}>
                {lastSavedAt ? `Saved ${lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Not yet saved'}
              </span>
              <button className={styles.saveBtn} onClick={handleManualSave} disabled={manualSaving}>
                {manualSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
          {(isAdmin || enabledFeatures?.test_mode) && (
            <button
              className={`${styles.testToggle} ${isTestMode ? styles.testToggleOn : ''}`}
              onClick={() => setIsTestMode(v => !v)}
            >
              {isTestMode ? 'Test Mode ON' : 'Test Mode OFF'}
            </button>
          )}
        </div>

        {/* Blueprint upload / replace */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Blueprint</div>
          {!blueprintUrl ? (
            <BlueprintUploader sessionId={sessionId} onUploaded={handleUploaded} oldBlueprintType={replacingBlueprintType} onStorageCheck={async (fileSize) => {
              // Check company storage limit before upload
              try {
                const { data: profile } = await supabase
                  .from('user_profiles')
                  .select('company_id')
                  .eq('user_id', user.id)
                  .single()
                if (!profile?.company_id) return true // no company = allow
                const { data: comp } = await supabase
                  .from('companies')
                  .select('plan')
                  .eq('id', profile.company_id)
                  .single()
                const plan = comp?.plan
                const PLAN_STORAGE = { basic: 5120, plus: 25600, ultra: 102400, founders: 25600, pilot: null }
                const limitMb = PLAN_STORAGE[plan] ?? null
                if (limitMb == null) return true // pilot = unlimited
                const usage = await getCompanyStorageUsage(profile.company_id)
                const projectedBytes = usage.totalBytes + fileSize
                if (projectedBytes > limitMb * 1024 * 1024) {
                  alert('Your company has reached its storage limit. Contact your admin to upgrade.')
                  return false
                }
                return true
              } catch {
                return true // allow on error
              }
            }} />
          ) : (
            <div className={styles.blueprintLoaded}>
              <span className={styles.blueprintCheck}>✓</span> Blueprint loaded
              <button
                className={styles.replaceBtn}
                onClick={() => {
                  setReplaceError('')
                  setShowReplaceConfirm(true)
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
            <div className={styles.sectionTitleRow}>
              <span className={styles.sectionTitle}>
                Pages ({visiblePageCount}{visiblePageCount < pageCount ? ` of ${pageCount}` : ''})
              </span>
              <button className={styles.editPagesBtn} onClick={() => setShowPageManager(true)}>
                Edit Pages
              </button>
            </div>
            <PdfPageSelector
              pageCount={pageCount}
              currentPage={currentPage}
              thumbnails={thumbnails}
              onPageSelect={handlePageSwitch}
              pageScales={pageScales}
              zones={zones}
              pageMetadata={pageMetadata}
            />
          </div>
        )}

        {/* Scale */}
        {blueprintUrl && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Scale</div>
            <ScalePanel
              pixelsPerFoot={pixelsPerFoot}
              pixelsPerInch={pixelsPerInch}
              pdfPageInfo={pdfPageInfo}
              currentPage={currentPage}
              pageCount={pageCount}
              isSuperAdmin={isAdmin}
              isPdf={isPdf}
              onScaleChange={(ppf) => { handleScaleChange(ppf) }}
              onStartCalibration={handleStartCalibration}
              calibrating={calibrating}
              pageKey={currentPage}
              enabledFeatures={enabledFeatures}
              onDetectScale={handleDetectScale}
              scaleSanity={scaleSanity}
              scaleDetectionBanner={scaleDetectionBanner}
              hasZonesOnPage={pageZones.length > 0}
              onRescaleZones={async () => {
                if (!pixelsPerFoot) return
                const count = await rescaleZonesOnCurrentPage(pixelsPerFoot)
                setRescaleToast(`${count} zone${count === 1 ? '' : 's'} rescaled`)
                setTimeout(() => setRescaleToast(''), 3000)
              }}
            />
          </div>
        )}

        {/* Summary moved to sidebar footer (Step 7) */}

        {/* Add Zone */}
        {blueprintUrl && pixelsPerFoot && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>
              {isAccumulating && !isDrawing ? 'Adding Segments…'
                : isDrawing ? (redrawingZoneId ? 'Redrawing…' : 'Drawing…')
                : 'Add Zone'}
            </div>
            <ZoneDrawPanel
              onStart={handleStartDrawing}
              onCancel={handleCancelDrawing}
              onUndoPoint={handleUndoPoint}
              onAddSegment={handleAddSegment}
              onFinalizeZone={handleFinalizeZone}
              isDrawing={isDrawing}
              isAccumulating={isAccumulating}
              segmentCount={finishedSegments.length}
              accumulatedResult={accumulatedResult}
              pointCount={drawnPoints.length}
              onFinish={handleZoneComplete}
              drawingType={activeZoneMeta?.type}
              sfPreview={sfPreview}
              wallPreview={wallPreview}
              enabledFeatures={enabledFeatures}
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
            {/* Calibration suggestion banner — visible to ALL users */}
            {showCalibBanner && (
              <div className={styles.calibBanner}>
                <div className={styles.calibBannerTitle}>
                  {consecutiveFailCount >= 3
                    ? '3 measurements have failed. Your scale may be set incorrectly.'
                    : 'Multiple measurements look too small. Your scale may be set incorrectly.'}
                </div>
                <div className={styles.calibBannerText}>Manual calibration is recommended.</div>
                <div className={styles.calibSteps}>
                  <div><strong>Step 1:</strong> Find a dimension printed on your blueprint (e.g. a room labeled 24'-0")</div>
                  <div><strong>Step 2:</strong> Enter that known distance below</div>
                  <div><strong>Step 3:</strong> Click Start Calibration, then click the two endpoints of that dimension on the blueprint</div>
                  <div><strong>Step 4:</strong> The scale updates automatically</div>
                </div>
                <div className={styles.calibBannerRow}>
                  <input
                    className={styles.calibBannerInput}
                    type="text"
                    value={calibBannerInput}
                    onChange={e => setCalibBannerInput(e.target.value)}
                    placeholder="e.g. 24' or 20'6&quot;"
                  />
                  <button
                    className={styles.calibBannerBtn}
                    disabled={!parseFeetInches(calibBannerInput) || calibrating}
                    onClick={() => {
                      const ft = parseFeetInches(calibBannerInput)
                      if (ft && ft > 0) handleStartCalibration(ft)
                    }}
                  >
                    {calibrating ? 'Click 2 points…' : 'Start Calibration'}
                  </button>
                </div>
              </div>
            )}

            <ZoneList
              zones={pageZones}
              onDelete={handleDeleteZone}
              onUpdate={handleUpdateZone}
              onRedraw={handleRedrawZone}
              redrawingZoneId={redrawingZoneId}
              enabledFeatures={enabledFeatures}
              hiddenZoneIds={hiddenZoneIds}
              onToggleVisibility={handleToggleZoneVisibility}
              isTestMode={isTestMode}
              testData={testData}
              onTestDataChange={handleTestDataChange}
              onLogTest={handleLogTest}
              pixelsPerFoot={pixelsPerFoot}
            />
          </div>
        )}

        {/* Test summary — shown when test mode is on */}
        {isTestMode && pageZones.length > 0 && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Test Results</div>
            <div className={styles.testSummary}>
              <div className={styles.testSummaryRow}>
                <span>Tested: {testSummary.total}</span>
                <span style={{ color: '#22c55e' }}>Pass: {testSummary.pass}</span>
                <span style={{ color: '#ef4444' }}>Fail: {testSummary.fail}</span>
              </div>
              {testSummary.verdict && (
                <div className={`${styles.testVerdict} ${testSummary.verdict === 'ACCURATE' ? styles.testVerdictPass : styles.testVerdictFail}`}>
                  {testSummary.verdict}
                </div>
              )}
              <div className={styles.testSummaryActions}>
                <button className={styles.testSummaryBtn} onClick={handleSaveAllTests} disabled={savingTests || testSummary.total === 0}>
                  {savingTests ? 'Saving…' : 'Save All Results'}
                </button>
                <button className={styles.testSummaryBtn} onClick={() => window.print()} disabled={testSummary.total === 0}>
                  Print Report
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Page Total footer */}
        {blueprintUrl && pageZones.length > 0 && (() => {
          const totalSF = pageZones.filter(z => z.measurement_type === 'SF').reduce((s, z) => s + (z.result ?? 0), 0)
          const totalLF = pageZones.filter(z => z.measurement_type === 'LF').reduce((s, z) => s + (z.result ?? 0), 0)
          const totalCount = pageZones.filter(z => z.measurement_type === 'count').reduce((s, z) => s + (z.result ?? 0), 0)
          return (
            <div className={styles.summaryFooter}>
              <button className={styles.summaryToggle} onClick={toggleSummaryCollapsed}>
                <span>{summaryCollapsed ? '▸' : '▾'}</span> Page Total
              </button>
              {!summaryCollapsed && (
                <div className={styles.summaryBody}>
                  {totalSF > 0 && <div className={styles.summaryLine}>{formatSF(totalSF)}</div>}
                  {totalLF > 0 && <div className={styles.summaryLine}>{formatLF(totalLF)}</div>}
                  {totalCount > 0 && <div className={styles.summaryLine}>{Math.round(totalCount)} items</div>}
                </div>
              )}
            </div>
          )
        })()}

        {/* Download original file and annotated PDF */}
        {blueprintUrl && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Download</div>
            <div className={styles.downloadBtns}>
              <button className={styles.downloadBtn} onClick={handleDownloadClean}>
                ↓ Clean PDF
              </button>
              <button
                className={`${styles.downloadBtn} ${styles.downloadBtnMeasure}`}
                onClick={handleDownloadWithMeasurements}
                disabled={downloadingPdf || zones.length === 0}
                title={zones.length === 0 ? 'Add zones first' : 'Download PDF with zone overlays'}
              >
                {downloadingPdf ? 'Generating…' : '↓ With Zones'}
              </button>
            </div>
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

        {/* Print-only report footer */}
        <div className={styles.printReportFooter}>
          blueprintmeasure.com | Accuracy Test Report
        </div>

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
            hiddenZoneIds={hiddenZoneIds}
            onLabelOffsetChange={handleLabelOffsetChange}
            orthoMode={orthoMode}
            enabledFeatures={enabledFeatures}
          />
        ) : (
          <div className={styles.emptyCanvas}>
            <div className={styles.emptyCanvasIcon}>📐</div>
            <p>Upload a blueprint to start measuring</p>
          </div>
        )}

        {/* Reset view button — always visible when a blueprint is loaded */}
        {blueprintUrl && (
          <div className={styles.canvasToolbar}>
            <button className={styles.resetViewBtn} onClick={handleResetView}>
              Reset view
            </button>
            <button
              className={`${styles.orthoBtn} ${orthoMode ? styles.orthoBtnActive : ''}`}
              onClick={toggleOrtho}
              title="Straight lines — snap to horizontal/vertical (O)"
            >
              Straight Lines {orthoMode ? 'ON' : 'OFF'}
            </button>
          </div>
        )}

        {/* AI scale detection banner */}
        {detectingScale && (
          <div className={styles.scaleBanner}>
            <span className={styles.scaleBannerDot} />
            Detecting scale…
          </div>
        )}
        {scaleDetectionBanner && !detectingScale && (
          <div className={styles.scaleBanner}>
            Scale auto-detected: <strong>{scaleDetectionBanner.label}</strong>
            <button
              className={styles.scaleBannerDismiss}
              onClick={() => setScaleDetectionBanner(null)}
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
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
              ? isAccumulating
                ? `Segment ${finishedSegments.length + 1} — click items · Finish Segment or Done to save`
                : 'Click each item to count it · Finish Zone to add segments'
              : isAccumulating
              ? `Segment ${finishedSegments.length + 1} — click points · double-click or Finish Segment`
              : redrawingZoneId
              ? 'Retrace the zone · Double-click or Finish Zone when done'
              : 'Click to place points · Double-click to finish'}
          </div>
        )}
        {isAccumulating && !isDrawing && (
          <div className={styles.hint}>
            Segment saved — click "Add Another Segment" or "Done — Save Zone"
          </div>
        )}

        {calibrating && (
          <div className={styles.hint} style={{ background: 'rgba(245,158,11,0.15)', color: '#fbbf24' }}>
            Click two points that span your known distance
          </div>
        )}
      </main>

      {/* Page Manager modal */}
      {showPageManager && isPdf && pageCount > 0 && (
        <PdfPageManager
          pageCount={pageCount}
          thumbnails={thumbnails}
          initialMetadata={pageMetadata}
          onSave={handleSavePageMetadata}
          onCancel={() => setShowPageManager(false)}
        />
      )}

      {/* Scale change rescale dialog */}
      <ScaleChangeDialog
        open={!!pendingScaleChange}
        zoneCount={pendingScaleChange?.zoneCount ?? 0}
        oldScaleLabel={pendingScaleChange?.oldLabel ?? 'Custom scale'}
        newScaleLabel={pendingScaleChange?.newLabel ?? 'Custom scale'}
        onRecalculate={async () => {
          const { newPPF } = pendingScaleChange
          await applyScaleChange(newPPF)
          runScaleSanityCheck(newPPF, 'dropdown')
          const count = await rescaleZonesOnCurrentPage(newPPF)
          setRescaleToast(`${count} zone${count === 1 ? '' : 's'} rescaled`)
          setTimeout(() => setRescaleToast(''), 3000)
          setPendingScaleChange(null)
        }}
        onKeepAsIs={async () => {
          const { newPPF } = pendingScaleChange
          await applyScaleChange(newPPF)
          runScaleSanityCheck(newPPF, 'dropdown')
          setRescaleToast('Scale updated. Existing zones kept at previous scale.')
          setTimeout(() => setRescaleToast(''), 3000)
          setPendingScaleChange(null)
        }}
        onCancel={() => setPendingScaleChange(null)}
      />

      {/* Replace blueprint confirmation */}
      {showReplaceConfirm && (
        <Modal title="Replace Blueprint?" onClose={() => setShowReplaceConfirm(false)}>
          <p style={{ color: 'var(--color-text-muted)', marginBottom: 20 }}>
            Replacing this blueprint will permanently delete all zones and measurements on this session. This action cannot be undone.
          </p>
          {replaceError && (
            <p style={{ fontSize: 13, color: 'var(--color-danger, #dc2626)', marginBottom: 12 }}>
              {replaceError}
            </p>
          )}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button
              style={{ background: 'none', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '9px 18px', color: 'var(--color-text-muted)', cursor: 'pointer' }}
              onClick={() => setShowReplaceConfirm(false)}
            >
              Cancel
            </button>
            <button
              style={{ background: 'var(--color-danger)', border: 'none', borderRadius: 'var(--radius)', padding: '9px 18px', color: 'white', fontWeight: 600, cursor: 'pointer' }}
              onClick={async () => {
                try {
                  const { error: delErr } = await supabase
                    .from('zones')
                    .delete()
                    .eq('session_id', sessionId)
                  if (delErr) throw new Error(delErr.message)

                  const { error: updErr } = await supabase
                    .from('sessions')
                    .update({ blueprint_url: null, blueprint_type: null })
                    .eq('id', sessionId)
                  if (updErr) throw new Error(updErr.message)
                } catch (err) {
                  setReplaceError('Failed to clear blueprint: ' + err.message)
                  return
                }
                setReplacingBlueprintType(blueprintType)
                setBlueprintUrl(null)
                setRenderedPageUrl(null)
                setThumbnails({})
                setCurrentPage(1)
                setShowReplaceConfirm(false)
                setReplaceError('')
                refetch()
              }}
            >
              Replace and Start Over
            </button>
          </div>
        </Modal>
      )}

      {/* Rescale toast */}
      {rescaleToast && (
        <div style={{
          position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(15,25,35,0.9)', color: '#86efac', padding: '10px 20px',
          borderRadius: 8, fontSize: 13, fontWeight: 600, zIndex: 200,
        }}>
          {rescaleToast}
        </div>
      )}
    </div>
  )
}
