import { resolveUserPrefs } from './userPrefs';

function partsForDate(value, timezone) {
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return null;
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(d).map(p => [p.type, p.value]));
  return { year: parts.year, month: parts.month, day: parts.day, hour: parts.hour, minute: parts.minute, second: parts.second };
}

export function formatDate(value, userProfileOrPrefs) {
  if (!value) return '';
  const prefs = userProfileOrPrefs?.timezone ? userProfileOrPrefs : resolveUserPrefs(userProfileOrPrefs);
  const p = partsForDate(value, prefs.timezone);
  if (!p) return '';
  return prefs.date_format === 'ISO' ? `${p.year}-${p.month}-${p.day}` : `${p.month}/${p.day}/${p.year}`;
}

export function formatTime(value, userProfileOrPrefs) {
  if (!value) return '';
  const prefs = userProfileOrPrefs?.timezone ? userProfileOrPrefs : resolveUserPrefs(userProfileOrPrefs);
  const p = partsForDate(value, prefs.timezone);
  if (!p) return '';
  if (prefs.time_format === '24h') return `${p.hour}:${p.minute}`;
  const h24 = parseInt(p.hour, 10);
  const h12 = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24;
  const ampm = h24 >= 12 ? 'PM' : 'AM';
  return `${h12}:${p.minute} ${ampm}`;
}

export function formatDateTime(value, userProfileOrPrefs) {
  if (!value) return '';
  const d = formatDate(value, userProfileOrPrefs);
  const t = formatTime(value, userProfileOrPrefs);
  return d && t ? `${d}, ${t}` : d || t;
}

export function formatRelative(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diffSec < 60) return 'just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;
  return null;
}
