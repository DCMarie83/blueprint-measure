# Toolbar V1 Audit — Measurement Workspace Redesign Intel

Generated: 2026-05-13

---

## 1. Current Measurement Page Structure

**Main component:** `src/pages/SessionPage.jsx` (1,747 lines)

### Layout: 2-panel + floating controls

```
+--[ 280px sidebar (fixed) ]--+--[ Canvas (flex-fill) ]----------+
|  Breadcrumb / UserMenu       |  BlueprintCanvas.jsx             |
|  Save status + Save btn      |    - pan/zoom via mouse/scroll   |
|  BlueprintUploader / Replace  |    - zone drawing (click points) |
|  PdfPageSelector (multi-page) |    - label drag                  |
|  ScalePanel                   |                                  |
|  ZoneDrawPanel (add zone)     |  Floating over canvas:           |
|  ZoneList (all zones)         |    - Reset View btn              |
|  Calibration banner           |    - Straight Lines ON/OFF btn   |
|  Test Results (admin only)    |    - AI scale detection banner   |
|  Page Total (collapsible)     |    - Drawing hint text           |
|  Download btns (PDF)          |    - Large PDF warning toast     |
|  Export CSV btn               |                                  |
+-------------------------------+----------------------------------+
```

No right panel exists. No dedicated top toolbar exists.

### Interactive controls per section

**Sidebar header:**
- Breadcrumb nav (Dashboard > Project > Session)
- UserMenu dropdown
- Save status indicator (dot + text)
- Save button
- Test Mode toggle (admin only)

**Blueprint section:**
- BlueprintUploader (when no blueprint)
- "Replace" button (when blueprint loaded)
- "Add blueprint to this Job" button

**PDF page selector (multi-page only):**
- Page thumbnail buttons (1 per page, with zone count badge)
- "Edit Pages" button

**ScalePanel (when blueprint loaded):**
- Scale dropdown (1/8", 1/4", 3/8", ... Manual)
- Manual calibration text input + "Set Calibration Line" button
- "Rescale existing zones" button
- Scale sanity pill (green/amber/red) + info popover
- AI Detect Scale button (Plus plan)
- Confirm PDF Scale toggle (admin only)
- Collapsible "How to set scale" help

**ZoneDrawPanel (when blueprint + scale set):**
- Zone name input (required)
- Description input (optional)
- Surface type dropdown (Wall, Ceiling, Trim, Door, etc.)
- Ceiling type dropdown (Flat, Vaulted, Tray, Shed) — conditional
- Vaulted/Tray/Shed sub-fields (heights, pitch, perimeter, depth) — conditional
- Wall height input + opening deductions (Door/Window/Custom) — conditional
- Coat toggle (1/2 coats) — conditional
- Measurement type toggles: SF / LF / count
- Zone color picker: Auto button + 14 preset swatches
- "Start Drawing" submit button

**ZoneDrawPanel (active drawing state):**
- Status display (points placed / segments / items counted)
- Real-time ceiling SF or wall SF preview — conditional
- "Finish Zone" / "Finish Segment" button
- "Undo Last Point" button
- "Cancel" / "Cancel All" button
- "+ Add Another Segment" (accumulation mode)
- "Done — Save Zone" (accumulation mode)

**ZoneList (per zone):**
- Eye icon toggle (show/hide on canvas)
- Expand/collapse chevron
- Edit / Redraw / Remove / Test buttons
- Full edit form (mirrors ZoneDrawPanel fields + notes + surface finish)
- Test panel (admin only): segment inputs, verdict, log button

**Calibration banner (auto-appears on test failures):**
- Known distance input
- "Start Calibration" button

**Page Total (collapsible footer):**
- SF / LF / count totals for current page

**Download/Export:**
- "Clean PDF" button
- "With Zones" button
- "Export CSV" button

**Floating canvas controls:**
- "Reset view" button
- "Straight Lines ON/OFF" toggle (keyboard: O)
- AI scale detection banner (dismissable)
- Drawing hint text (context-dependent)

---

## 2. Left Panel Controls — Categorized

### TOOLBAR candidates (VERB — actions/tools moving to horizontal bar)

| Control | Current Location | Proposed Cluster | Notes |
|---------|-----------------|-----------------|-------|
| Save button + status | Sidebar header | Cluster 1 (File) | Move indicator + button |
| Replace blueprint | Sidebar blueprint section | Cluster 1 (File) | "Add Blueprint" equivalent |
| Scale dropdown | ScalePanel | Cluster 5 (Cal/Units) | Direct move |
| Manual calibration trigger | ScalePanel | Cluster 5 (Cal/Units) | "Recalibrate" button |
| AI Detect Scale | ScalePanel | Cluster 5 (Cal/Units) | Could merge with Recalibrate |
| Measurement type toggles (SF/LF/count) | ZoneDrawPanel | Cluster 3 (Tools) | These are tool modes |
| Zone color picker | ZoneDrawPanel | Cluster 4 (Style) | Color picker |
| Coat toggle (1/2) | ZoneDrawPanel | Cluster 4 (Style) | Stroke-adjacent |
| Reset View | Floating on canvas | Cluster 6 (View) | Already a standalone button |
| Straight Lines toggle | Floating on canvas | Cluster 3 (Tools) | Ortho snap modifier |
| Finish Zone / Undo / Cancel | Floating on canvas + sidebar | Cluster 3 (Tools) | Drawing action buttons |
| Export CSV | Sidebar bottom | Cluster 8 (Collab/Out) | Export action |
| Download PDF buttons | Sidebar bottom | Cluster 8 (Collab/Out) | Export action |

### KEEP_LEFT candidates (NOUN — inventory/state/properties)

| Control | Reason |
|---------|--------|
| ZoneList (all zones) | Zone inventory — list of created items |
| Zone edit form | Properties of selected zone — stays in panel |
| Zone show/hide toggles | Per-zone state |
| Zone expand/collapse | Navigation pattern |
| Page Total summary | Aggregated state display |
| PdfPageSelector thumbnails | Page navigation (could also go to Cluster 6) |
| Test panel + test results | Admin workflow, too complex for toolbar |
| Calibration banner | Contextual alert, not a persistent control |

### RIGHT_PANEL candidates (properties — future)

| Control | Reason |
|---------|--------|
| Zone name / description inputs | Selected-zone properties |
| Surface type / ceiling type dropdowns | Selected-zone properties |
| Wall height + opening deductions | Selected-zone properties |
| Vaulted/Tray/Shed sub-fields | Selected-zone properties |
| Zone notes | Selected-zone properties |
| Zone color (in edit mode) | Selected-zone property |
| Surface finish (Smooth/Textured) | Selected-zone property |

### REMOVE candidates

| Control | Reason |
|---------|--------|
| Confirm PDF Scale (admin toggle) | Admin diagnostic — move to dev tools or remove |
| Scale diagnostic panel (admin only) | Admin diagnostic — move to dev tools or remove |
| "Add blueprint to this Job" button | Redundant with Replace/Upload |

---

## 3. State and Ref Dependencies

### State ownership map

| State | Owner | Location | Persistence |
|-------|-------|----------|-------------|
| `isDrawing` | SessionPage | useState (line 80) | Ephemeral |
| `activeZoneMeta` | SessionPage | useState (line 81) | Ephemeral |
| `drawnPoints` | SessionPage | useState (line 82) | Ephemeral |
| `redrawingZoneId` | SessionPage | useState (line 83) | Ephemeral |
| `isAccumulating` | SessionPage | useState (line 89) | Ephemeral |
| `finishedSegments` | SessionPage | useState (line 88) | Ephemeral |
| `pageScales` | SessionPage | useState (line 71) | DB: `sessions.page_scales` (JSONB) |
| `pixelsPerFoot` | SessionPage | Derived from pageScales[currentPage] | — |
| `calibrating` | SessionPage | useState (line 73) | Ephemeral |
| `pendingCalibFeet` | SessionPage | useState (line 74) | Ephemeral |
| `color` | ZoneDrawPanel | useState (line 43) | Ephemeral (saved per zone on create) |
| `transformRef` | BlueprintCanvas | useRef (line 42) | Ephemeral (reset on load) |
| `isPanning` / `isRightPanning` | BlueprintCanvas | useRef (lines 46, 52) | Ephemeral |
| `hiddenZoneIds` | SessionPage | useState (Set) | Ephemeral |
| `editingId` | ZoneList | Internal state | Ephemeral |
| `isTestMode` | SessionPage | useState | Ephemeral |
| `session` / `zones` | useSession hook | Supabase query | DB |
| `enabledFeatures` | useSession hook | Derived from session | — |

### Context providers (existing)

| Context | Provides | Used by measurement page? |
|---------|----------|--------------------------|
| AuthContext | user, userProfile, isAdmin | Yes — admin checks |
| ThemeContext | theme, setTheme | Yes — styling |
| AdminDataContext | admin data | No — admin pages only |

**No measurement-specific context exists.** All tool/drawing/scale state lives in SessionPage component state.

### Canvas ref dependencies

These controls require access to BlueprintCanvas refs or callbacks:

| Control | Ref/Callback needed |
|---------|-------------------|
| Zoom in/out/fit | `transformRef`, canvas dimensions |
| Pan | `transformRef`, mouse events on canvas |
| Reset View | `initialTransformRef` → `transformRef` |
| Page navigation | `renderPage()` from usePdf hook |
| Grid toggle | Canvas render cycle |
| Calibration clicks | Canvas click handler + `calibrating` state |
| Drawing (all tools) | Canvas click handler + `drawnPoints` |

### State hoisting assessment

**Complexity: MEDIUM**

To lift toolbar controls out of the sidebar into a `<Toolbar />` component:

1. **Drawing state** (`isDrawing`, `activeZoneMeta`, `drawnPoints`, etc.) already lives in SessionPage — toolbar just needs props passed down. No hoisting needed.

2. **Scale state** (`pageScales`, `calibrating`, `pendingCalibFeet`) already lives in SessionPage — same as above.

3. **Zoom/pan** lives in BlueprintCanvas refs. A toolbar zoom button would need either:
   - (a) An imperative handle via `useImperativeHandle` on BlueprintCanvas, or
   - (b) Callback props like `onZoomIn`, `onZoomOut`, `onFitToScreen` passed up from canvas.
   - Option (b) is simpler and likely already partially exists via `resetView`.

4. **Color state** currently lives in ZoneDrawPanel. Would need to be lifted to SessionPage (minor lift).

5. **No new Context needed** if the toolbar is a sibling of canvas within SessionPage's render. Prop-drilling depth stays at 1-2 levels.

### Potential prop-drilling problems

- If toolbar and canvas are siblings under SessionPage, most state flows cleanly via props.
- The only friction is **zoom/pan control** since those are canvas-internal refs. Recommend adding `onZoomIn`/`onZoomOut`/`onFitToScreen` callback props to BlueprintCanvas.
- A future `MeasurementContext` would be warranted if we add a right properties panel (3+ consumers of the same state), but not needed for V1 toolbar alone.

---

## 4. Existing Toolbar Primitives

### Reusable components

| Component | Path | Reusable for toolbar? |
|-----------|------|----------------------|
| ViewToggle | `src/components/ui/ViewToggle.jsx` | Partial — icon toggle group pattern, but coupled to List/Card views |
| FilterDropdown | `src/components/ui/FilterDropdown.jsx` | Partial — dropdown pattern |
| Modal | `src/components/ui/Modal.jsx` | Yes — for popover dialogs |
| InfoTooltip | `src/components/ui/InfoTooltip.jsx` | Yes — tooltip pattern |
| StorageBar | `src/components/ui/StorageBar.jsx` | No |

### Existing CSS patterns

- No `.toolbar` class exists anywhere in the codebase
- No `ToolGroup` or `ButtonGroup` component exists
- No `IconButton` component exists
- Button styling is per-component in CSS modules (`.btn`, `.submitBtn`, `.cancelBtn`, `.coatBtn`)

### Icon library

- **lucide-react** (package.json line 21)
- Icons in use: `Menu`, `X`, `LayoutGrid`, `List`, `ChevronDown`, `Info`, `Home`, `Building2`, `Plus`, `Check`, `Copy`, `ExternalLink`, `AlertCircle`
- Custom inline SVGs: EyeIcon/EyeOffIcon in ZoneList.jsx (lines 15-32)

### Design tokens

`src/styles/tokens.css` provides:
- Colors: `--color-primary` (#f27243), `--color-bg`, `--color-border`, success/warning/danger
- Spacing: `--space-1` through `--space-16` (4px–64px)
- Radius: `--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-xl`, `--radius-pill`
- Dark and light theme variants

### Assessment

**We need to build new toolbar primitives:**
- `Toolbar` container (horizontal bar, cluster groups)
- `ToolGroup` (visually grouped button cluster with optional separator)
- `IconButton` (icon + optional label, active/disabled states, tooltip)
- `ToolbarDropdown` (inline dropdown within toolbar)
- `ToolbarPopover` (for color picker, calculator, etc.)

---

## 5. Mobile/Responsive Considerations

### Current breakpoints

| Breakpoint | Usage |
|------------|-------|
| 768px | AppHeader hamburger menu, ClientsPage grid |
| 700px | DashboardPage stat tiles (4-col → 2-col) |
| 640px | GreetingStrip padding |
| 600px | Various form layouts |
| 480px | Modal sizing (ScaleChangeDialog) |

### SessionPage on narrow viewports

**Current behavior: NOT mobile-optimized.**
- Sidebar is fixed at 280px with no collapse/hamburger
- Canvas takes remaining width
- Below ~600px, the sidebar would consume nearly half the screen
- No `@media` queries in `SessionPage.module.css` (only a `@media print` rule)
- Canvas zoom/pan works via mouse — no touch gesture support found

### Existing mobile patterns

- AppHeader uses hamburger drawer at 768px (could be extended)
- No existing collapsible sidebar pattern for the measurement page
- No touch gesture handling (pinch-to-zoom, two-finger pan)

### Toolbar implications

- A horizontal toolbar will need an overflow/collapse strategy for narrow viewports
- Consider: cluster priority — essential tools visible, secondary in overflow menu
- The sidebar already needs a mobile solution; toolbar redesign is a chance to solve both

---

## 6. Imperial/Metric Handling

### Current state: PREFERENCE EXISTS, IMPLEMENTATION DOES NOT

**Preference storage:**
- `user_profiles.measurement_units` column (DB)
- Default: `'imperial'` (in `src/lib/userPrefs.js` line 8)
- UI: dropdown in `src/components/settings/PreferencesTab.jsx` (lines 127-131)
- Options: `imperial` / `metric`
- Accessible via `useUserPrefs()` hook

**Formatting functions (all hardcoded imperial):**

| Function | File | Output |
|----------|------|--------|
| `formatFeetInches(decimalFeet)` | `src/utils/fractions.js` | `12'6"`, `3'0"`, etc. |
| `formatSF(decimalSF)` | `src/utils/fractions.js` | `"142 sq ft"` |
| `formatLF(decimalFeet)` | `src/utils/fractions.js` | Calls formatFeetInches |
| `parseFeetInches(str)` | `src/utils/fractions.js` | Parses `"12'6""` → decimal feet |

**Consumers of formatting functions:**

| File | Usage |
|------|-------|
| `src/components/zones/ZoneList.jsx` | Zone result display |
| `src/components/zones/SessionSummary.jsx` | Page totals |
| `src/components/canvas/BlueprintCanvas.jsx` | Canvas overlay labels |
| `src/pages/SessionPage.jsx` | Session summary |
| `src/components/zones/ZoneDrawPanel.jsx` | Real-time previews |

### Blast radius for Imperial⇄Metric toggle

**Files needing updates: ~6-8**

1. `src/utils/fractions.js` — Add metric formatting functions (`formatMeters`, `formatSqMeters`, `formatLinearMeters`) and make `formatSF`/`formatLF` unit-aware
2. `src/utils/measurements.js` — Calculation utils may need unit parameter
3. `src/utils/scaleOptions.js` — Add metric scale options (1:50, 1:100, etc.)
4. `src/components/zones/ZoneList.jsx` — Pass unit preference to formatters
5. `src/components/zones/ZoneDrawPanel.jsx` — Input labels, real-time previews
6. `src/components/canvas/BlueprintCanvas.jsx` — Canvas labels
7. `src/components/canvas/ScalePanel.jsx` — Scale display, calibration input
8. `src/pages/SessionPage.jsx` — Summary displays

**Recommended approach:** Make `formatSF` / `formatLF` accept a `units` parameter, default to `'imperial'`. Pass `useUserPrefs().measurement_units` down from SessionPage. Keeps blast radius contained.

---

## 7. Scale Calibration Current Implementation

### Scale state

| Variable | Location | Scope |
|----------|----------|-------|
| `pageScales` | SessionPage useState (line 71) | **Per-page, per-session** |
| `pixelsPerFoot` | Derived: `pageScales[currentPage]` | Current page only |
| `calibrating` | SessionPage useState (line 73) | Ephemeral mode flag |
| `pendingCalibFeet` | SessionPage useState (line 74) | User's entered distance |

### Persistence

- Stored in DB: `sessions.page_scales` — JSONB like `{"1": 96.5, "2": 48.25}`
- Each page of a multi-page PDF can have an independent scale
- Loaded on session mount, updated on every scale change

### Three calibration methods

1. **Dropdown** — Quick select from standard architectural scales (`src/utils/scaleOptions.js`)
   - Options: 1/8", 1/4", 3/8", 1/2", 3/4", 1", 1.5", 3", plus Manual
   - Calls `calcPixelsPerFoot(inchesPerFoot, pixelsPerInch)` — uses 96 DPI default

2. **Manual calibration** — User enters known distance, clicks 2 canvas points
   - Distance parsed by `parseFeetInches()` in `src/utils/fractions.js`
   - Pixel distance between 2 points / feet = pixelsPerFoot
   - Most accurate method

3. **AI detection** — Plus-plan feature, reads PDF title block
   - `src/utils/detectScale.js`
   - Sets detected scale, user can accept or dismiss

### Rescaling workflow

When scale changes and zones already exist on page:
- `rescaleZonesOnCurrentPage(newPPF)` in SessionPage (lines 371-393)
- Recalculates area/length for all non-count zones using new pixelsPerFoot
- Updates each zone in DB
- Ceiling/wall adjustments re-applied

### Scale validation

- `runScaleSanityCheck(ppf, source)` — checks if resulting page dimensions are reasonable (20-200 ft range for typical floor plans)
- Displays green/amber/red pill on ScalePanel
- Amber pill shows "Scale may be incorrect" with calculated page dimensions

### Wiring for toolbar

Scale dropdown + Recalibrate button can move to toolbar Cluster 5 cleanly.
Scale state already lives in SessionPage — toolbar just receives `pageScales[currentPage]` as prop and calls `applyScaleChange(ppf)` callback.
Manual calibration interaction (clicking 2 canvas points) still requires the canvas click handler coordination, which is already managed via `calibrating` state in SessionPage.

---

## 8. Gap Analysis — Proposed V1 Toolbar vs. Current Codebase

### NEW BUILDS (does not exist yet)

| Proposed Control | Cluster | Build Effort |
|-----------------|---------|-------------|
| Toolbar container component | — | New component + CSS |
| ToolGroup component | — | New component |
| IconButton component | — | New component |
| Select tool | Cluster 2 | New — no pointer/select mode exists (currently always draw or pan) |
| Pan tool (explicit) | Cluster 2 | Exists as right-click/drag — needs explicit toggle |
| Rectangle tool | Cluster 3 | New — only freeform polygon exists |
| Line tool (dedicated) | Cluster 3 | Partial — LF mode draws lines, but no standalone line tool |
| Text label tool | Cluster 3 | New — zone labels exist but no free-floating text |
| Eraser tool | Cluster 3 | New — delete exists per-zone, but no eraser tool |
| Stroke width control | Cluster 4 | New — zone outlines have fixed width |
| Fill opacity control | Cluster 4 | New — zone fills have fixed opacity |
| Imperial⇄Metric toggle | Cluster 5 | Preference exists, display logic does NOT |
| Zoom in / Zoom out buttons | Cluster 6 | New buttons — zoom exists via scroll only |
| Fit-to-screen button | Cluster 6 | Partial — Reset View exists, needs rename/icon |
| Grid toggle | Cluster 6 | New — no grid overlay exists |
| Calculator popover | Cluster 7 | New — wall calculator exists inline, not as popover |
| Shortcuts cheat sheet | Cluster 7 | New — no keyboard shortcut reference exists |
| Share Internal button | Cluster 8 | New — no sharing workflow exists on session page |

### MOVES (exists, needs relocation)

| Current Control | From | To |
|----------------|------|------|
| Save indicator + button | Sidebar header | Cluster 1 |
| Add/Replace Blueprint | Sidebar blueprint section | Cluster 1 |
| Scale dropdown | ScalePanel (sidebar) | Cluster 5 |
| Recalibrate (manual calibration trigger) | ScalePanel (sidebar) | Cluster 5 |
| Color picker (14 swatches + auto) | ZoneDrawPanel (sidebar) | Cluster 4 |
| Measurement type toggles (SF/LF/count) | ZoneDrawPanel (sidebar) | Cluster 3 |
| Straight Lines ON/OFF | Floating on canvas | Cluster 3 (or Cluster 6) |
| Reset View | Floating on canvas | Cluster 6 (rename to "Fit") |
| Page navigation (PdfPageSelector) | Sidebar | Cluster 6 |
| Export CSV | Sidebar bottom | Cluster 8 |
| Download PDF buttons | Sidebar bottom | Cluster 8 |

### STAYS (remains in left panel or gets right panel)

| Control | Stays where | Reason |
|---------|-------------|--------|
| ZoneList (zone inventory) | Left panel | NOUN — item list |
| Zone edit form (all fields) | Left panel or future Right panel | NOUN — properties |
| Test panel | Left panel | Complex admin workflow |
| Page Total summary | Left panel footer | Aggregated state |
| Calibration banner | Contextual (inline) | Alert, not toolbar |

---

## 9. Risk Register for Redesign

| # | Risk | Severity | Mitigation |
|---|------|----------|-----------|
| 1 | SessionPage.jsx is 1,747 lines — extracting toolbar logic without breaking drawing workflow | High | Extract toolbar as a pure display component first; keep all state in SessionPage; toolbar only receives props + callbacks |
| 2 | Canvas zoom/pan controlled by internal refs — toolbar zoom buttons need imperative access | Medium | Add `useImperativeHandle` or callback props (`onZoomIn`, `onZoomOut`, `onFit`) to BlueprintCanvas |
| 3 | Color state lives in ZoneDrawPanel — lifting to toolbar means ZoneDrawPanel and toolbar share color | Low | Lift `color` state to SessionPage, pass down to both |
| 4 | No existing toolbar primitives — need to build ToolGroup, IconButton, ToolbarDropdown from scratch | Medium | Build small, token-based primitives first; align with existing design tokens |
| 5 | Mobile viewport completely unhandled for measurement page — toolbar adds another element that needs responsive treatment | High | Design toolbar overflow strategy (priority clusters + "more" menu) before building |
| 6 | Metric toggle would be UI-only — no conversion logic exists, could confuse users if toggled | Medium | Either build full metric support alongside toggle, or ship toggle as disabled/coming-soon |
| 7 | Manual calibration requires canvas click interaction after toolbar button press — split between toolbar and canvas | Low | Keep `calibrating` state in SessionPage; toolbar sets the flag, canvas handles clicks — already this pattern |
| 8 | Rectangle / Line / Text / Eraser are new drawing tools, not just moved controls | High | These are new features, not toolbar layout work — scope separately |
| 9 | Straight Lines toggle has keyboard shortcut (O) — need to preserve keyboard shortcuts and add new ones | Low | Build shortcut registry alongside toolbar; cheat sheet popover covers discoverability |
| 10 | ZoneDrawPanel form fields (name, description, surface type) may feel orphaned if toolbar takes measurement type and color away | Medium | Redesign left panel as "zone config" panel that appears when drawing starts; toolbar owns tool selection, panel owns zone metadata |
