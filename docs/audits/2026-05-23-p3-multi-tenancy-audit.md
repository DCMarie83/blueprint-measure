# P3 Multi-Tenancy & Pricing Hardening — Audit Report

**Date:** 2026-05-23
**Sprint target:** Soft launch June 1
**Auditor:** Claude (automated recon pass)
**Status:** RECON ONLY — no code or schema changes made

---

## A. SCHEMA GAPS

### A1. Table Inventory — Tenant Isolation Status

#### Operational Tables (tenant-scoped data)

| Table | Has company_id / tenant_id? | RLS Enabled? | RLS Pattern | Status |
|-------|----------------------------|--------------|-------------|--------|
| `sessions` | NO — has `user_id` only | Yes | `auth.uid() = user_id` (user-scoped, not tenant-scoped) | 🚨 Critical |
| `zones` | NO — scoped via `session_id` FK | Yes | `EXISTS (SELECT 1 FROM sessions WHERE user_id = auth.uid())` (user-scoped) | 🚨 Critical |
| `projects` | YES — `company_id` | Yes | `auth.uid() = user_id` (user-scoped despite having company_id) | ⚠️ Important |
| `clients` | YES — `company_id` | Yes | `company_id IN (SELECT company_id FROM user_profiles WHERE user_id = auth.uid())` | ✅ Secure |
| `client_contacts` | Via `client_id` FK | Yes | Joins through clients → company_id → user_profiles | ✅ Secure |
| `kanban_columns` | YES — `company_id` | Yes | `company_id IN (SELECT company_id FROM user_profiles WHERE user_id = auth.uid())` | ✅ Secure |
| `estimates` | YES — `company_id` | Yes | `company_id IN (SELECT company_id FROM user_profiles WHERE user_id = auth.uid())` | ✅ Secure |
| `estimate_line_items` | Via `estimate_id` FK | Yes | Joins through estimates → company_id → user_profiles | ✅ Secure |
| `pricing_categories` | YES — `company_id` | Yes | `company_id IN (SELECT company_id FROM user_profiles WHERE user_id = auth.uid())` | ✅ Secure |
| `pricing_items` | YES — `company_id` | Yes | `company_id IN (SELECT company_id FROM user_profiles WHERE user_id = auth.uid())` | ✅ Secure |
| `user_profiles` | YES — `company_id` | Yes | `user_id = auth.uid() OR is_super_admin() OR (is_contractor_admin() AND company_id = current_user_company_id())` | ✅ Secure |
| `companies` | Self (id) | Yes | Portal anon policies only; no general SELECT policy for authenticated users found | ⚠️ Important |

#### System Tables

| Table | Has company_id? | RLS Enabled? | RLS Pattern | Status |
|-------|-----------------|--------------|-------------|--------|
| `client_errors` | YES — `company_id` | Yes | `is_super_admin() OR (is_contractor_admin() AND company_id = current_user_company_id())` | ✅ Secure |
| `error_alert_throttle` | NO (system-internal) | Yes | `USING (false)` — deny all authenticated | ✅ Secure |
| `users` (public.users) | YES — `company_id` | Yes | `auth.uid() = id` (user can read own row only) | ✅ Secure |

#### Reference Tables

| Table | Notes | Status |
|-------|-------|--------|
| `plans` | Shared lookup table for plan definitions. Queried from PlansSection admin UI. | ℹ️ Assumed OK — no RLS policy visible in migrations (likely admin-only via dashboard) |

### A2. Critical RLS Findings

**🚨 F-001: `sessions` table — no `company_id` column, user-scoped RLS only**
- File: `supabase_schema.sql:43-52`
- The `sessions` table has `user_id` but no `company_id`. RLS policies scope to `auth.uid() = user_id`.
- In a multi-seat company, User A cannot see User B's sessions even if they're in the same company.
- This is a **launch blocker for multi-seat**: teams need shared visibility of company sessions.
- **Fix:** Add `company_id uuid REFERENCES companies(id)`, backfill from `users.company_id` via `user_id`, rewrite RLS to tenant-scope via `user_profiles.company_id`.

**🚨 F-002: `zones` table — no `company_id`, inherits user-scoping from `sessions`**
- File: `supabase_schema.sql:64-93`
- Zones are scoped via `session_id → sessions.user_id = auth.uid()`. Same multi-seat isolation issue.
- **Fix:** After sessions gets `company_id`, zones RLS should join through sessions.company_id or add its own `company_id` column.

**⚠️ F-003: `projects` table — has `company_id` but RLS still uses `user_id`**
- File: `supabase/migrations/20260507130000_p6_foundation_projects_table.sql:84-93`
- Projects has `company_id` column but RLS policies are `auth.uid() = user_id` — user-scoped, not tenant-scoped.
- Multi-seat users in the same company cannot see each other's projects.
- **Fix:** Rewrite project RLS to `company_id IN (SELECT company_id FROM user_profiles WHERE user_id = auth.uid())`.

**⚠️ F-004: `companies` table — missing general SELECT policy for authenticated users**
- File: `supabase_schema.sql:132`
- RLS is enabled but only portal anon SELECT policies exist (from `20260513_p3_fix3_portal_view_security_invoker.sql`).
- Authenticated users can query companies only because `useSession.js` queries `companies` directly by ID and it works — likely via `current_user_company_id()` SECURITY DEFINER function bypassing RLS.
- **Fix:** Add explicit authenticated SELECT policy: `id IN (SELECT company_id FROM user_profiles WHERE user_id = auth.uid())`.

### A3. RLS Auth Pattern — No Bad Subquery Found

Searched entire `supabase/` for `SELECT email FROM auth.users WHERE id = auth.uid()` — **zero matches**. All policies correctly use either:
- `auth.uid()` directly (for user-scoped tables)
- `auth.jwt()->>'email'` (for super-admin checks)
- `user_profiles WHERE user_id = auth.uid()` subquery (for tenant-scoping)

### A4. Companies Table — Schema vs. Required Columns

**Current columns (from migrations + baseline):**

| Column | Type | Source |
|--------|------|--------|
| `id` | uuid PK | supabase_schema.sql |
| `name` | text NOT NULL | supabase_schema.sql |
| `created_at` | timestamptz | supabase_schema.sql |
| `plan` | text | 20260511_p5_self_serve_signup (set to 'basic' on self-serve) |
| `subscription_status` | text NOT NULL DEFAULT 'active' | 20260511_p5_self_serve_signup |
| `trade_vertical` | text | 20260511_p5_self_serve_signup |
| `trial_enabled` | boolean DEFAULT true | 20260511_p5_self_serve_signup |
| `trial_duration_days` | integer DEFAULT 14 | 20260511_p5_self_serve_signup |
| `trial_started_at` | timestamptz | 20260511_p5_self_serve_signup |
| `trial_ends_at` | timestamptz | 20260511_p5_self_serve_signup |
| `blueprint_limit` | integer | 20260511_p5_self_serve_signup (via features jsonb insert) |
| `features` | jsonb | 20260511_p5_self_serve_signup |
| `next_estimate_number` | integer DEFAULT 1 | 20260513_p6_estimate_foundation |
| `seat_limit_override` | integer | Referenced in CompaniesSection.jsx — likely added via dashboard |

**Columns PRESENT but tied to DEPRECATED concepts:**

| Column | Issue | Severity |
|--------|-------|----------|
| `plan` (text) | ⚠️ Stores old tier keys: 'basic', 'plus', 'ultra', 'founders', 'pilot'. New pricing has only 'founding_1000' + 'solo'. | ⚠️ Important |
| `blueprint_limit` (integer) | ⚠️ Per-plan limits — new pricing gives everyone the same limits (5GB, 2 seats). | ⚠️ Important |
| `features` (jsonb) | ⚠️ Per-company feature flags — new pricing gives all features to all paying tiers. | ⚠️ Important |

**Columns MISSING for new pricing + Stripe prep:**

| Column | Type | Purpose | Severity |
|--------|------|---------|----------|
| `founding_1000` | boolean DEFAULT false | Flag: is this a Founding 1000 member? | ⚠️ Important |
| `founding_member_number` | integer UNIQUE | Sequential 1-1000 number for founding members | ⚠️ Important |
| `nga_website_active` | boolean DEFAULT false | NGA referral website add-on active? | ℹ️ Low |
| `nga_website_tier` | text CHECK ('3pg', '5pg') | NGA website tier | ℹ️ Low |
| `stripe_customer_id` | text | Stripe customer reference | ⚠️ Important |
| `stripe_subscription_id` | text | Stripe subscription reference | ⚠️ Important |
| `stripe_price_id_monthly` | text | Stripe monthly price ID | ℹ️ Low (P4) |
| `stripe_price_id_annual` | text | Stripe annual price ID | ℹ️ Low (P4) |
| `logo_url` | text | White-label: tenant logo | ℹ️ Low |
| `primary_domain` | text | White-label: tenant custom domain | ℹ️ Low |
| `billing_email` | text | Billing contact email | ⚠️ Important |

**`subscription_status` allowed values — needs verification:**
- Currently stored as `text NOT NULL DEFAULT 'active'` with no CHECK constraint.
- Self-serve signup sets `'trialing'`.
- No enum or CHECK constraint limits the values.
- **Fix:** Add CHECK constraint: `subscription_status IN ('trialing', 'active', 'past_due', 'canceled', 'paused')`.

---

## B. DEPRECATED TIER REFERENCES

### B1. Must-Change (Live Code)

**🚨 F-005: `src/lib/plans.js` — entire file built around deprecated tiers**
- Lines 4-10: FALLBACK_PLANS defines `basic`, `plus`, `ultra`, `founders`, `pilot` with per-tier feature flags and limits
- Lines 40-52: `getStorageLimitMb()`, `getPlanDisplayName()` resolve by plan key
- Lines 57-62: `getPlanOptions()` generates dropdown options from old tiers
- Lines 65-74: `FEATURE_KEYS` lists 8 per-plan feature flags that become irrelevant when all tiers get all features
- **Risk:** This is the single source of truth for plan definitions. Must be rewritten for flat-tier model.
- **Fix:** Replace FALLBACK_PLANS with `founding_1000` and `solo` definitions. Both get all features, same limits.

**⚠️ F-006: `src/pages/admin/CompaniesSection.jsx` — old tier UI**
- Line 47: `useState('basic')` — new company defaults to 'basic' plan
- Line 80: `PLAN_FEATURES[company.plan]?.seat_limit` — resolves limits by old tier
- Line 110: `filtered.filter(c => c.plan === planFilter)` — filter by old tier keys
- Line 112: `localeCompare(b.plan)` — sort by old tier keys
- Lines 159-167: Save handler writes `plan`, `blueprint_limit`, `features` from old tier config
- Line 186-191: Insert new company with old tier's `blueprint_limit` and `features`
- Line 194: Reset to `'basic'` after save
- Line 345: `getPendingPlan(company.id, company.plan)` — display old tier in dropdown
- Lines 369-376: Plan dropdown populated from PLANS_LIST (old tier options)
- Line 398: `PLAN_FEATURES[company.plan]?.storage_limit_mb` — storage limit from old tier
- **Fix:** Simplify to founding_1000/solo selector; remove per-plan feature flag checkboxes (all features always on).

**⚠️ F-007: `src/pages/admin/PlansSection.jsx` — full plan CRUD admin UI**
- Entire file (233 lines): Admin UI for creating/editing/deleting plan definitions in `plans` DB table.
- Line 29: `companies.filter(c => c.plan === planKey).length` — counts companies per old tier
- Lines 57-78: Saves plan config including per-plan `features`, `seat_limit`, `blueprint_limit`, `storage_limit_mb`
- **Fix:** Simplify or deprecate. With flat pricing, this admin UI is mostly unnecessary.

**⚠️ F-008: `src/components/settings/ProfileTab.jsx:229` — displays plan name to user**
- `company?.plan ? getPlanDisplayName(company.plan) : '—'`
- User sees their plan tier name (e.g., "Basic", "Plus") in settings.
- **Fix:** Show "Founding 1000" or "Solo" based on new columns.

**⚠️ F-009: `src/pages/AccountPage.jsx:269` — displays plan name to user**
- Same pattern: `getPlanDisplayName(company.plan)`
- **Fix:** Same as F-008.

**⚠️ F-010: `src/components/admin/CompanyDrawer.jsx:30` — shows raw plan key**
- `<span className={styles.planBadge}>{company.plan}</span>`
- **Fix:** Use display name from new tier definitions.

**⚠️ F-011: `src/pages/SessionPage.jsx` — imports `getStorageLimitMb`**
- Uses plan-based storage limit for upload validation.
- **Fix:** Read from new flat limit (5GB for all tiers).

**⚠️ F-012: `src/pages/ProjectDetailPage.jsx` — imports `getStorageLimitMb`**
- Same pattern.
- **Fix:** Same as F-011.

**⚠️ F-013: `handle_new_user` trigger — hardcodes `plan: 'basic'`**
- File: `supabase/migrations/20260515_p3_fix_handle_new_user_public_users_insert.sql:57`
- Self-serve signup creates company with `plan = 'basic'` and basic-tier features.
- **Fix:** New self-serve should create with appropriate new tier + all features enabled.

### B2. Acceptable (Comments, Historical Migrations)

- `src/lib/plans.js:66` — `{ key: 'blueprint_measurement', label: 'Blueprint Measurement' }` — feature name, not a brand reference. Keep.
- Historical migration files (20260511_p5_self_serve_signup.sql, etc.) — these document schema evolution. Keep as-is.

---

## C. FEATURE GATING

### C1. Current Feature Gate Architecture

Features are gated via `companies.features` (JSONB dictionary). The flow:

1. `useSession.js:56-68` — Queries `user_profiles.company_id`, then `companies.features`
2. Stores result in `enabledFeatures` state
3. Components check `enabledFeatures.ai_scale_detection`, `enabledFeatures.wall_calculator`, etc.
4. Super-admin bypass: `useSession.js:44` — `if (user.email === 'main@ngautomationhub.com')` gets all features hardcoded true

### C2. Feature Gate Locations

| File | Line(s) | Feature Gated | Current Check | Needs Update? |
|------|---------|---------------|---------------|---------------|
| `src/hooks/useSession.js` | 44-54 | All features | Super-admin hardcoded email check | ⚠️ Keep bypass but update company feature loading for flat-tier |
| `src/hooks/useSession.js` | 62-68 | All features | `company?.features ?? {}` | ⚠️ With flat pricing, all paying tenants get `{}` → all true. Need default-true logic. |
| `src/pages/SessionPage.jsx` | 400 | AI scale detection | `enabledFeatures?.ai_scale_detection` | ⚠️ Same |
| `src/pages/SessionPage.jsx` | 1539 | Test mode | `isAdmin \|\| enabledFeatures?.test_mode` | ⚠️ Same |

### C4. `subscription_status` Gating

**🚨 F-014: `subscription_status` is never checked in frontend code**
- Searched `src/` for `subscription_status`: **zero matches**.
- The field exists on companies but nothing in the app currently blocks access for `canceled` or `past_due` subscriptions.
- **Fix:** Add a global access gate (likely in `AuthContext` or a wrapper component) that checks `subscription_status` and shows a "reactivate" screen for non-active statuses. This is the Stripe webhook integration point for P4.

### C5. Flat-Tier Migration Strategy

With the new pricing (Founding 1000 and Solo both get all features):
- The `features` JSONB can be simplified: all keys default to `true` for any paying subscriber.
- `blueprint_limit`, `seat_limit`, `storage_limit_mb` become flat values (not per-plan lookups).
- The `plan` column on companies becomes a simple label ('founding_1000' or 'solo'), not a feature-gate key.
- **Recommended:** Keep the `features` JSONB for admin override capability (super-admin can disable specific features for a problem tenant), but default all to true.

---

## D. WHITE-LABEL READINESS

### D1. Tenant-Facing Output with Hardcoded "RivetDog"

| File | Line(s) | Text | Surface | Severity |
|------|---------|------|---------|----------|
| `src/pages/PortalPage.jsx` | 68 | `Powered by RivetDog` | Client portal error page | ⚠️ Important |
| `src/pages/PortalPage.jsx` | 118 | `Powered by RivetDog` | Client portal footer | ⚠️ Important |
| `supabase/functions/send-estimate-email/index.ts` | 158 | `Powered by RivetDog` | Estimate email footer (client-facing) | ⚠️ Important |
| `supabase/functions/send-estimate-email/index.ts` | 170 | `from: 'RivetDog <noreply@rivetdog.com>'` | Estimate email sender name | ⚠️ Important |
| `supabase/functions/send-portal-email/index.ts` | 107 | `Powered by RivetDog` | Portal invite email footer | ⚠️ Important |
| `supabase/functions/send-portal-email/index.ts` | 119 | `from: 'RivetDog <noreply@rivetdog.com>'` | Portal email sender name | ⚠️ Important |
| `supabase/functions/notify-estimate-response/index.ts` | 104 | `Powered by RivetDog` | Estimate response notification | ℹ️ Low (internal) |
| `supabase/functions/notify-estimate-response/index.ts` | 116 | `from: 'RivetDog <noreply@rivetdog.com>'` | Notification sender | ℹ️ Low (internal) |

### D2. Good Patterns Already in Place

These correctly use dynamic tenant branding:
- `src/lib/generateEstimatePDF.js:51` — `company?.name || 'Your Contractor'` for PDF header
- `src/pages/PortalPage.jsx:78` — `data.company_name || 'Your Contractor'` for portal header
- `supabase/functions/send-estimate-email/index.ts:103` — `company?.name || 'Your Contractor'` for email header
- `supabase/functions/send-portal-email/index.ts:92` — same pattern

### D3. Platform-Level Brand (Should Stay "RivetDog")

These are correctly RivetDog-branded (platform, not tenant):
- `src/lib/config.js:5` — `BRAND.name = 'RivetDog'`
- `src/components/AppHeader.jsx:38` — `aria-label="RivetDog home"`
- `src/pages/AcademyPage.jsx:25-26` — Academy feature branding
- `src/components/dashboard/QuickActionsRow.jsx:51` — Academy card
- `public/manifest.json` — PWA manifest
- Login, signup, terms, privacy pages — all platform-level

### D4. Missing White-Label Infrastructure

| Item | Current State | Needed | Severity |
|------|--------------|--------|----------|
| `companies.logo_url` | Column doesn't exist in schema | Tenant logo for estimates, portal, emails | ⚠️ Important |
| `companies.primary_domain` | Column doesn't exist | Custom domain support | ℹ️ Low (post-launch) |
| Estimate PDF logo | TODO comment at `generateEstimatePDF.js:68` | Render tenant logo in PDF header | ⚠️ Important |
| Email template logo | No logo in any email HTML | Add tenant logo to email header | ℹ️ Low |
| `FEATURE_FLAGS.whiteLabel` | `false` in `src/lib/config.js:22` | Flip to enable tenant branding features | ℹ️ Low |

---

## E. AUTH-COMPANY LINKAGE

### E1. How Users Get Linked to Companies

**Path 1: Self-Serve Signup** (`handle_new_user` trigger)
1. User signs up with `signup_path: 'self_serve'` in metadata
2. Trigger creates NEW `companies` row (atomically)
3. Trigger creates `user_profiles` row with `company_id` = new company
4. Trigger creates `public.users` row (unconditional, all paths)
5. **Result:** User always has company. Fails atomically if `company_name` missing.

**Path 2: Admin Invite** (`admin-user-actions` Edge Function)
1. Admin calls invite action with target `company_id`
2. Edge function calls `auth.admin.inviteUserByEmail(email)`
3. Edge function inserts `user_profiles` row with explicit `company_id`
4. `handle_new_user` trigger fires → creates `public.users` row
5. **Result:** User has company if edge function completes fully.

**Path 3: Admin Create** (same Edge Function, `action: 'create'`)
- Same as Path 2 but password is set immediately.

### E2. Gaps in Auth-Company Linkage

**⚠️ F-015: Admin invite can orphan users if edge function fails mid-execution**
- File: `supabase/functions/admin-user-actions/index.ts`
- If the function creates the auth user (step 2) but the `user_profiles` INSERT fails (step 3 — network error, constraint violation), the user exists in `auth.users` and `public.users` but has NO `user_profiles` row and NO `company_id`.
- AuthContext would fail to fetch profile → `setupComplete` returns `true` (fail-open at `AuthContext.jsx:77`) → user can authenticate but has no company context, sees empty/broken dashboard.
- **Fix:** Wrap invite in a transaction or add a recovery check: if `user_profiles` insert fails, delete the auth user. Alternatively, add a frontend guard that redirects to a "contact admin" page if `userProfile` is null after auth.

**⚠️ F-016: `public.users.company_id` can drift from `user_profiles.company_id`**
- `public.users` has its own `company_id` column (from `supabase_schema.sql:29`).
- Sync migration `20260515_p3_sync_public_users_company_id.sql` was a one-time backfill.
- No trigger keeps them in sync. If admin reassigns a user's company via `user_profiles`, `public.users.company_id` stays stale.
- Most code reads from `user_profiles.company_id` (correct), but `public.users.company_id` could cause confusion.
- **Fix:** Either drop `company_id` from `public.users` (since `user_profiles` is the source of truth) or add a trigger to sync.

**ℹ️ F-017: AuthContext doesn't expose `company_id` directly**
- File: `src/context/AuthContext.jsx:62`
- Returns `userProfile` object but not `company_id` directly. Components must access `userProfile?.company_id`.
- Not a bug, but a convenience gap. Components like `useSession.js:57-61` make a separate query for `company_id` instead of using context.
- **Fix:** Add `companyId: userProfile?.company_id` to context value for convenience, and provide it to hooks that currently re-fetch it.

---

## F. RECOMMENDED IMPLEMENTATION ORDER

Ordered by risk and dependency — schema migrations first since they enable everything else.

### Phase 1: Schema Migrations (Week 1)

| Priority | Finding | Action | Dependency |
|----------|---------|--------|------------|
| 1 | F-001 | Add `company_id` to `sessions` table, backfill from `users.company_id` via `user_id` | None |
| 2 | F-003 | Rewrite `projects` RLS to tenant-scope via `company_id` instead of `user_id` | None |
| 3 | F-001, F-002 | Rewrite `sessions` + `zones` RLS to tenant-scope | Depends on #1 |
| 4 | F-004 | Add explicit authenticated SELECT policy to `companies` | None |
| 5 | A4 | Add `subscription_status` CHECK constraint | None |
| 6 | A4 | Add Stripe columns: `stripe_customer_id`, `stripe_subscription_id`, `billing_email` | None |
| 7 | A4 | Add founding columns: `founding_1000`, `founding_member_number` | None |
| 8 | A4 | Add white-label columns: `logo_url` | None |

### Phase 2: Pricing Model Refactor (Week 1-2)

| Priority | Finding | Action | Dependency |
|----------|---------|--------|------------|
| 9 | F-005 | Rewrite `src/lib/plans.js` — replace FALLBACK_PLANS with founding_1000 + solo definitions, all features true | None |
| 10 | F-013 | Update `handle_new_user` trigger — new self-serve creates with correct tier + all features | Depends on #9 |
| 11 | F-006 | Simplify CompaniesSection.jsx — founding_1000/solo selector, remove per-plan feature toggles | Depends on #9 |
| 12 | F-007 | Simplify or deprecate PlansSection.jsx admin UI | Depends on #9 |
| 13 | F-008, F-009, F-010 | Update ProfileTab, AccountPage, CompanyDrawer to show new tier names | Depends on #9 |
| 14 | F-011, F-012 | Update SessionPage, ProjectDetailPage storage limit to flat 5GB | Depends on #9 |

### Phase 3: Access Control (Week 2)

| Priority | Finding | Action | Dependency |
|----------|---------|--------|------------|
| 15 | F-014 | Add `subscription_status` global gate in frontend — block access for canceled/past_due | Depends on #5 |
| 16 | F-015 | Add admin-invite error recovery — delete auth user if profile insert fails | None |
| 17 | F-016 | Drop or sync `public.users.company_id` with `user_profiles.company_id` | None |

### Phase 4: White-Label & Polish (Week 2-3)

| Priority | Finding | Action | Dependency |
|----------|---------|--------|------------|
| 18 | D1 | Replace hardcoded "Powered by RivetDog" in portal + emails with `company.name` fallback | Depends on #8 |
| 19 | D1 | Replace hardcoded email `from:` name with `company.name` in estimate/portal emails | None |
| 20 | D4 | Implement tenant logo rendering in estimate PDF (`generateEstimatePDF.js:68` TODO) | Depends on #8 |

---

## Appendix: Summary Statistics

- **Total tables audited:** 15
- **Tables with critical RLS gaps:** 2 (sessions, zones)
- **Tables with important RLS gaps:** 1 (projects)
- **companies columns missing for new pricing:** 10+
- **Deprecated tier references in live code:** 13 files
- **Hardcoded "RivetDog" in tenant-facing output:** 8 locations
- **`subscription_status` frontend checks:** 0 (critical gap)
- **Bad RLS subquery pattern:** 0 (clean)
