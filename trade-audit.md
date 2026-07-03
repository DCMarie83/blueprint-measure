# Trade Vertical Expansion — Audit Findings

## 1. Signup Form — Trade Selector

**File:** `src/pages/SignupPage.jsx`

**State** (line 26): `const [tradeVertical, setTradeVertical] = useState('painting')`

**The `<select>`** (lines 168-172):
```jsx
<label htmlFor="tradeVertical">Trade</label>
<select id="tradeVertical" value={tradeVertical} onChange={e => setTradeVertical(e.target.value)} style={selectStyle}>
  <option value="painting">Painting</option>
</select>
```

Only one option: `painting`. The select exists but renders as a fixed single-option dropdown.

**Submitted as** (line 63): `trade_vertical: tradeVertical` inside `options.data` (Supabase auth user metadata), which `handle_new_user` reads.

---

## 2. Where Trade Lands

### companies.trade_vertical

**Column definition** (`20260511_p5_self_serve_signup.sql:11`):
```sql
ADD COLUMN IF NOT EXISTS trade_vertical text,
```

Plain `text` — **no CHECK constraint**. No enum, no restriction. Any string is accepted.

**Comment** (line 18): `'Trade vertical: painting, general, etc.'`

**Default in handle_new_user** (line 82): `v_trade := coalesce(meta->>'trade_vertical', 'painting')` — defaults to `'painting'` if not provided.

### pricing_categories.trade_vertical

Separate usage — pricing categories have their own `trade_vertical` column (`20260513_p6_estimate_foundation.sql:14`): `trade_vertical text NOT NULL DEFAULT 'painting'`. Tags pricing categories by trade.

### academy_videos.trade_vertical

(`20260617120000_academy.sql:35`): `trade_vertical text not null default 'all'` — filters academy content by trade.

---

## 3. handle_new_user — Trade + Features

`20260701120000_state_driven_founders_engine.sql:82,143,156,161`:

```sql
v_trade := coalesce(meta->>'trade_vertical', 'painting');
```

Inserted directly into companies. **Features JSONB comes from the plan row** (`v_plan.features`), NOT derived from the trade. All four plans have the same features object with `paint_calculator: true`.

**`paint_calculator: true` is baked into all plans.** It's not trade-dependent — every signup gets it regardless of trade_vertical.

---

## 4. paint_calculator — Who Reads It

**`src/hooks/useSession.js:50,63-68`**: Loads `company.features` from DB.

**Consumers:**
- `src/utils/exportData.js:6`: toggles paint columns in export
- `src/components/zones/ZoneList.jsx:426`: shows coat count in zone list
- `src/components/canvas/BlueprintCanvas.jsx:470`: shows coat count on canvas

These are DISPLAY toggles. With `paint_calculator: true`, a flooring contractor sees a "coats" option they can ignore.

**Safest default: keep `paint_calculator: true` for all trades.** Turning it off per-trade would require per-trade feature profiles (future build).

---

## 5. Where trade_vertical Is READ in App Code

| File | Line | Usage |
|---|---|---|
| `src/pages/AcademyPage.jsx` | 44 | Filters academy videos by trade |
| `src/data/academyVideos.js` | 54 | `v.trade_vertical === 'all' \|\| v.trade_vertical === tradeVertical` |
| `src/pages/PricingPage.jsx` | 16,33 | `trade_vertical` on pricing categories (create form) |
| `src/pages/admin/AcademyAdminPage.jsx` | 11,123,281,455 | Admin academy video trade_vertical field |
| `src/hooks/useDashboardData.js` | 24,87-88 | Getting Started checklist (`hasTradeVertical`) |
| `src/utils/measurements.js` | 198-209 | `estimateMaterials()` switch — only `'paint'` implemented; others return `[]` |
| `src/pages/SignupPage.jsx` | 26,63 | Signup form |

**Academy filtering** is the only user-facing branch. **`estimateMaterials`** has a TODO for other trades — it won't break, just won't auto-suggest materials.

---

## 6. Canonical Trade List

**None exists.** Free-text string throughout. Need to create a single source of truth.

---

## Summary

| Question | Answer |
|---|---|
| What changes to offer 6 trades? | Expand `<select>` options in `SignupPage.jsx` |
| DB migration needed? | **No.** `trade_vertical` is plain text, no CHECK |
| handle_new_user change? | **No.** Already reads `meta->>'trade_vertical'` |
| paint_calculator affected? | **No.** Features come from the plan, not trade |
| Single-source-of-truth? | Create `src/data/tradeVerticals.js` |

---

## Proposed Build Plan

### Phase 1: Canonical trade list
Create `src/data/tradeVerticals.js` with the 6 trades.

### Phase 2: Expand SignupPage dropdown
Import and map `TRADE_VERTICALS` in `SignupPage.jsx`.

### Phase 3: (Optional) Wire into PricingPage + AcademyAdminPage
Use same list for pricing category and academy video trade dropdowns.

**No migration. No handle_new_user change. No feature-flag change.**
