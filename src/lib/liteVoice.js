// Central Lite voice — the RivetDog dog-pun personality, in ONE place so the
// quarterly copy refresh is a single-file edit. This matches the main app's
// register: puns live on SAFE surfaces only (success toasts, non-money empty
// states, the home greeting, the done-for-today closer). Money and GC-facing
// surfaces — invoices, sends, mark-paid, rates, totals, anything a GC ever sees
// — stay serious and import NOTHING from here.
//
// i18n: this non-component module exports i18n KEY STRINGS (not English). Each
// consumer wraps the value with t(), e.g. t(TOASTS.jobCreated), t(EMPTY.jobs),
// t(randomTagline()). The English pun copy lives under lite:voice.* in the
// locale JSON, so the quarterly refresh is still a single (locale) edit.

// Home taglines — dog-voiced, work-forward. One is picked at random per load, so
// the greeting feels fresh across reloads. Refresh the copy quarterly (locale).
export const HOME_TAGLINES = [
  'lite:voice.tagline1',
  'lite:voice.tagline2',
  'lite:voice.tagline3',
  'lite:voice.tagline4',
  'lite:voice.tagline5',
  'lite:voice.tagline6',
  'lite:voice.tagline7',
  'lite:voice.tagline8',
]

// Pick a random tagline KEY. Call once per mount (e.g. in a useState initializer)
// so it holds steady within a session but rotates on reload. Wrap with t() at use.
export function randomTagline() {
  return HOME_TAGLINES[Math.floor(Math.random() * HOME_TAGLINES.length)]
}

// Success toasts — fire only after a save; never sit beside a GC-facing amount.
export const TOASTS = {
  entryLogged: 'lite:voice.toastEntryLogged',
  itemSaved: 'lite:voice.toastItemSaved',
  jobCreated: 'lite:voice.toastJobCreated',
  gcAdded: 'lite:voice.toastGcAdded',
  settingsSaved: 'lite:voice.toastSettingsSaved',
}

// The done-for-today closing line: personality, placed away from the numbers.
export const DONE_CLOSER = 'lite:voice.doneCloser'

// Non-money empty states (jobs list, GC list). Money-empty states stay plain.
export const EMPTY = {
  jobs: 'lite:voice.emptyJobs',
  gcs: 'lite:voice.emptyGcs',
}
