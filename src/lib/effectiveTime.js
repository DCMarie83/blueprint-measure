// The single time authority for Lite. Every Lite surface that needs "now",
// "today", or a reporting window computes it HERE, in the user's EFFECTIVE
// zone — user_profiles.timezone when set and valid, else the device zone.
// No inline Date-zone math anywhere else, and no new date library: everything
// is built on Intl.

const pad = (n) => String(n).padStart(2, '0')
const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`

// The device's own zone — the fallback whenever no explicit zone is set/valid.
export function deviceTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

// Is this a zone Intl will accept? Prefer the canonical IANA list (the same set
// the settings select is built from); fall back to a construction probe on the
// rare engine that lacks supportedValuesOf.
export function isValidTimeZone(tz) {
  if (!tz || typeof tz !== 'string') return false
  try {
    if (typeof Intl.supportedValuesOf === 'function') {
      return Intl.supportedValuesOf('timeZone').includes(tz)
    }
  } catch { /* fall through to the probe */ }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

// THE authority: a profile's saved zone when set + valid, else the device zone.
export function getEffectiveTimeZone(profile) {
  const tz = profile?.timezone
  if (tz && isValidTimeZone(tz)) return tz
  return deviceTimeZone()
}

// ── Civil-date core ────────────────────────────────────────────────
// The calendar Y/M/D showing on the wall clock in `timeZone` at `date`.
function civil(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date)
  const get = (t) => Number(parts.find((p) => p.type === t).value)
  return { y: get('year'), m: get('month'), d: get('day') }
}

// Day arithmetic on a civil date, anchored at UTC midnight so DST never shifts
// the calendar day. Returns { y, m, d }.
function addDays({ y, m, d }, delta) {
  const t = new Date(Date.UTC(y, m - 1, d))
  t.setUTCDate(t.getUTCDate() + delta)
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }
}

// 0 Sun … 6 Sat for a civil date (UTC anchor, DST-agnostic).
function weekday({ y, m, d }) {
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

// ── Boundaries — all return 'YYYY-MM-DD' in the given zone ──────────
// These strings are compared lexicographically against work_date / payment_date
// (also 'YYYY-MM-DD'), so windowing is exact regardless of the viewer's device.
export function startOfToday(timeZone, now = new Date()) {
  const c = civil(now, timeZone)
  return ymd(c.y, c.m, c.d)
}

// Monday..Sunday week containing today.
export function weekRange(timeZone, now = new Date()) {
  const c = civil(now, timeZone)
  const back = (weekday(c) + 6) % 7 // days since Monday
  const mon = addDays(c, -back)
  const sun = addDays(mon, 6)
  return { from: ymd(mon.y, mon.m, mon.d), to: ymd(sun.y, sun.m, sun.d) }
}

export function startOfMonth(timeZone, now = new Date()) {
  const c = civil(now, timeZone)
  return ymd(c.y, c.m, 1)
}

export function startOfYear(timeZone, now = new Date()) {
  const c = civil(now, timeZone)
  return ymd(c.y, 1, 1)
}

// Full month range. offset 0 = this month, -1 = last month.
export function monthRange(timeZone, offset = 0, now = new Date()) {
  const c = civil(now, timeZone)
  let y = c.y
  let m = c.m + offset
  while (m < 1) { m += 12; y -= 1 }
  while (m > 12) { m -= 12; y += 1 }
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate() // day 0 of next month
  return { from: ymd(y, m, 1), to: ymd(y, m, lastDay) }
}

// Full year range. offset 0 = this year, -1 = last year.
export function yearRange(timeZone, offset = 0, now = new Date()) {
  const c = civil(now, timeZone)
  const y = c.y + offset
  return { from: ymd(y, 1, 1), to: ymd(y, 12, 31) }
}

// The Reports presets, centralized so the page carries zero zone math.
export function presetRange(key, timeZone, now = new Date()) {
  switch (key) {
    case 'this_month': return { label: 'This month', ...monthRange(timeZone, 0, now) }
    case 'last_month': return { label: 'Last month', ...monthRange(timeZone, -1, now) }
    case 'this_year':  return { label: 'This year', ...yearRange(timeZone, 0, now) }
    case 'last_year':  return { label: 'Last year', ...yearRange(timeZone, -1, now) }
    default:           return { label: 'This month', ...monthRange(timeZone, 0, now) }
  }
}

// ── Display ────────────────────────────────────────────────────────
// "Friday, July 17 · 4:12 PM" in the given zone. No seconds, no tz clutter.
export function formatHeaderDateTime(timeZone, date = new Date()) {
  const datePart = new Intl.DateTimeFormat('en-US', {
    timeZone, weekday: 'long', month: 'long', day: 'numeric',
  }).format(date)
  const timePart = new Intl.DateTimeFormat('en-US', {
    timeZone, hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(date)
  return `${datePart} · ${timePart}`
}

// A single clock time (e.g. "8:04 AM") for a timestamp, rendered in the given
// zone. Used by the punch timer, the invoice line descriptions, and the PDF
// Time-detail rows so every "in/out" reads in the sub's effective zone.
export function formatTimeOnly(timeZone, date = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone, hour: 'numeric', minute: '2-digit', hour12: true,
    }).format(date instanceof Date ? date : new Date(date))
  } catch {
    return ''
  }
}

// The zone's short name for the current instant (e.g. "EDT", "PST"). Used only
// as a small suffix when a non-automatic zone is set. Empty on failure.
export function zoneShortName(timeZone, date = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone, hour: 'numeric', timeZoneName: 'short',
    }).formatToParts(date)
    const p = parts.find((x) => x.type === 'timeZoneName')
    return p ? p.value : ''
  } catch {
    return ''
  }
}

// Common US zones, pinned at the top of the settings select.
export const COMMON_US_TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern (New York)' },
  { value: 'America/Chicago', label: 'Central (Chicago)' },
  { value: 'America/Denver', label: 'Mountain (Denver)' },
  { value: 'America/Phoenix', label: 'Arizona (Phoenix, no DST)' },
  { value: 'America/Los_Angeles', label: 'Pacific (Los Angeles)' },
  { value: 'America/Anchorage', label: 'Alaska (Anchorage)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii (Honolulu)' },
]
