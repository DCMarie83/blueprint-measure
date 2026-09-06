# RivetDog - standing rules for all Claude Code work

## Execution policy
- Audit before code on non-trivial work: read the live components and hooks
  the route actually renders, report findings, then build. Five-state check
  before any fix (already fixed / fixed in repo not live / fixed in prod not
  repo / fixed then reverted / never addressed).
- No hotfixes, no placeholders, no "temporary" hardcodes. Complete
  implementations only; never truncate.
- Never commit, push, run supabase CLI, or make network calls (enforced by
  .claude/settings.json). Report changes; the operator ships.
- Smoke tests listed in every report, runnable on localhost against CCP Test.

## Platform rules
- Build for the platform, not the tenant: company_id scoping on every
  operational query, no hardcoded tenant references, subscription_status is
  the master access control.
- Detail fetches scope by company membership, never by user_id ownership.
  RLS is the enforcement layer.
- Client-facing side effects (emails, notifications) fire only from explicit
  labeled actions or confirm dialogs, never as ambient side effects.

## Money rules
- The file importer is the money writer. Document import attaches documents
  and fills blanks only: it never overwrites a non-blank total, subtotal,
  status, created_at, due_date, client_id, or notes.
- Status moves only via explicitly recognized values; unrecognized text
  skips the field, never downgrades to draft.
- Margin spec: estimated margin = quoted minus cost, percent over quoted;
  actual margin = billed minus cost, percent over billed; cash position =
  collected minus cost, value only, no percentage. Withhold percentages when
  the revenue term is 0 or no cost records exist; never render +100.0% from
  an empty side.
- Billed excludes draft and void invoices. Collected is the payments ledger.
  Quoted is accepted estimates via the resolved total (variant total
  falling back to good_total).
- Invoice line-item categories feed billed breakdowns as REVENUE, never
  cost. Cost = time entries + material orders + expenses.

## Hard technical rules
- AuthContext onAuthStateChange stays synchronous; never run async Supabase
  queries inside it; never log errors from inside it.
- RLS and SQL use auth.jwt()->>'email', never a subquery on auth.users.
- AI features run server-side via Supabase Edge Functions only; no API keys
  reach the client bundle; public-safe config lives in src/lib/config.js.
- Every Recurly API call pins 'Accept-Language': 'en-US'. Recurly webhooks
  authenticate via the ?secret= query param, Verify-JWT stays off, bodies
  parse via req.text() + regex until the B7 rewrite.
- Edge function changes require npx supabase functions deploy <name>; git
  push does not deploy them. Flag this in every report touching one.

## UI rules
- Any horizontally scrollable table or board mounts FloatingScrollbar
  (src/components/common/FloatingScrollbar.jsx; ScrollbarInside child
  variant for existing wrappers, targetRef where the container must stay
  transform-free like the Jobs Kanban).
- Design tokens always: palette Green #26464C / Gray #1B2426 / Orange
  #F27243, Telegraf headings, Inter body, JetBrains Mono, radius sm 4 / md 8
  / lg 12 / pill 9999. Use the CSS token variables, not raw values, where
  tokens exist.
- No em-dashes in any user-facing string.
- Dog puns are allowed only on action-response toasts and feedback strings.
  Zero puns on money, billing, legal, security, client-portal, and error
  surfaces.

## i18n rules
- Every new or changed user-facing string goes through i18n keys with
  English AND Spanish at the same time. Spanish register: tu app-wide,
  formal/impersonal only for legal-consent copy.
- Locked glossary: cotizacion (estimate), factura (invoice), contratista,
  cliente, cuadrilla (crew), marcar entrada/salida (clock in/out), recibo de
  pago (pay stub), trabajo (job), tablero de trabajos (jobs board), "gente
  del oficio" for trade pros in brand copy, never "pintores". Product names
  stay English.

## Import rules
- Upsert semantics: match keys are clients email>phone>name, jobs name,
  invoices invoice_number, estimates estimate_number, change orders
  co_number+project, crew name. Blanks never overwrite. One number = one
  record; never suffix, never widen a unique index to absorb a collision.
- Import writes stamp import_source. Imported weekly labor rows may exceed
  the 24h hours check only because import_source is set; never widen that
  check further.
