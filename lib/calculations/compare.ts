import { REFERENCE_RANGES } from '@/lib/constants/reference-ranges'
import { CRITICAL_METRICS, PANELS } from '@/lib/constants/test-panels'
import type { DeltaResult } from '@/lib/types/analysis'
import type { LabRecord, Panel } from '@/lib/types/lab-record'
import { computeDelta } from './deltas'
import { resolveRange, valueStatus, type ResolvedRange, type TargetMap } from './targets'

/**
 * "Latest · previous · before that" for every test, the model behind the
 * comparison table (dashboard, record page, doctor view). Pure, no Firebase.
 *
 * Reports are often partial (a tacrolimus-only or HbA1c-only report on its own
 * day), so the columns are per TEST, not per report: each cell carries its own
 * date and record id.
 *
 *   snapshot (no anchor): every test seen in any record, its last `depth` readings
 *   anchored on a report:  that report's tests; its value plus the earlier
 *                          readings (earlier date, or same date but earlier in
 *                          the list). Later reports are ignored.
 *
 * Statuses come from valueStatus() (target > printed range > default), so the
 * colours match the rest of the app.
 */

export type ValueStatus = 'good' | 'warning' | 'danger'

export interface CompareCell {
  value: number
  unit: string
  /** ISO date of the record */
  date: string
  recordId: string
  status: ValueStatus
}

export interface CompareRow {
  testName: string
  /** Display name (REFERENCE_RANGES label, or the printed name for other tests). */
  label: string
  panel: Panel
  unit: string
  /** Creatinine / eGFR / Tacrolimus */
  critical: boolean
  /** Newest first; null where the test has fewer readings than `depth`. */
  cells: (CompareCell | null)[]
  /** Status of the latest reading. */
  status: ValueStatus
  /** Latest vs the reading just before it. */
  delta: DeltaResult | null
  /** Range the latest reading is judged against. */
  range: ResolvedRange | null
  /** Snapshot only: latest reading is much older than the newest record. */
  stale: boolean
}

export type CompareGroupId = Panel | 'older'

export interface CompareGroup {
  id: CompareGroupId
  label: string
  rows: CompareRow[]
  /** Rows whose latest reading isn't normal (only non-zero for 'older'). */
  outCount: number
}

export interface Comparison {
  rows: CompareRow[]
  /** Latest reading borderline/out of range: danger first, critical first. Not repeated in groups. */
  attention: CompareRow[]
  groups: CompareGroup[]
  /** Newest record date (snapshot) or the anchor's date. */
  latestDate: string | null
  depth: number
}

export interface CompareOptions {
  anchorRecordId?: string
  /** Readings per test, including the latest (default 3). */
  depth?: number
  targets?: TargetMap | null
  /** Snapshot: readings older than this before the newest record go to "Older results". */
  staleAfterDays?: number
}

const DAY_MS = 24 * 60 * 60 * 1000
const STATUS_RANK: Record<ValueStatus, number> = { danger: 0, warning: 1, good: 2 }
const CRITICAL = new Set<string>(CRITICAL_METRICS)
const PANEL_ORDER: Panel[] = [...PANELS.map((p) => p.id), 'other']
const PANEL_LABEL: Record<string, string> = Object.fromEntries(PANELS.map((p) => [p.id, p.label]))
const TEST_ORDER = new Map(PANELS.flatMap((p) => p.tests).map((t, i) => [t, i]))

const time = (iso: string) => new Date(iso).getTime()

function byTestOrder(a: CompareRow, b: CompareRow): number {
  const ia = TEST_ORDER.get(a.testName) ?? Number.MAX_SAFE_INTEGER
  const ib = TEST_ORDER.get(b.testName) ?? Number.MAX_SAFE_INTEGER
  return ia - ib || a.label.localeCompare(b.label)
}

export function buildComparison(records: LabRecord[], opts: CompareOptions = {}): Comparison {
  const depth = Math.max(1, opts.depth ?? 3)
  const targets = opts.targets ?? null
  const staleAfterDays = opts.staleAfterDays ?? 180
  const empty: Comparison = { rows: [], attention: [], groups: [], latestDate: null, depth }

  // Oldest first; ties keep their input order (stable sort).
  const sorted = [...records].sort((a, b) => time(a.recordDate) - time(b.recordDate))
  let history = sorted
  let tests: string[]

  if (opts.anchorRecordId) {
    const idx = sorted.findIndex((r) => r.id === opts.anchorRecordId)
    if (idx < 0) return empty
    history = sorted.slice(0, idx + 1)
    tests = Array.from(new Set(sorted[idx].values.map((v) => v.testName)))
  } else {
    tests = Array.from(new Set(sorted.flatMap((r) => r.values.map((v) => v.testName))))
  }
  if (history.length === 0) return empty

  const latestDate = history[history.length - 1].recordDate
  const staleBefore = time(latestDate) - staleAfterDays * DAY_MS

  const rows: CompareRow[] = []
  for (const testName of tests) {
    const cells: CompareCell[] = []
    let panel: Panel | null = null
    let latestRefs: { referenceMin?: number; referenceMax?: number } | null = null
    for (let i = history.length - 1; i >= 0 && cells.length < depth; i--) {
      const r = history[i]
      const lv = r.values.find((v) => v.testName === testName)
      if (!lv || !Number.isFinite(lv.value)) continue
      if (!panel) {
        panel = lv.panel
        latestRefs = lv
      }
      cells.push({
        value: lv.value,
        unit: lv.unit,
        date: r.recordDate,
        recordId: r.id,
        status: valueStatus(testName, lv.value, lv, targets),
      })
    }
    if (cells.length === 0 || !panel) continue

    const ref = REFERENCE_RANGES[testName]
    rows.push({
      testName,
      label: ref?.label ?? testName,
      panel,
      unit: cells[0].unit || ref?.unit || '',
      critical: CRITICAL.has(testName),
      cells: [...cells, ...Array<null>(depth - cells.length).fill(null)],
      status: cells[0].status,
      delta: cells.length > 1 ? computeDelta(testName, cells[0].value, cells[1].value) : null,
      range: resolveRange(testName, latestRefs, targets),
      stale: !opts.anchorRecordId && time(cells[0].date) < staleBefore,
    })
  }

  const current = rows.filter((r) => !r.stale)
  const attention = current
    .filter((r) => r.status !== 'good')
    .sort(
      (a, b) =>
        STATUS_RANK[a.status] - STATUS_RANK[b.status] || Number(b.critical) - Number(a.critical) || byTestOrder(a, b)
    )
  const inAttention = new Set(attention)

  const groups: CompareGroup[] = []
  for (const panel of PANEL_ORDER) {
    const panelRows = current.filter((r) => r.panel === panel && !inAttention.has(r)).sort(byTestOrder)
    if (panelRows.length) {
      groups.push({ id: panel, label: PANEL_LABEL[panel] ?? 'Other tests', rows: panelRows, outCount: 0 })
    }
  }
  const older = rows.filter((r) => r.stale).sort(byTestOrder)
  if (older.length) {
    groups.push({ id: 'older', label: 'Older results', rows: older, outCount: older.filter((r) => r.status !== 'good').length })
  }

  return { rows, attention, groups, latestDate, depth }
}
