import { REFERENCE_RANGES } from '@/lib/constants/reference-ranges'
import { CRITICAL_METRICS, PANELS } from '@/lib/constants/test-panels'
import { computeDelta } from '@/lib/calculations/deltas'
import { linearRegression } from '@/lib/calculations/trends'
import { isInRange, resolveRange, type TargetMap } from '@/lib/calculations/targets'
import { isDeltaPositive } from '@/lib/utils'
import type { DeltaResult } from '@/lib/types/analysis'
import type { LabRecord } from '@/lib/types/lab-record'
import type { Medication } from '@/lib/types/medication'
import type { AlertRule, Question, Target } from '@/lib/types/care'
import { computeAlerts } from '@/lib/calculations/alerts'
import { visitSortKey, type VisitRecord } from './types'

/**
 * Visit prep: everything worth raising at a doctor's visit, computed from the
 * patient's data. Pure, so the client page, the doctor-mode view and the
 * server PDF (/api/visits/[id]/prep-pdf) all show the same summary.
 *
 * Window: lab records dated after the previous visit, up to and including the
 * visit date. With no previous visit, the window is the latest record on or
 * before the visit date. Each test's change is latest-in-window vs the last
 * value BEFORE the window (i.e. "since the last visit").
 */

export interface PrepAlert {
  severity: 'info' | 'warning' | 'critical'
  title: string
  /** YYYY-MM-DD of the record that triggered it. */
  detail?: string
}

export interface PrepChange {
  testName: string
  label: string
  unit: string
  panel: string
  latest: number
  latestDate: string // YYYY-MM-DD
  baseline: number | null
  baselineDate: string | null
  delta: DeltaResult | null
  /** Short-run trend over the last ≤5 values up to the visit. */
  trend: 'up' | 'down' | 'stable' | null
  /** Whether the trend direction is the good one for this test. */
  trendGood: boolean | null
  rangeMin: number | null
  rangeMax: number | null
  rangeSource: 'target' | 'record' | 'default' | null
  outOfRange: boolean
  critical: boolean
}

export interface VisitPrepSummary {
  visit: Pick<VisitRecord, 'id' | 'visitDate' | 'visitTime' | 'doctorName' | 'hospital' | 'purpose'>
  previousVisit: { id: string; visitDate: string; advice?: string } | null
  /** Exclusive lower bound of the window (previous visit date), if any. */
  since: string | null
  newRecords: { id: string; recordDate: string; labName: string; valueCount: number; abnormalCount: number }[]
  changes: PrepChange[]
  outOfRange: PrepChange[]
  medications: Pick<Medication, 'id' | 'name' | 'dose' | 'frequency' | 'category'>[]
  openQuestions: Pick<Question, 'id' | 'text' | 'status' | 'source'>[]
  alerts: PrepAlert[]
}

export interface VisitPrepInput {
  visit: VisitRecord
  /** All visits for the patient (used to find the previous one). */
  visits: VisitRecord[]
  records: LabRecord[]
  medications: Medication[]
  questions: Question[]
  targets?: TargetMap | null
  /** Alerts from lib/calculations/alerts.ts (Phase 5) when available. */
  alerts?: PrepAlert[]
}

const ymd = (iso: string) => iso.slice(0, 10)

const TEST_ORDER: string[] = [
  ...CRITICAL_METRICS,
  ...PANELS.flatMap((p) => p.tests).filter((t) => !(CRITICAL_METRICS as readonly string[]).includes(t)),
]

function orderIndex(testName: string): number {
  const i = TEST_ORDER.indexOf(testName)
  return i === -1 ? TEST_ORDER.length : i
}

/** Most recent visit strictly before `visit` (by date, then time). */
export function findPreviousVisit(visit: VisitRecord, visits: VisitRecord[]): VisitRecord | null {
  const key = visitSortKey(visit)
  let best: VisitRecord | null = null
  for (const v of visits) {
    if (v.id === visit.id || visitSortKey(v) >= key) continue
    if (!best || visitSortKey(v) > visitSortKey(best)) best = v
  }
  return best
}

/** Trend over the last ≤5 points: relative change of the fitted line across the span. */
function shortTrend(points: { date: string; value: number }[]): 'up' | 'down' | 'stable' | null {
  const last = points.slice(-5)
  if (last.length < 3) return null
  const t0 = new Date(last[0].date).getTime()
  const reg = linearRegression(last.map((p) => ({ x: (new Date(p.date).getTime() - t0) / 86_400_000, y: p.value })))
  const spanDays = (new Date(last[last.length - 1].date).getTime() - t0) / 86_400_000
  const mean = last.reduce((s, p) => s + p.value, 0) / last.length
  const change = reg.slope * spanDays
  if (mean === 0 ? Math.abs(change) < 1e-9 : Math.abs(change / mean) < 0.03) return 'stable'
  return change > 0 ? 'up' : 'down'
}

export function buildVisitPrep(input: VisitPrepInput): VisitPrepSummary {
  const { visit, visits, medications, questions, targets, alerts } = input
  const cutoff = visit.visitDate
  const prev = findPreviousVisit(visit, visits)
  const since = prev?.visitDate ?? null

  const sorted = [...input.records]
    .filter((r) => ymd(r.recordDate) <= cutoff)
    .sort((a, b) => a.recordDate.localeCompare(b.recordDate))

  let windowRecords: LabRecord[]
  if (since) {
    windowRecords = sorted.filter((r) => ymd(r.recordDate) > since)
  } else {
    windowRecords = sorted.length ? [sorted[sorted.length - 1]] : []
  }
  const windowIds = new Set(windowRecords.map((r) => r.id))
  const windowStart = windowRecords.length ? ymd(windowRecords[0].recordDate) : null

  const changes: PrepChange[] = []
  const testsInWindow = new Set(windowRecords.flatMap((r) => r.values.map((v) => v.testName)))

  for (const testName of Array.from(testsInWindow)) {
    const history = sorted
      .map((r) => ({ r, v: r.values.find((x) => x.testName === testName) }))
      .filter((x): x is { r: LabRecord; v: NonNullable<typeof x.v> } => !!x.v && Number.isFinite(x.v.value))
    const inWindow = history.filter((h) => windowIds.has(h.r.id))
    if (!inWindow.length) continue
    const latest = inWindow[inWindow.length - 1]
    const before = history.filter((h) => !windowIds.has(h.r.id) && windowStart != null && ymd(h.r.recordDate) < windowStart)
    const base = before.length ? before[before.length - 1] : null

    const ref = REFERENCE_RANGES[testName]
    const range = resolveRange(testName, latest.v, targets)
    const outOfRange = range ? !isInRange(latest.v.value, range) : latest.v.isAbnormal
    const trend = shortTrend(history.map((h) => ({ date: h.r.recordDate, value: h.v.value })))

    changes.push({
      testName,
      label: ref?.label ?? testName,
      unit: latest.v.unit || ref?.unit || '',
      panel: latest.v.panel ?? ref?.panel ?? '',
      latest: latest.v.value,
      latestDate: ymd(latest.r.recordDate),
      baseline: base ? base.v.value : null,
      baselineDate: base ? ymd(base.r.recordDate) : null,
      delta: base ? computeDelta(testName, latest.v.value, base.v.value) : null,
      trend,
      trendGood: trend == null ? null : trend === 'stable' ? true : isDeltaPositive(testName, trend),
      rangeMin: range?.min ?? null,
      rangeMax: range?.max ?? null,
      rangeSource: range?.source ?? null,
      outOfRange,
      critical: (CRITICAL_METRICS as readonly string[]).includes(testName),
    })
  }
  changes.sort((a, b) => orderIndex(a.testName) - orderIndex(b.testName) || a.testName.localeCompare(b.testName))

  const openQuestions = questions
    .filter((q) => q.status !== 'answered' && (!q.visitId || q.visitId === visit.id))
    .sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''))
    .map((q) => ({ id: q.id, text: q.text, status: q.status, source: q.source }))

  return {
    visit: {
      id: visit.id,
      visitDate: visit.visitDate,
      visitTime: visit.visitTime ?? null,
      doctorName: visit.doctorName,
      hospital: visit.hospital,
      purpose: visit.purpose,
    },
    previousVisit: prev ? { id: prev.id, visitDate: prev.visitDate, advice: prev.advice } : null,
    since,
    newRecords: [...windowRecords].reverse().map((r) => ({
      id: r.id,
      recordDate: ymd(r.recordDate),
      labName: r.labName,
      valueCount: r.values.length,
      abnormalCount: r.values.filter((v) => v.isAbnormal).length,
    })),
    changes,
    outOfRange: changes.filter((c) => c.outOfRange),
    medications: medications
      .filter((m) => m.isActive !== false)
      .map((m) => ({ id: m.id, name: m.name, dose: m.dose, frequency: m.frequency, category: m.category })),
    openQuestions,
    alerts: alerts ?? [],
  }
}

/**
 * Alerts as of the visit date: computeAlerts (lib/calculations/alerts.ts) over
 * the records up to that day, so a past visit's prep shows what was flagged then.
 */
export function visitAlerts(
  records: LabRecord[],
  visitDate: string,
  targets?: Target[] | null,
  alertRules?: AlertRule[] | null
): PrepAlert[] {
  const upTo = records.filter((r) => ymd(r.recordDate) <= visitDate)
  const order = { critical: 0, warning: 1, info: 2 } as const
  return computeAlerts({ records: upTo, targets: targets ?? [], alertRules: alertRules ?? [] })
    .sort((a, b) => order[a.severity] - order[b.severity])
    .map((a) => ({ severity: a.severity, title: a.message, detail: a.date }))
}

/** "↑ 12%" style label for a change (uses formatDelta rules). */
export function arrowFor(direction: 'up' | 'down' | 'stable' | null): string {
  if (direction === 'up') return '↑'
  if (direction === 'down') return '↓'
  if (direction === 'stable') return '→'
  return ''
}
