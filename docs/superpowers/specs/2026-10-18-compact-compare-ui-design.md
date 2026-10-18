# Compact comparison UI: less scrolling, doctor view, original reports

Date: 2026-10-18 · Status: implemented the same night (owner away; decisions taken
by Claude from the review below, owner to review on device).

## Why

Owner feedback: too much scrolling; wants to open the original PDF easily;
better graphics; at a visit the doctor wants **the latest numbers compared with
the previous one or two reports**, and the owner **hands the phone across**.

Review of the screens as they were (≈390 px phone, ≈700 px usable height):

| Screen | Height | Main problems |
|---|---|---|
| Dashboard | 2,300–2,900 px | out-of-range shown 3× (alerts banner, inline list, panel rows); 27-row panel overview with no previous value; key numbers fall below the fold; cards not tappable |
| Record detail | ≈1,300 px of tables | no previous value / delta; no prev/next; "Open PDF" at the very bottom |
| Visit prep | ≈2,000 px | previous value in a truncated grey subline; last visit's advice at the bottom |
| Doctor mode | ≈500 px for 3 numbers | only 3 key tests + out-of-range; single column |
| Trends | ≈1,850 px | 6 fixed charts, 2 taps deep, no test picker or time window, no years on axis |

Nothing showed "latest · previous · before that" side by side.

## Core idea: one comparison model, one table, one chart sheet

### Comparison model (`lib/calculations/compare.ts`, pure, unit-tested)

Reports are often partial (a tacrolimus-only or HbA1c-only report on its own
day), so columns are **per test**, not per report: for each test, its latest
reading and the readings before it. Each cell carries its own date and record id.

- `buildComparison(records, { anchorRecordId?, depth = 3, targets?, staleAfterDays = 180 })`
  - no anchor (snapshot): every test seen in any record; its last `depth` readings.
  - with anchor (a specific report): only that report's tests; the anchor value
    plus up to `depth − 1` earlier readings of the same test (earlier date, or same
    date but earlier in the list).
- Cell status uses `valueStatus()` (target > printed range > default), so the
  colours match the rest of the app.
- Delta = latest vs the reading just before it (`computeDelta`).
- `attention` = rows whose latest reading is borderline/out of range (danger
  first, critical metrics first). These rows are **not repeated** in their panel.
- Panels follow `PANELS` order, then "Other tests" (the `other` panel, by name).
- Snapshot rows whose latest reading is more than `staleAfterDays` older than the
  newest record go to a final "Older results" group.

### Shared UI

- `components/compare/compare-table.tsx`: rows = tests, columns
  Latest · Previous · Before (configurable 2–3), value coloured by status, small
  date under each value, delta chip on the latest. Attention rows on top; each
  panel is a collapsible section whose header shows a one-line summary
  ("8 tests · all normal"). In-range panels start collapsed when `collapseNormal`.
  Tapping a row opens the test sheet. Row ≈ 44 px.
- `components/trends/test-sheet.tsx` + `TestSheetProvider` (mounted in the app
  shell): `useTestSheet().open(testName)` from anywhere opens a bottom sheet with
  a chart (normal band, years on the axis, 6 m / 1 y / all), and the last
  readings with dates, deltas and links to their reports.
- `components/records/open-report-button.tsx`: opens a record's original file
  (`pdfPath`) in a new tab; renders nothing for hand-entered or migrated records
  without a file.

## Screens

- **Doctor view `/compare`** (new; full screen, keeps the screen awake, works in
  landscape): patient name + "as of" date, 3 key tiles (Creatinine, eGFR,
  Tacrolimus) with previous values, then the comparison table with all panels
  expanded, 3 columns. Column-header dates link to the original reports.
  Reached from the dashboard ("Show doctor"), the visit prep page and More.
  The old Doctor mode overlay opens this view.
- **Dashboard**: key tiles (tappable → sheet) with the previous value; one alerts
  block (the inline duplicate list is removed); upcoming visit; a compact
  "Latest results" comparison (2 columns, normal panels collapsed) replacing the
  27-row panel overview; health score reduced to a compact row linking to
  Analysis; vitals quick entry moved below.
- **Record detail**: "Open original report" at the top; comparison anchored on
  this record (this report · previous · before); previous/next report buttons;
  delete stays at the bottom.
- **Records list**: warnings no longer shown as dangers; the row-level delete
  button is removed (delete lives on the record page).
- **Visit prep**: "Advice last time" and the comparison move to the top; doctor
  view button prominent.
- **Trends**: a test picker (any test, including "Other tests") driving one large
  chart with the time-window toggle, instead of six fixed charts.

## Out of scope (tonight)

Data-model or rules changes (none needed), the prep PDF layout, the Play Store
app, landscape-specific layouts beyond the doctor view.

## Testing

Unit tests for `compare.ts` (snapshot vs anchor, partial reports, same-day
ordering, stale grouping, attention ordering, missing values, deltas). Type check,
lint, full vitest, production build, and a screen check on the emulators with the
synthetic demo data before deploying.
