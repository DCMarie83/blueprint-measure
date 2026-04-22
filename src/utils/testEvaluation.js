// Pure evaluation function used by both ZoneList (display) and SessionPage (summary).
// Returns { verdict, errorCode, errorMessage, stated, variance, variancePct }
// verdict: 'PASS' | 'FAIL' | null (null = incomplete data, not yet testable)
//
// The `input` object may contain:
//   - segments: array of { mode, width, depth, sf, lf } for multi-segment tests
//   - expectedTotal: pre-computed sum of all segments (set by the UI)
//   - Legacy single-segment fields (width, depth, statedValue, useDimensions)
//     are still supported for backward compatibility.

import { parseFeetInches } from './fractions'

// Compute the expected total from segments array.
// Returns a number or null if any segment is incomplete.
export function computeExpectedTotal(segments, type) {
  if (!segments || segments.length === 0) return null
  let total = 0
  for (const seg of segments) {
    if (type === 'SF') {
      if (seg.mode === 'direct') {
        const v = parseFloat(seg.sf)
        if (!v || isNaN(v)) return null
        total += v
      } else {
        const w = parseFeetInches(seg.width)
        const d = parseFeetInches(seg.depth)
        if (!w || !d) return null
        total += w * d
      }
    } else if (type === 'LF') {
      const v = parseFeetInches(seg.lf)
      if (!v) return null
      total += v
    }
  }
  return Math.round(total * 100) / 100
}

export function evaluateZoneTest(zone, input, pixelsPerFoot) {
  if (!input) return { verdict: null }
  if (!pixelsPerFoot) {
    return { verdict: 'FAIL', errorCode: 'ERR-003', errorMessage: 'Scale calibration required before test results are valid.' }
  }

  const measured = zone.result ?? 0
  const type = zone.measurement_type

  // ── Count ──────────────────────────────────────────────────────────────────
  if (type === 'count') {
    if (input.countVerified === true)  return { verdict: 'PASS', errorCode: null, errorMessage: null, stated: measured, variance: 0, variancePct: 0 }
    if (input.countVerified === false) return { verdict: 'FAIL', errorCode: null, errorMessage: 'Count verification failed — marked as not verified.', stated: measured, variance: 0, variancePct: 0 }
    return { verdict: null, errorCode: 'ERR-004', errorMessage: 'Mark count as verified or not verified.' }
  }

  // ── Compute stated value ───────────────────────────────────────────────────
  // Prefer segments-based expectedTotal; fall back to legacy single fields.
  let stated = null

  if (input.segments && input.segments.length > 0) {
    stated = computeExpectedTotal(input.segments, type)
    if (stated == null) {
      return { verdict: null, errorCode: 'ERR-004', errorMessage: 'Complete all segment dimensions to run the test.' }
    }
  } else if (type === 'SF') {
    if (input.useDimensions !== false) {
      const w = parseFeetInches(input.width)
      const d = parseFeetInches(input.depth)
      if (!w || !d) return { verdict: null, errorCode: 'ERR-004', errorMessage: 'Enter blueprint dimensions to run the test.' }
      stated = Math.round(w * d * 100) / 100
    } else {
      stated = parseFloat(input.statedValue)
      if (!stated || isNaN(stated)) return { verdict: null, errorCode: 'ERR-004', errorMessage: 'Enter stated SF to run the test.' }
    }
  } else if (type === 'LF') {
    stated = parseFeetInches(input.statedValue)
    if (!stated) return { verdict: null, errorCode: 'ERR-004', errorMessage: 'Enter stated LF to run the test.' }
    stated = Math.round(stated * 100) / 100
  }

  if (stated == null) return { verdict: null }

  const variance = Math.round((measured - stated) * 100) / 100
  const variancePct = stated !== 0 ? Math.round((variance / stated) * 10000) / 100 : 0
  const tolerance = 2.0
  const unit = type === 'SF' ? 'SF' : 'LF'

  if (measured < stated) {
    const code = type === 'SF' ? 'ERR-001' : 'ERR-005'
    const label = type === 'SF' ? 'UNDER STATED' : 'LF UNDER STATED'
    return {
      verdict: 'FAIL', errorCode: code, stated, variance, variancePct,
      errorMessage: `${label} — Measured ${measured} ${unit} is below stated ${stated.toFixed(2)} ${unit}. Under-measurement is not acceptable.`,
    }
  }

  if (measured > stated + tolerance) {
    const code = type === 'SF' ? 'ERR-002' : 'ERR-006'
    const label = type === 'SF' ? 'OVER TOLERANCE' : 'LF OVER TOLERANCE'
    return {
      verdict: 'FAIL', errorCode: code, stated, variance, variancePct,
      errorMessage: `${label} — Measured ${measured} ${unit} exceeds stated ${stated.toFixed(2)} ${unit} by ${variance.toFixed(2)} ${unit} (max allowed: +${tolerance} ${unit}).`,
    }
  }

  return { verdict: 'PASS', errorCode: null, errorMessage: null, stated, variance, variancePct }
}
