import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { SCALE_OPTIONS } from '../utils/scaleOptions'
import { parseFeetInches, formatFeetInches } from '../utils/fractions'
import { useDateFormat } from '../hooks/useDateFormat'
import { BRAND } from '../lib/config'
import styles from './AccuracyTestPage.module.css'

let rowCounter = 0

function newRow() {
  return {
    id: ++rowCounter,
    roomName: '',
    type: 'SF',
    width: '',
    depth: '',
    statedValue: '',
    statedSource: '',
    measuredResult: '',
    notes: '',
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseStated(row) {
  if (row.type === 'SF') {
    const w = parseFeetInches(row.width)
    const d = parseFeetInches(row.depth)
    return w && d ? Math.round(w * d * 100) / 100 : null
  }
  if (row.type === 'LF') {
    const v = parseFeetInches(row.statedValue)
    return v != null ? Math.round(v * 100) / 100 : null
  }
  const n = parseInt(row.statedValue, 10)
  return isNaN(n) ? null : n
}

function parseMeasured(row) {
  if (row.type === 'LF') {
    const v = parseFeetInches(row.measuredResult)
    return v != null ? Math.round(v * 100) / 100 : null
  }
  if (row.type === 'count') {
    const n = parseInt(row.measuredResult, 10)
    return isNaN(n) ? null : n
  }
  const n = parseFloat(row.measuredResult)
  return isNaN(n) ? null : Math.round(n * 100) / 100
}

function evaluate(row, sfTol, lfTol) {
  const stated = parseStated(row)
  const measured = parseMeasured(row)
  if (stated == null || measured == null) {
    return { stated, measured, variance: null, direction: null, status: null }
  }
  const variance = Math.round((measured - stated) * 100) / 100
  const direction = variance > 0 ? 'OVER' : variance < 0 ? 'UNDER' : 'EXACT'
  let status
  if (row.type === 'count') {
    status = variance === 0 ? 'PASS' : 'FAIL'
  } else {
    const tol = row.type === 'SF' ? sfTol : lfTol
    if (measured < stated) status = 'FAIL'
    else if (measured <= stated + tol) status = 'PASS'
    else status = 'WARNING'
  }
  return { stated, measured, variance, direction, status }
}

const STATUS_COLORS = { PASS: '#22c55e', WARNING: '#f59e0b', FAIL: '#ef4444' }

function statusBg(s) {
  if (s === 'PASS') return 'rgba(34,197,94,0.12)'
  if (s === 'WARNING') return 'rgba(245,158,11,0.12)'
  if (s === 'FAIL') return 'rgba(239,68,68,0.12)'
  return 'transparent'
}

// ── Component ────────────────────────────────────────────────────────────────

export default function AccuracyTestPage() {
  const { t } = useTranslation()
  const { formatDate } = useDateFormat()

  // Project info
  const [projectName, setProjectName] = useState('')
  const [sheetNumber, setSheetNumber] = useState('')
  const [testerName, setTesterName] = useState('')

  // Tolerances
  const [sfTolerance, setSfTolerance] = useState(2.0)
  const [lfTolerance, setLfTolerance] = useState(2.0)
  const [settingsOpen, setSettingsOpen] = useState(false)

  // Scale calibration
  const [calibSheet, setCalibSheet] = useState('')
  const [calibScale, setCalibScale] = useState('1/4')
  const [calibKnown, setCalibKnown] = useState('')
  const [calibMeasured, setCalibMeasured] = useState('')

  // Test rows
  const [rows, setRows] = useState([])

  // ── Row helpers ──────────────────────────────────────────────────────────
  function addRow() { setRows(prev => [...prev, newRow()]) }

  function updateRow(id, field, value) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r))
  }

  function deleteRow(id) { setRows(prev => prev.filter(r => r.id !== id)) }

  // ── Calibration calculations ──────────────────────────────────────────────
  const calibKnownFt = parseFeetInches(calibKnown)
  const calibMeasuredFt = parseFeetInches(calibMeasured)
  const calibVariance = calibKnownFt && calibMeasuredFt
    ? Math.round(Math.abs(calibMeasuredFt - calibKnownFt) * 1000) / 1000
    : null
  const calibPct = calibKnownFt && calibVariance != null
    ? Math.round((calibVariance / calibKnownFt) * 10000) / 100
    : null
  const calibStatus = calibPct != null
    ? calibPct <= 2 ? 'PASS' : calibPct <= 5 ? 'WARNING' : 'FAIL'
    : null

  // ── Row results & summary ─────────────────────────────────────────────────
  const results = rows.map(r => ({ ...r, ...evaluate(r, sfTolerance, lfTolerance) }))
  const tested = results.filter(r => r.status != null)
  const passCount = tested.filter(r => r.status === 'PASS').length
  const warnCount = tested.filter(r => r.status === 'WARNING').length
  const failCount = tested.filter(r => r.status === 'FAIL').length
  const verdict = failCount > 0 ? 'INACCURATE' : warnCount > 0 ? 'NEEDS REVIEW' : tested.length > 0 ? 'ACCURATE' : null

  const sfResults = results.filter(r => r.type === 'SF' && r.stated != null && r.measured != null)
  const totalSFStated = sfResults.reduce((s, r) => s + r.stated, 0)
  const totalSFMeasured = sfResults.reduce((s, r) => s + r.measured, 0)
  const lfResults = results.filter(r => r.type === 'LF' && r.stated != null && r.measured != null)
  const totalLFStated = lfResults.reduce((s, r) => s + r.stated, 0)
  const totalLFMeasured = lfResults.reduce((s, r) => s + r.measured, 0)

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className={styles.page}>

      {/* ── Header ── */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.logo}>📐 {BRAND.name}</span>
          <span className={styles.adminBadge}>{t('common:role.super_admin')}</span>
          <span className={styles.testBadge}>{t('misc:accuracy.testMode')}</span>
        </div>
        <div className={styles.headerRight}>
          <button className={styles.printBtn} onClick={() => window.print()}>
            🖨 {t('misc:accuracy.printReport')}
          </button>
          <Link to="/admin" className={styles.backLink}>{t('misc:accuracy.backAdmin')}</Link>
          <Link to="/dashboard" className={styles.backLink}>{t('misc:accuracy.backDashboard')}</Link>
        </div>
      </header>

      <main className={styles.content}>

        <p className={styles.notice}>
          {t('misc:accuracy.notice')}
        </p>

        {/* ── Print-only header ── */}
        <div className={styles.printHeader}>
          <h1>{t('misc:accuracy.reportTitle', { brand: BRAND.name })}</h1>
          <p>{formatDate(new Date())}</p>
        </div>

        {/* ── Project info ── */}
        <div className={styles.projectBar}>
          <div className={styles.projectField}>
            <label>{t('misc:accuracy.projectName')}</label>
            <input value={projectName} onChange={e => setProjectName(e.target.value)}
              placeholder={t('misc:accuracy.projectNamePlaceholder')} className={styles.inputTester} />
          </div>
          <div className={styles.projectField}>
            <label>{t('misc:accuracy.blueprintSheet')}</label>
            <input value={sheetNumber} onChange={e => setSheetNumber(e.target.value)}
              placeholder={t('misc:accuracy.sheetPlaceholder')} className={styles.inputTester} />
          </div>
          <div className={styles.projectField}>
            <label>{t('misc:accuracy.testerName')}</label>
            <input value={testerName} onChange={e => setTesterName(e.target.value)}
              placeholder={t('misc:accuracy.testerNamePlaceholder')} className={styles.inputTester} />
          </div>
        </div>

        {/* ── Tolerance rules ── */}
        <div className={styles.rulesCard}>
          <div className={styles.rulesTitle}>{t('misc:accuracy.toleranceRules')}</div>
          <div className={styles.rulesGrid}>
            <div className={styles.rule}>
              <strong>{t('common:units.sf')}</strong>{t('misc:accuracy.ruleSF', { tol: sfTolerance })}
            </div>
            <div className={styles.rule}>
              <strong>{t('common:units.lf')}</strong>{t('misc:accuracy.ruleLF', { tol: lfTolerance })}
            </div>
            <div className={styles.rule}>
              <strong>{t('misc:accuracy.typeCount')}</strong>{t('misc:accuracy.ruleCount')}
            </div>
          </div>
          <button className={`${styles.settingsToggle} ${styles.noprint}`}
            onClick={() => setSettingsOpen(o => !o)}>
            {settingsOpen ? t('misc:accuracy.hideSettings') : t('misc:accuracy.editTolerances')}
          </button>
          {settingsOpen && (
            <div className={`${styles.settingsRow} ${styles.noprint}`}>
              <label>{t('misc:accuracy.sfTolerance')}
                <input type="number" min="0" step="0.5" value={sfTolerance}
                  onChange={e => setSfTolerance(parseFloat(e.target.value) || 0)}
                  className={styles.inputSmall} />
              </label>
              <label>{t('misc:accuracy.lfTolerance')}
                <input type="number" min="0" step="0.5" value={lfTolerance}
                  onChange={e => setLfTolerance(parseFloat(e.target.value) || 0)}
                  className={styles.inputSmall} />
              </label>
            </div>
          )}
        </div>

        {/* ── Scale calibration ── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t('misc:accuracy.scaleCalibration')}</h2>
          <div className={styles.calibGrid}>
            <div className={styles.calibField}>
              <label>{t('misc:accuracy.sheetNumber')}</label>
              <input value={calibSheet} onChange={e => setCalibSheet(e.target.value)}
                placeholder={t('misc:accuracy.sheetPlaceholder')} className={styles.inputTester} />
            </div>
            <div className={styles.calibField}>
              <label>{t('misc:accuracy.statedScale')}</label>
              <select value={calibScale} onChange={e => setCalibScale(e.target.value)}
                className={styles.inputTester}>
                {SCALE_OPTIONS.filter(o => o.value !== 'manual').map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className={styles.calibField}>
              <label>{t('misc:accuracy.knownRef')}</label>
              <input value={calibKnown} onChange={e => setCalibKnown(e.target.value)}
                placeholder="e.g. 20' or 19'6&quot;" className={styles.inputTester} />
              {calibKnownFt != null && (
                <span className={styles.calibParsed}>{formatFeetInches(calibKnownFt)}</span>
              )}
            </div>
            <div className={styles.calibField}>
              <label>{t('misc:accuracy.measuredResult')}</label>
              <input value={calibMeasured} onChange={e => setCalibMeasured(e.target.value)}
                placeholder="e.g. 20'1&quot; or 20.08" className={styles.inputTester} />
              {calibMeasuredFt != null && (
                <span className={styles.calibParsed}>{formatFeetInches(calibMeasuredFt)}</span>
              )}
            </div>
            <div className={styles.calibField}>
              <label>{t('misc:accuracy.variance')}</label>
              <div className={styles.calcCell}>
                {calibVariance != null ? `${calibVariance} ft` : '—'}
              </div>
            </div>
            <div className={styles.calibField}>
              <label>{t('misc:accuracy.variancePct')}</label>
              <div className={styles.calcCell}>
                {calibPct != null ? `${calibPct}%` : '—'}
              </div>
            </div>
            <div className={styles.calibField}>
              <label>{t('misc:accuracy.result')}</label>
              {calibStatus ? (
                <div className={styles.statusPill}
                  style={{ background: statusBg(calibStatus), color: STATUS_COLORS[calibStatus] }}>
                  {calibStatus}
                </div>
              ) : (
                <div className={styles.calcCell}>—</div>
              )}
            </div>
          </div>
        </section>

        {calibStatus === 'FAIL' && (
          <div className={styles.calibWarning}>
            {t('misc:accuracy.calibFailed')}
          </div>
        )}

        {/* ── Room test table ── */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>{t('misc:accuracy.roomTests')}</h2>
            <button className={`${styles.addBtn} ${styles.noprint}`} onClick={addRow}>
              {t('misc:accuracy.addRow')}
            </button>
          </div>

          {rows.length === 0 ? (
            <p className={styles.empty}>{t('misc:accuracy.empty')}</p>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>{t('misc:accuracy.col.roomZone')}</th>
                    <th>{t('misc:accuracy.col.type')}</th>
                    <th>{t('misc:accuracy.col.width')}</th>
                    <th>{t('misc:accuracy.col.depth')}</th>
                    <th>{t('misc:accuracy.col.statedValue')}</th>
                    <th>{t('misc:accuracy.col.source')}</th>
                    <th>{t('misc:accuracy.col.measured')}</th>
                    <th>{t('misc:accuracy.variance')}</th>
                    <th>{t('misc:accuracy.col.dir')}</th>
                    <th>{t('misc:accuracy.result')}</th>
                    <th>{t('misc:accuracy.notes')}</th>
                    <th className={styles.noprint}></th>
                  </tr>
                </thead>
                <tbody>
                  {results.map(r => {
                    const sc = STATUS_COLORS[r.status] ?? 'var(--color-border)'
                    const unit = r.type === 'SF' ? ' sf' : r.type === 'LF' ? ' ft' : ''
                    return (
                      <tr key={r.id} className={styles.testRow}
                        style={{ borderLeft: `4px solid ${sc}` }}>

                        <td>
                          <input className={styles.inputTester} value={r.roomName}
                            onChange={e => updateRow(r.id, 'roomName', e.target.value)}
                            placeholder={t('misc:accuracy.roomNamePlaceholder')} />
                        </td>

                        <td>
                          <select className={`${styles.inputTester} ${styles.selectNarrow}`}
                            value={r.type}
                            onChange={e => updateRow(r.id, 'type', e.target.value)}>
                            <option value="SF">{t('common:units.sf')}</option>
                            <option value="LF">{t('common:units.lf')}</option>
                            <option value="count">{t('misc:accuracy.typeCount')}</option>
                          </select>
                        </td>

                        <td>
                          {r.type === 'SF' ? (
                            <input className={styles.inputTester} value={r.width}
                              onChange={e => updateRow(r.id, 'width', e.target.value)}
                              placeholder="e.g. 20'" />
                          ) : <span className={styles.cellMuted}>—</span>}
                        </td>

                        <td>
                          {r.type === 'SF' ? (
                            <input className={styles.inputTester} value={r.depth}
                              onChange={e => updateRow(r.id, 'depth', e.target.value)}
                              placeholder="e.g. 15'" />
                          ) : <span className={styles.cellMuted}>—</span>}
                        </td>

                        <td>
                          {r.type === 'SF' ? (
                            <div className={styles.calcCell}>
                              {r.stated != null ? `${r.stated} sf` : '—'}
                            </div>
                          ) : (
                            <input className={styles.inputTester} value={r.statedValue}
                              onChange={e => updateRow(r.id, 'statedValue', e.target.value)}
                              placeholder={r.type === 'LF' ? "e.g. 12'6\"" : 'e.g. 14'} />
                          )}
                        </td>

                        <td>
                          <input className={styles.inputTester} value={r.statedSource}
                            onChange={e => updateRow(r.id, 'statedSource', e.target.value)}
                            placeholder={t('misc:accuracy.sourcePlaceholder')} style={{ fontSize: '11px' }} />
                        </td>

                        <td>
                          <input className={styles.inputTester} value={r.measuredResult}
                            onChange={e => updateRow(r.id, 'measuredResult', e.target.value)}
                            placeholder={t('misc:accuracy.measuredPlaceholder')} />
                        </td>

                        <td>
                          <div className={styles.calcCell}>
                            {r.variance != null
                              ? `${r.variance > 0 ? '+' : ''}${r.variance}${unit}`
                              : '—'}
                          </div>
                        </td>

                        <td>
                          {r.direction ? (
                            <span className={r.direction === 'OVER' ? styles.dirOver : r.direction === 'UNDER' ? styles.dirUnder : styles.dirExact}>
                              {r.direction}
                            </span>
                          ) : <span className={styles.cellMuted}>—</span>}
                        </td>

                        <td>
                          {r.status ? (
                            <div className={styles.statusPill}
                              style={{ background: statusBg(r.status), color: STATUS_COLORS[r.status] }}>
                              {r.status}
                            </div>
                          ) : <span className={styles.cellMuted}>—</span>}
                        </td>

                        <td>
                          <input className={styles.inputTester} value={r.notes}
                            onChange={e => updateRow(r.id, 'notes', e.target.value)}
                            placeholder={t('misc:accuracy.notes')} style={{ fontSize: '11px' }} />
                        </td>

                        <td className={styles.noprint}>
                          <button className={styles.deleteBtn} onClick={() => deleteRow(r.id)}>
                            ✕
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── Summary ── */}
        {tested.length > 0 && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{t('misc:accuracy.summary')}</h2>
            <div className={styles.summaryGrid}>
              <div className={styles.summaryCard}>
                <span className={styles.summaryValue}>{tested.length}</span>
                <span className={styles.summaryLabel}>{t('misc:accuracy.totalTested')}</span>
              </div>
              <div className={styles.summaryCard}>
                <span className={styles.summaryValue} style={{ color: '#22c55e' }}>{passCount}</span>
                <span className={styles.summaryLabel}>{t('misc:accuracy.passed')}</span>
              </div>
              <div className={styles.summaryCard}>
                <span className={styles.summaryValue} style={{ color: '#f59e0b' }}>{warnCount}</span>
                <span className={styles.summaryLabel}>{t('misc:accuracy.warnings')}</span>
              </div>
              <div className={styles.summaryCard}>
                <span className={styles.summaryValue} style={{ color: '#ef4444' }}>{failCount}</span>
                <span className={styles.summaryLabel}>{t('misc:accuracy.failed')}</span>
              </div>
            </div>

            {/* SF / LF totals */}
            {sfResults.length > 0 && (
              <div className={styles.totalRow}>
                <span className={styles.totalLabel}>{t('misc:accuracy.totalSF')}</span>
                <span>{t('misc:accuracy.statedTotal', { value: totalSFStated.toFixed(2) })}</span>
                <span>{t('misc:accuracy.measuredTotal', { value: totalSFMeasured.toFixed(2) })}</span>
                <span style={{ color: totalSFMeasured >= totalSFStated ? '#22c55e' : '#ef4444' }}>
                  {t('misc:accuracy.overUnderBySf', { dir: totalSFMeasured >= totalSFStated ? 'OVER' : 'UNDER', amount: Math.abs(totalSFMeasured - totalSFStated).toFixed(2) })}
                </span>
              </div>
            )}
            {lfResults.length > 0 && (
              <div className={styles.totalRow}>
                <span className={styles.totalLabel}>{t('misc:accuracy.totalLF')}</span>
                <span>{t('misc:accuracy.statedTotal', { value: totalLFStated.toFixed(2) })}</span>
                <span>{t('misc:accuracy.measuredTotal', { value: totalLFMeasured.toFixed(2) })}</span>
                <span style={{ color: totalLFMeasured >= totalLFStated ? '#22c55e' : '#ef4444' }}>
                  {t('misc:accuracy.overUnderByLf', { dir: totalLFMeasured >= totalLFStated ? 'OVER' : 'UNDER', amount: Math.abs(totalLFMeasured - totalLFStated).toFixed(2) })}
                </span>
              </div>
            )}

            {/* Overall verdict */}
            {verdict && (
              <div className={styles.verdictBox} style={{
                background: statusBg(verdict === 'ACCURATE' ? 'PASS' : verdict === 'NEEDS REVIEW' ? 'WARNING' : 'FAIL'),
                borderColor: STATUS_COLORS[verdict === 'ACCURATE' ? 'PASS' : verdict === 'NEEDS REVIEW' ? 'WARNING' : 'FAIL'],
                color: STATUS_COLORS[verdict === 'ACCURATE' ? 'PASS' : verdict === 'NEEDS REVIEW' ? 'WARNING' : 'FAIL'],
              }}>
                <span className={styles.verdictLabel}>{t('misc:accuracy.overallVerdict')}</span>
                <span className={styles.verdictValue}>{verdict}</span>
              </div>
            )}
          </section>
        )}

      </main>
    </div>
  )
}
