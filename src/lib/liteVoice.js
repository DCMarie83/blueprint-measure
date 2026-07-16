// Central Lite voice — the RivetDog dog-pun personality, in ONE place so the
// quarterly copy refresh is a single-file edit. This matches the main app's
// register: puns live on SAFE surfaces only (success toasts, non-money empty
// states, the home greeting, the done-for-today closer). Money and GC-facing
// surfaces — invoices, sends, mark-paid, rates, totals, anything a GC ever sees
// — stay serious and import NOTHING from here.

// Home taglines — dog-voiced, work-forward. One is picked at random per load, so
// the greeting feels fresh across reloads. Refresh this list quarterly.
export const HOME_TAGLINES = [
  "Let's get it on the books.",
  'Every board, every hour, counted.',
  "Time to go fetch what you're owed.",
  'Sniff out every billable minute.',
  'Log it today, hunt down the check later.',
  'No hour left buried in the yard.',
  'Sniffing out every dollar.',
  "Good dogs get paid. Let's log it.",
]

// Pick a random tagline. Call once per mount (e.g. in a useState initializer) so
// it holds steady within a session but rotates on reload.
export function randomTagline() {
  return HOME_TAGLINES[Math.floor(Math.random() * HOME_TAGLINES.length)]
}

// Success toasts — fire only after a save; never sit beside a GC-facing amount.
export const TOASTS = {
  entryLogged: 'Logged it — good dog!',
  itemSaved: 'New item saved — good dog!',
  jobCreated: 'New job started — go fetch!',
  gcAdded: 'GC added — now go dig up some work!',
  settingsSaved: 'Saved — good dog!',
}

// The done-for-today closing line: personality, placed away from the numbers.
export const DONE_CLOSER = 'Nice work — go rest those paws.'

// Non-money empty states (jobs list, GC list). Money-empty states stay plain.
export const EMPTY = {
  jobs: 'No jobs yet — go dig one up.',
  gcs: 'No GCs on your roster yet — go fetch your first one.',
}
