# Pre-Bracket-B Audit — Multi-Tenancy Hardening + Invoicing Scaffold

Generated: 2026-05-15

---

## 1. Table Inventory from Migrations

Tables created in `supabase/migrations/`. Tables created before the tracked migrations (sessions, zones, companies, user_profiles, feedback, client_errors) are noted separately.

### Tables with CREATE TABLE in migrations

| Table | company_id | RLS Enabled | Policy Count | Migration |
|-------|-----------|-------------|-------------|-----------|
| projects | yes (was tenant_id, renamed) | yes | 4 | 20260507130000 |
| clients | yes | yes | 4 | 20260511_p6_kanban_prep |
| kanban_columns | yes | yes | 4 | 20260511_p6_kanban_prep |
| client_contacts | no (FK via client_id→clients) | yes | 4 | 20260512_p6_client_foundation |
| pricing_categories | yes | yes | 7 (4 original + 3 admin-only replacements) | 20260513_p6_estimate_foundation |
| pricing_items | yes | yes | 7 (4 original + 3 admin-only replacements) | 20260513_p6_estimate_foundation |
| estimates | yes | yes | 7 (4 original + 3 admin-only replacements) | 20260513_p6_estimate_foundation |
| estimate_line_items | no (FK via estimate_id→estimates) | yes | 4 | 20260513_p6_estimate_foundation |
| error_alert_throttle | no | yes | 0 (RLS on, no policies!) | 20260505120000 |

### Tables referenced in code but created before tracked migrations

| Table | company_id | Notes |
|-------|-----------|-------|
| companies | n/a (IS the tenant) | Root tenant table |
| user_profiles | has company_id (via code refs) | Created pre-migrations, policies in 20260505130000 |
| sessions | no | FK via project_id→projects. No company_id column in migrations. |
| zones | no | FK via session_id→sessions. No company_id column in migrations. |
| client_errors | has tenant_id (not renamed to company_id) | Index references `tenant_id`, policy in 20260505120000 |
| feedback | unknown | Referenced in FeedbackButton.jsx, FeedbackSection.jsx |
| feedback_responses | unknown | Referenced in FeedbackSection.jsx |

---

## 2. Tables Missing company_id (Multi-Tenancy Gaps)

| Table | Recommendation | Reasoning |
|-------|---------------|-----------|
| sessions | **Indirect (OK)** | Scoped via session→project→company. RLS should chain through project_id. |
| zones | **Indirect (OK)** | Scoped via zone→session→project→company. Double-hop FK chain. |
| client_contacts | **Indirect (OK)** | Scoped via client_contacts→clients→company. Single-hop FK. |
| estimate_line_items | **Indirect (OK)** | Scoped via line_items→estimates→company. RLS already checks this chain. |
| client_errors | **Direct — needs rename** | Has `tenant_id` (old naming). Should be renamed to `company_id` for consistency. |
| error_alert_throttle | **Skip** | System-level throttle table, no tenant data. But has RLS enabled with 0 policies — **potential lockout risk** (no one can read/write). |
| feedback | **Audit needed** | Table created before tracked migrations. Unknown schema. |
| feedback_responses | **Audit needed** | Referenced in admin code. Unknown schema. |

---

## 3. Companies Table — Current Columns

| Column | Type | Status |
|--------|------|--------|
| id | uuid PK | Done |
| name | text NOT NULL | Done |
| created_at | timestamptz | Done |
| plan | text | Done |
| subscription_status | text NOT NULL DEFAULT 'active' | Done (CHECK: pilot, active, trialing, past_due, suspended, churned) |
| trade_vertical | text | Done |
| trial_enabled | boolean DEFAULT true | Done |
| trial_duration_days | integer DEFAULT 14 | Done |
| trial_started_at | timestamptz | Done |
| trial_ends_at | timestamptz | Done |
| blueprint_limit | integer | Done |
| features | jsonb | Done |
| next_estimate_number | integer DEFAULT 1 | Done |

### Missing for launch target

| Column | Type | Status |
|--------|------|--------|
| stripe_customer_id | text | **Missing** |
| stripe_subscription_id | text | **Missing** |
| logo_url | text | **Missing** (PDF generator has TODO comments for this) |
| primary_color | text | **Missing** (white-label) |
| white_label_enabled | boolean | **Missing** |
| custom_domain | text | **Missing** |
| address | text/jsonb | **Missing** (PDF generator has TODO for company address) |
| phone | text | **Missing** |
| email | text | **Missing** |

---

## 4. Hardcoded Tenant References

### "ccp", "central custom", "ccpaintingllc"
No matches found anywhere in src/ or supabase/.

### "main@ngautomationhub.com" — Super Admin References
**8 source files + 5 migration files + 5 edge functions:**

**Source (used for isAdmin / isSuperAdmin checks):**
- `src/App.jsx:42` — ADMIN_EMAIL constant
- `src/components/UserMenu.jsx:9` — ADMIN_EMAIL constant
- `src/pages/ProjectDetailPage.jsx:42` — inline isAdmin check
- `src/pages/EstimateDetailPage.jsx:49` — inline isAdmin check
- `src/pages/SessionPage.jsx:36` — inline super admin check
- `src/hooks/useSession.js:44` — inline check
- `src/hooks/useSessions.js:34` — inline check
- `src/pages/admin/UserDetailPage.jsx:9` — ADMIN_EMAIL constant

**Migrations (RLS policies — `auth.jwt()->>'email' = 'main@ngautomationhub.com'`):**
- 20260505120000 (2 policies)
- 20260505130000 (1 policy)
- 20260511_p6_kanban_prep (8 policies)
- 20260512_p6_client_foundation (4 policies)
- 20260513_p6_estimate_foundation (16 policies)
- 20260513_p6_estimate_builder (9 policies)

**Edge Functions:**
- send-estimate-email/index.ts:68
- admin-users/index.ts:12
- send-feedback-response-email/index.ts:3
- admin-user-actions/index.ts:54
- notify-critical-error/index.ts:4

### Hardcoded UUIDs
No hardcoded UUIDs found in source files (src/, supabase/functions/).

---

## 5. Invoicing Prep

### Invoices table
**Does not exist.** No `CREATE TABLE.*invoices` found in any migration file.

### accept_estimate RPC — Post-Accept Actions
Located in `supabase/migrations/20260515_p6_estimate_portal.sql:89-152`.

Post-accept actions:
1. Sets `estimates.status = 'accepted'`, `accepted_at = now()`
2. Clears decline fields: `decline_reason = NULL`, `declined_at = NULL`
3. Resets `response_notified_at = NULL`
4. **Auto-moves project** to "Accepted" kanban column (position 5): `UPDATE projects SET kanban_column_id = v_accepted_col`
5. No invoice creation, no payment trigger, no notification (notification is fire-and-forget from client JS after RPC returns)

### Project kanban references in src/

| File | Line | Reference |
|------|------|-----------|
| src/hooks/useOpportunities.js | 20 | Fetches kanban_columns |
| src/hooks/useOpportunities.js | 44 | Filters projects by kanban_column_id |
| src/hooks/useOpportunities.js | 78 | Optimistic kanban_column_id update on drag |
| src/hooks/useOpportunities.js | 90 | DB update kanban_column_id on drag |
| src/hooks/useSessions.js | 86 | Fetches first kanban column for new session |
| src/hooks/useSessions.js | 100 | Sets kanban_column_id on project create |
| src/hooks/useProjects.js | 60 | Fetches first kanban column for new project |
| src/hooks/useProjects.js | 74 | Sets kanban_column_id on project create |
| src/hooks/useDashboardData.js | 22 | Selects kanban_column_id on projects |
| src/hooks/useDashboardData.js | 25 | Fetches kanban_columns with position |
| src/hooks/useDashboardData.js | 59 | Filters projects by kanban_column_id |
| src/hooks/useClient.js | 37 | Selects kanban_column_id on client's projects |
| src/pages/KanbanPage.jsx | 140 | Filter by kanban_column_id |
| src/pages/KanbanPage.jsx | 152 | Group projects by kanban_column_id |
| src/components/jobs/JobsListView.jsx | 30 | Lookup column name by kanban_column_id |

---

## 6. Pre-Launch UX Queue Status

| Item | Status | Details |
|------|--------|---------|
| portal_view security_invoker=on | **Not Started** | Currently `security_invoker = off` in 20260513_p6_portal_foundation.sql:19 |
| estimate_line_items admin-only RLS | **Not Started** | Current policies allow any company user to INSERT/UPDATE/DELETE. No contractor_admin role check. Should be split like pricing_items was. |
| "Hello [client_name]" salutation | **Not Started** | PortalEstimateSection.jsx has no greeting/salutation. |
| Save button prominence | **Done** | Uses `styles.saveBtn` — primary color background, 9px/20px padding, 600 weight. Appropriate size relative to other buttons. |
| Feedback closed-loop | **In Progress** | `feedback_responses` table exists, admin can respond via FeedbackSection.jsx. Unknown if user sees the response. |
| Timezone preferences | **Done** | Column on user_profiles (IANA format), PreferencesTab.jsx has selector, formatDate.js uses it, browser fallback via userPrefs.js. |
| Canvas zoom/scale | **Done** | BlueprintCanvas.jsx has transformRef with scale (1-10), scroll-wheel zoom, fit-to-canvas, pan. |
| Storage bar location | **Done (inline)** | StorageBar.jsx component exists, currently used inside MultiFileUploader.jsx. Target = Settings/Company page (not moved yet). |

---

## 7. Open Questions / Risks

### Critical

1. **error_alert_throttle has RLS enabled with 0 policies** — No one can read or write this table. If any code tries to insert throttle records, it will silently fail. Either add policies or disable RLS on this system table.

2. **client_errors still uses `tenant_id`** (not renamed to `company_id`) — Index references `tenant_id`. The P3 multi-tenancy rename from tenant_id→company_id missed this table.

3. **portal_view uses `security_invoker = off`** — This means the view runs as the view OWNER (postgres), bypassing RLS on underlying tables. Functional but a security audit flag. Should be flipped to `on` with appropriate grants, or left off with a documented justification.

4. **estimate_line_items RLS allows any company user to mutate** — Should mirror the admin-only pattern applied to pricing_items and estimates in 20260513_p6_estimate_builder.sql.

### Medium

5. **Super admin email hardcoded in 8+ source files** — Should be centralized to a single constant (already exists as `ADMIN_EMAIL` in App.jsx and UserMenu.jsx, but other files inline it). Consider moving to config.js.

6. **sessions and zones tables have no company_id** — Rely on FK chain through projects. This is fine for RLS if the policies correctly join through the chain, but worth verifying the actual deployed RLS policies (not in tracked migrations).

7. **No invoices table** — Invoicing scaffold is greenfield. The accept_estimate RPC is the natural trigger point for auto-creating an invoice on acceptance.

8. **get_portal_estimate RPC needs updating** — Missing `terms`, `deposit_amount`, `selected_variant` fields (flagged in previous session, SQL provided but not yet run by Dee).

### Low

9. **StorageBar is inline in MultiFileUploader** — Target location is Settings/Company page per spec. Low priority cosmetic move.

10. **Feedback closed-loop unknown** — Admin can respond via FeedbackSection, but unclear if the submitting user ever sees the response in their UI.

11. **`good_total` shown as default in ProjectDetailPage estimates list** (line 272) — Should show the selected_variant total when set, not always Good.
