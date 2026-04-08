import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useSession } from '../hooks/useSession'
import { calcPixelsPerFoot } from '../utils/scaleOptions'
import { calculate } from '../utils/measurements'
import { exportCSV } from '../utils/csvExport'
import BlueprintCanvas from '../components/canvas/BlueprintCanvas'
import BlueprintUploader from '../components/canvas/BlueprintUploader'
import ScalePanel from '../components/canvas/ScalePanel'
import ZoneDrawPanel from '../components/zones/ZoneDrawPanel'
import ZoneList from '../components/zones/ZoneList'
import styles from './SessionPage.module.css'

// SessionPage is the main working environment.
// Left sidebar: controls (scale, draw panel, zone list, export)
// Center: the blueprint canvas
export default function SessionPage() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const { session, zones, loading, error, saveZone, deleteZone, updateSession } = useSession(sessionId)

  // Blueprint image state
  const [blueprintUrl, setBlueprintUrl] = useState(null)
  const [blueprintType, setBlueprintType] = useState(null)

  // Scale state
  const [pixelsPerFoot, setPixelsPerFoot] = useState(null)
  const [calibrating, setCalibrating] = useState(false)
  const [pendingCalibFeet, setPendingCalibFeet] = useState(null)

  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false)
  const [activeZoneMeta, setActiveZoneMeta] = useState(null) // { name, type }
  const [drawnPoints, setDrawnPoints] = useState([])

  // When the session loads from the database, restore the blueprint image.
  // useEffect re-runs whenever `session` changes — so when Supabase returns
  // the session data, this fires and populates blueprintUrl from the saved URL.
  useEffect(() => {
    if (session?.blueprint_url && !blueprintUrl) {
      setBlueprintUrl(session.blueprint_url)
      setBlueprintType(session.blueprint_type)
    }
  }, [session])

  // Called after successful upload
  function handleUploaded({ url, type }) {
    setBlueprintUrl(url)
    setBlueprintType(type)
  }

  // Called when user picks a scale from the dropdown
  function handleScaleChange(ppf) {
    setPixelsPerFoot(ppf)
  }

  // Called when user submits calibration line form
  function handleStartCalibration(knownFeet) {
    setPendingCalibFeet(knownFeet)
    setCalibrating(true)
  }

  // Called after user draws 2 calibration points on the canvas
  function handleCalibrationLine(pt1, pt2) {
    const dx = pt2.x - pt1.x
    const dy = pt2.y - pt1.y
    const pixelLength = Math.sqrt(dx * dx + dy * dy)
    const ppf = pixelLength / pendingCalibFeet
    setPixelsPerFoot(ppf)
    setCalibrating(false)
    setPendingCalibFeet(null)
  }

  // Called when user clicks "Start Drawing" in the ZoneDrawPanel
  function handleStartDrawing({ name, type }) {
    setActiveZoneMeta({ name, type })
    setDrawnPoints([])
    setIsDrawing(true)
  }

  // Called each time user clicks on the canvas while drawing
  const handlePointAdd = useCallback((pt) => {
    setDrawnPoints(prev => [...prev, pt])
  }, [])

  // Called when user double-clicks or clicks "Finish Zone"
  const handleZoneComplete = useCallback(async () => {
    if (!activeZoneMeta || drawnPoints.length < 1) return
    if (!pixelsPerFoot) {
      alert('Please set a scale before measuring.')
      return
    }

    const result = calculate(activeZoneMeta.type, drawnPoints, pixelsPerFoot)

    try {
      await saveZone({
        name: activeZoneMeta.name,
        measurement_type: activeZoneMeta.type,
        points: drawnPoints,
        result,
      })
    } catch (err) {
      alert('Error saving zone: ' + err.message)
    }

    setIsDrawing(false)
    setActiveZoneMeta(null)
    setDrawnPoints([])
  }, [activeZoneMeta, drawnPoints, pixelsPerFoot, saveZone])

  function handleCancelDrawing() {
    setIsDrawing(false)
    setActiveZoneMeta(null)
    setDrawnPoints([])
  }

  async function handleDeleteZone(zoneId) {
    try {
      await deleteZone(zoneId)
    } catch (err) {
      alert('Error deleting zone: ' + err.message)
    }
  }

  function handleExportCSV() {
    if (zones.length === 0) {
      alert('No zones to export yet.')
      return
    }
    exportCSV(session, zones)
  }

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

  const activeZoneForCanvas = isDrawing
    ? { points: drawnPoints, measurement_type: activeZoneMeta?.type }
    : null

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
                onClick={() => setBlueprintUrl(null)}
              >
                Replace
              </button>
            </div>
          )}
        </div>

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

        {/* Draw */}
        {blueprintUrl && pixelsPerFoot && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>
              {isDrawing ? 'Drawing…' : 'Add Zone'}
            </div>
            <ZoneDrawPanel
              onStart={handleStartDrawing}
              onCancel={handleCancelDrawing}
              isDrawing={isDrawing}
              pointCount={drawnPoints.length}
              onFinish={handleZoneComplete}
            />
          </div>
        )}

        {/* Zone list */}
        {zones.length > 0 && (
          <div className={`${styles.section} ${styles.zoneListSection}`}>
            <div className={styles.sectionTitle}>
              Zones ({zones.length})
            </div>
            <ZoneList zones={zones} onDelete={handleDeleteZone} />
          </div>
        )}

        {/* Export */}
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
            imageUrl={blueprintType === 'application/pdf' ? null : blueprintUrl}
            zones={zones}
            activeZone={activeZoneForCanvas}
            onPointAdd={handlePointAdd}
            onZoneComplete={handleZoneComplete}
            pixelsPerFoot={pixelsPerFoot}
            isDrawing={isDrawing}
            calibrating={calibrating}
            onCalibrationLine={handleCalibrationLine}
          />
        ) : (
          <div className={styles.emptyCanvas}>
            <div className={styles.emptyCanvasIcon}>📐</div>
            <p>Upload a blueprint to start measuring</p>
          </div>
        )}

        {/* Keyboard hint */}
        {isDrawing && (
          <div className={styles.hint}>
            Click to place points · Double-click to finish
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
