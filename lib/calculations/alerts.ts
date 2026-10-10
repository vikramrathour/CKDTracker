import { REFERENCE_RANGES } from '@/lib/constants/reference-ranges'
import type { LabRecord } from '@/lib/types/lab-record'
import type { Medication } from '@/lib/types/medication'
import type { AlertRule, Target } from '@/lib/types/care'

/**
 * Red flags computed in code (never by the LLM). The same list drives the
 * dashboard banner, the chat ALERTS block and (later) push notifications.
 *
 * Every rule looks at the LATEST value of a test only: an alert describes the
 * patient's current state, not history. "Baseline" is the median of up to the
 * 3 most recent values before the latest one; at least 2 are needed, otherwise
 * baseline rules stay silent (not enough history to call a change).
 */

export type AlertSeverity = 'critical' | 'warning' | 'info'

export type AlertKind =
  | 'creatinine-rise'
  | 'egfr-drop'
  | 'potassium-high'
  | 'tacrolimus-target'
  | 'outside-target'
  | 'rule-above'
  | 'rule-below'
  | 'rule-change'
  | 'rule-outside-target'

export interface Alert {
  /** Stable id: `${kind}:${testName}:${recordId}` (plus the rule id for user rules). */
  id: string
  kind: AlertKind
  severity: AlertSeverity
  testName: string
  /** Plain-language, value-bearing summary for patients/caregivers. */
  message: string
  value: number
  /** The limit crossed (absolute value, or baseline for change rules). */
  threshold: number | null
  recordId: string
  /** YYYY-MM-DD of the record. */
  date: string
}

export interface ComputeAlertsInput {
  records: LabRecord[]
  /** patients/{pid}/targets docs (array or map keyed by testName). */
  targets?: Target[] | Record<string, Target> | null
  alertRules?: AlertRule[] | null
  /** Reserved for medication-aware rules; not used by the current rule set. */
  medications?: Medication[] | null
}

// ---- thresholds (documented in README "Chat with your reports") ----
export const CREATININE_RISE_PCT = 20
export const EGFR_DROP_PCT = 25
export const POTASSIUM_WARNING = 5.5
export const POTASSIUM_CRITICAL = 6.0
export const BASELINE_WINDOW = 3
export const BASELINE_MIN_POINTS = 2

const SEVERITY_ORDER: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 }

export interface SeriesPoint {
  recordId: string
  date: string
  value: number
}

/** YYYY-MM-DD from an ISO string (record dates are stored as UTC midnight). */
export function toDateOnly(iso: string): string {
  return typeof iso === 'string' ? iso.slice(0, 10) : ''
}

/** Chronological (oldest first) finite values of one test. */
export function seriesFor(records: LabRecord[], testName: string): SeriesPoint[] {
  const out: SeriesPoint[] = []
  for (const r of records) {
    for (const v of r.values ?? []) {
      if (v.testName === testName && typeof v.value === 'number' && Number.isFinite(v.value)) {
        out.push({ recordId: r.id, date: toDateOnly(r.recordDate), value: v.value })
        break
      }
    }
  }
  // Stable sort by date; ties keep input order.
  return out
    .map((p, i) => ({ p, i }))
    .sort((a, b) => (a.p.date < b.p.date ? -1 : a.p.date > b.p.date ? 1 : a.i - b.i))
    .map(({ p }) => p)
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** Median of up to BASELINE_WINDOW values preceding the last point; null with < BASELINE_MIN_POINTS. */
export function baselineOf(series: SeriesPoint[]): number | null {
  if (series.length < BASELINE_MIN_POINTS + 1) return null
  const prior = series.slice(Math.max(0, series.length - 1 - BASELINE_WINDOW), series.length - 1)
  if (prior.length < BASELINE_MIN_POINTS) return null
  return median(prior.map((p) => p.value))
}

function pctChange(value: number, baseline: number): number {
  return ((value - baseline) / baseline) * 100
}

const round = (n: number, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp
const fmt = (n: number) => String(round(n))

function targetMap(targets: ComputeAlertsInput['targets']): Map<string, Target> {
  const map = new Map<string, Target>()
  if (!targets) return map
  const list = Array.isArray(targets) ? targets : Object.values(targets)
  for (const t of list) if (t && typeof t.testName === 'string') map.set(t.testName, t)
  return map
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/** Patient target if set (with at least one bound), else the generic reference range. */
export function effectiveRange(
  testName: string,
  targets: Map<string, Target>
): { min: number | null; max: number | null; source: 'target' | 'reference' } | null {
  const t = targets.get(testName)
  if (t && (num(t.min) != null || num(t.max) != null)) {
    return { min: num(t.min), max: num(t.max), source: 'target' }
  }
  const ref = REFERENCE_RANGES[testName]
  if (ref) return { min: ref.min, max: ref.max, source: 'reference' }
  return null
}

function describeRange(min: number | null, max: number | null): string {
  if (min != null && max != null) return `${fmt(min)}–${fmt(max)}`
  if (min != null) return `at least ${fmt(min)}`
  if (max != null) return `at most ${fmt(max)}`
  return 'unset'
}

function outside(value: number, min: number | null, max: number | null): 'low' | 'high' | null {
  if (min != null && value < min) return 'low'
  if (max != null && value > max) return 'high'
  return null
}

function unitOf(testName: string): string {
  const u = REFERENCE_RANGES[testName]?.unit
  return u ? ` ${u}` : ''
}

export function computeAlerts(input: ComputeAlertsInput): Alert[] {
  const records = Array.isArray(input.records) ? input.records : []
  const targets = targetMap(input.targets)
  const rules = (input.alertRules ?? []).filter((r) => r && r.enabled !== false)
  const alerts: Alert[] = []
  const seriesCache = new Map<string, SeriesPoint[]>()
  const series = (t: string) => {
    let s = seriesCache.get(t)
    if (!s) seriesCache.set(t, (s = seriesFor(records, t)))
    return s
  }
  const latest = (t: string) => {
    const s = series(t)
    return s.length ? s[s.length - 1] : null
  }
  const push = (a: Omit<Alert, 'id'>, idSuffix = '') =>
    alerts.push({ ...a, id: `${a.kind}:${a.testName}:${a.recordId}${idSuffix ? `:${idSuffix}` : ''}` })

  // 1. Creatinine > 20% above baseline: the classic early rejection signal, so critical.
  {
    const s = series('Creatinine')
    const base = baselineOf(s)
    const last = latest('Creatinine')
    if (last && base != null && base > 0) {
      const pct = pctChange(last.value, base)
      if (pct > CREATININE_RISE_PCT) {
        push({
          kind: 'creatinine-rise',
          severity: 'critical',
          testName: 'Creatinine',
          value: last.value,
          threshold: round(base),
          recordId: last.recordId,
          date: last.date,
          message: `Creatinine ${fmt(last.value)}${unitOf('Creatinine')} is ${Math.round(pct)}% above the recent baseline of ${fmt(base)}.`,
        })
      }
    }
  }

  // 2. eGFR > 25% below baseline.
  {
    const s = series('eGFR')
    const base = baselineOf(s)
    const last = latest('eGFR')
    if (last && base != null && base > 0) {
      const drop = -pctChange(last.value, base)
      if (drop > EGFR_DROP_PCT) {
        push({
          kind: 'egfr-drop',
          severity: 'warning',
          testName: 'eGFR',
          value: last.value,
          threshold: round(base),
          recordId: last.recordId,
          date: last.date,
          message: `eGFR ${fmt(last.value)} is ${Math.round(drop)}% below the recent baseline of ${fmt(base)}.`,
        })
      }
    }
  }

  // 3. Potassium > 6.0 critical, > 5.5 warning.
  {
    const last = latest('Potassium')
    if (last && last.value > POTASSIUM_WARNING) {
      const critical = last.value > POTASSIUM_CRITICAL
      push({
        kind: 'potassium-high',
        severity: critical ? 'critical' : 'warning',
        testName: 'Potassium',
        value: last.value,
        threshold: critical ? POTASSIUM_CRITICAL : POTASSIUM_WARNING,
        recordId: last.recordId,
        date: last.date,
        message: critical
          ? `Potassium ${fmt(last.value)}${unitOf('Potassium')} is above the danger level of ${POTASSIUM_CRITICAL.toFixed(1)}.`
          : `Potassium ${fmt(last.value)}${unitOf('Potassium')} is above the alert level of ${POTASSIUM_WARNING.toFixed(1)} (above ${POTASSIUM_CRITICAL.toFixed(1)} is urgent).`,
      })
    }
  }

  // 4. Tacrolimus outside the patient's target (else the reference range).
  {
    const last = latest('Tacrolimus')
    const range = effectiveRange('Tacrolimus', targets)
    if (last && range) {
      const side = outside(last.value, range.min, range.max)
      if (side) {
        push({
          kind: 'tacrolimus-target',
          severity: 'warning',
          testName: 'Tacrolimus',
          value: last.value,
          threshold: side === 'low' ? range.min : range.max,
          recordId: last.recordId,
          date: last.date,
          message: `Tacrolimus ${fmt(last.value)}${unitOf('Tacrolimus')} is ${side === 'low' ? 'below' : 'above'} the ${range.source === 'target' ? "patient's target" : 'usual range'} of ${describeRange(range.min, range.max)}.`,
        })
      }
    }
  }

  // 5. Any other value outside its patient-specific Target.
  for (const [testName, t] of Array.from(targets.entries())) {
    if (testName === 'Tacrolimus') continue
    const min = num(t.min)
    const max = num(t.max)
    if (min == null && max == null) continue
    const last = latest(testName)
    if (!last) continue
    const side = outside(last.value, min, max)
    if (!side) continue
    // Potassium already has its own (stronger) high alert.
    if (testName === 'Potassium' && side === 'high' && last.value > POTASSIUM_WARNING) continue
    push({
      kind: 'outside-target',
      severity: 'warning',
      testName,
      value: last.value,
      threshold: side === 'low' ? min : max,
      recordId: last.recordId,
      date: last.date,
      message: `${testName} ${fmt(last.value)}${unitOf(testName)} is ${side === 'low' ? 'below' : 'above'} the patient's target of ${describeRange(min, max)}.`,
    })
  }

  // 6. User-defined alert rules.
  for (const rule of rules) {
    if (typeof rule.testName !== 'string') continue
    const last = latest(rule.testName)
    if (!last) continue
    const threshold = num(rule.threshold)
    const label = rule.label ? ` (${rule.label})` : ''
    const base = { testName: rule.testName, value: last.value, recordId: last.recordId, date: last.date, severity: 'warning' as const }

    if (rule.op === 'above' && threshold != null && last.value > threshold) {
      push({ ...base, kind: 'rule-above', threshold, message: `${rule.testName} ${fmt(last.value)}${unitOf(rule.testName)} is above your alert level of ${fmt(threshold)}${label}.` }, rule.id)
    } else if (rule.op === 'below' && threshold != null && last.value < threshold) {
      push({ ...base, kind: 'rule-below', threshold, message: `${rule.testName} ${fmt(last.value)}${unitOf(rule.testName)} is below your alert level of ${fmt(threshold)}${label}.` }, rule.id)
    } else if (rule.op === 'change-pct' && threshold != null && threshold > 0) {
      const b = baselineOf(series(rule.testName))
      if (b != null && b !== 0) {
        const pct = pctChange(last.value, b)
        if (Math.abs(pct) > threshold) {
          push({ ...base, kind: 'rule-change', threshold: round(b), message: `${rule.testName} ${fmt(last.value)}${unitOf(rule.testName)} has ${pct > 0 ? 'risen' : 'fallen'} ${Math.round(Math.abs(pct))}% from the recent baseline of ${fmt(b)} (your alert: ${fmt(threshold)}%)${label}.` }, rule.id)
        }
      }
    } else if (rule.op === 'outside-target') {
      const range = effectiveRange(rule.testName, targets)
      if (!range) continue
      const side = outside(last.value, range.min, range.max)
      if (!side) continue
      // Already reported by the built-in target rules.
      if (range.source === 'target' || rule.testName === 'Tacrolimus') continue
      push({ ...base, kind: 'rule-outside-target', threshold: side === 'low' ? range.min : range.max, message: `${rule.testName} ${fmt(last.value)}${unitOf(rule.testName)} is outside the usual range of ${describeRange(range.min, range.max)}${label}.` }, rule.id)
    }
  }

  // De-duplicate by id and sort: critical first, then newest.
  const seen = new Set<string>()
  return alerts
    .filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true)))
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}
