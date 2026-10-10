import type { DoseChange } from '@/lib/types/care'
import type { Medication } from '@/lib/types/medication'

/**
 * Medication helpers: extended doc shapes (fields Phase 6a adds on top of
 * lib/types), dose parsing and the dose-vs-level series for the tacrolimus
 * chart. Pure functions, no Firebase.
 */

export const TIMES_OF_DAY = ['morning', 'afternoon', 'evening', 'night'] as const
export type TimeOfDay = (typeof TIMES_OF_DAY)[number]

/**
 * patients/{pid}/medications/{id} as Phase 6a writes it. Extra fields are
 * optional so pre-6a / migrated docs still fit.
 */
export interface MedicationDoc extends Medication {
  /** When reminders should fire (Phase 7). */
  timeOfDay?: TimeOfDay[]
  /** YYYY-MM-DD the patient started it. */
  startDate?: string | null
  /** YYYY-MM-DD it was stopped (set with isActive: false). */
  stoppedAt?: string | null
  stopReason?: string
  updatedAt?: string
}

/**
 * patients/{pid}/medications/{mid}/doseHistory/{id}. DoseChange from
 * lib/types/care.ts plus frequency tracking; `effectiveDate` is the date the
 * new dose applies "from", `createdBy` is who recorded the change.
 */
export interface DoseHistoryEntry extends DoseChange {
  frequency?: string
  previousFrequency?: string | null
  changedByName?: string
}

/** Tacrolimus brand / generic names (India + international). */
const TACROLIMUS_RE = /tacro|prograf|advagraf|pangraf|tacrograf|envarsus|astagraf|graftac|tacrodus/i

/**
 * The lab test (REFERENCE_RANGES key) that measures this drug's blood level,
 * or null. Only tacrolimus has a tracked level today.
 */
export function levelTestForMedication(med: Pick<Medication, 'name'>): string | null {
  return TACROLIMUS_RE.test(med.name) ? 'Tacrolimus' : null
}

/** Show the dose-history chart for immunosuppressants and anything with a tracked level. */
export function showsDoseChart(med: Pick<Medication, 'name' | 'category'>): boolean {
  return med.category === 'Immunosuppressant' || levelTestForMedication(med) != null
}

const NUM = String.raw`\d+(?:\.\d+)?|\.\d+`

/**
 * Split-dose notation used on Indian prescriptions: "1-0-1", "1 + 0.5",
 * "1.5 mg + 1 mg", "2-0-1.5". Returns the parts, or null when the string is
 * a single amount.
 */
function splitParts(dose: string): number[] | null {
  const cleaned = dose.toLowerCase().replace(/mg|mcg|µg|g\b|ml|tab(let)?s?|cap(sule)?s?/g, ' ')
  const re = new RegExp(String.raw`^\s*(${NUM})\s*(?:([+\-–])\s*(${NUM})\s*)+$`)
  if (!re.test(cleaned)) return null
  const parts = cleaned.match(new RegExp(NUM, 'g'))
  return parts && parts.length > 1 ? parts.map(Number) : null
}

/**
 * First numeric amount in a dose string ("1.5 mg" → 1.5, "0.5mg" → 0.5).
 * Split notation ("1-0-1") returns the sum. null when there is no number.
 */
export function parseDoseAmount(dose: string): number | null {
  if (!dose) return null
  const parts = splitParts(dose)
  if (parts) return parts.reduce((s, n) => s + n, 0)
  const m = dose.match(new RegExp(NUM))
  return m ? Number(m[0]) : null
}

/** Administrations per day from a free-text frequency; null when unknown. */
export function dosesPerDay(frequency: string): number | null {
  const f = (frequency || '').toLowerCase()
  if (!f.trim()) return null
  if (/\b(qid|qds)\b|four times|4 ?times|6[- ]?hourly|every 6 ?h/.test(f)) return 4
  if (/\b(tds|tid)\b|thrice|three times|3 ?times|8[- ]?hourly|every 8 ?h/.test(f)) return 3
  if (/\b(bd|bid)\b|twice|two times|2 ?times|12[- ]?hourly|every 12 ?h/.test(f)) return 2
  if (/alternate|every other day|\bevery 2 days\b/.test(f)) return 0.5
  if (/weekly|once a week/.test(f)) return 1 / 7
  if (/\b(od|qd|hs)\b|once|daily|every day|at night|bedtime|in the morning|1 ?time/.test(f)) return 1
  return null
}

/**
 * Total amount per day. Split notation ("1-0-1", "1+0.5") is already a daily
 * total; otherwise amount × doses per day (× 1 when the frequency is unknown).
 */
export function dailyDose(dose: string, frequency: string): number | null {
  if (splitParts(dose)) return parseDoseAmount(dose)
  const amount = parseDoseAmount(dose)
  if (amount == null) return null
  const perDay = dosesPerDay(frequency) ?? 1
  return Math.round(amount * perDay * 1000) / 1000
}

/** Did an edit change the dose or the frequency (ignoring case and spacing)? */
export function isDoseChange(
  before: Pick<Medication, 'dose' | 'frequency'>,
  after: Pick<Medication, 'dose' | 'frequency'>
): boolean {
  const norm = (s: string) => (s || '').trim().replace(/\s+/g, ' ').toLowerCase()
  return norm(before.dose) !== norm(after.dose) || norm(before.frequency) !== norm(after.frequency)
}

// ---- dose vs level series ----

export interface DoseStep {
  /** ms since epoch (start of the effective day, UTC) */
  t: number
  /** total per day, or null when unparseable */
  daily: number | null
  /** "1.5 mg · Twice daily" */
  label: string
  reason?: string
}

export interface LevelPoint {
  t: number
  value: number
}

export interface DoseLevelSeries {
  levels: LevelPoint[]
  /** Step series, oldest first; the last step is extended to `end`. */
  steps: DoseStep[]
  /** Dose changes after the first step (vertical markers). */
  changes: DoseStep[]
  start: number
  end: number
}

/** 'YYYY-MM-DD' or ISO → ms; NaN when invalid. */
export function toTime(date: string | null | undefined): number {
  if (!date) return NaN
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T00:00:00Z` : date
  return new Date(iso).getTime()
}

/**
 * Build the chart series for a medication: drug levels from lab records
 * (`levelTest`), and a dose step line from its dose history. With no history
 * the current dose is drawn flat across the window (from startDate when
 * known). A stopped medication's line ends at stoppedAt.
 */
export function buildDoseLevelSeries(
  med: Pick<MedicationDoc, 'dose' | 'frequency' | 'startDate' | 'stoppedAt' | 'isActive'>,
  history: readonly Pick<DoseHistoryEntry, 'dose' | 'frequency' | 'effectiveDate' | 'reason'>[],
  records: readonly { recordDate: string; values: readonly { testName: string; value: number }[] }[],
  levelTest: string | null,
  now: number = Date.now()
): DoseLevelSeries {
  const levels: LevelPoint[] = levelTest
    ? records
        .map((r) => {
          const v = r.values.find((x) => x.testName === levelTest)
          const t = toTime(r.recordDate)
          return v && Number.isFinite(t) && Number.isFinite(v.value) ? { t, value: v.value } : null
        })
        .filter((p): p is LevelPoint => p !== null)
        .sort((a, b) => a.t - b.t)
    : []

  const label = (dose: string, frequency?: string) => [dose, frequency].filter(Boolean).join(' · ')

  let steps: DoseStep[] = history
    .map((h) => {
      const frequency = h.frequency ?? med.frequency
      return {
        t: toTime(h.effectiveDate),
        daily: dailyDose(h.dose, frequency),
        label: label(h.dose, frequency),
        reason: h.reason,
      }
    })
    .filter((s) => Number.isFinite(s.t))
    .sort((a, b) => a.t - b.t)

  const stopT = med.isActive === false ? toTime(med.stoppedAt) : NaN
  const firstLevel = levels[0]?.t
  const startT = toTime(med.startDate)

  if (steps.length === 0) {
    const t = Number.isFinite(startT) ? startT : firstLevel ?? now
    steps = [{ t, daily: dailyDose(med.dose, med.frequency), label: label(med.dose, med.frequency) }]
  }

  const lastLevel = levels[levels.length - 1]?.t ?? -Infinity
  const lastStep = steps[steps.length - 1].t
  // Active: run to today (or the latest level, if later). Stopped: end at stoppedAt.
  const end = Number.isFinite(stopT) ? Math.max(stopT, lastStep) : Math.max(now, lastLevel, lastStep)
  const start = Math.min(steps[0].t, firstLevel ?? Infinity)

  return { levels, steps, changes: steps.slice(1), start, end }
}

/**
 * Step-line points for Recharts (`type="stepAfter"`): one point per change
 * plus a closing point at `end` so the last dose spans to the right edge.
 */
export function stepLinePoints(series: Pick<DoseLevelSeries, 'steps' | 'end'>): { t: number; daily: number | null; label: string }[] {
  if (series.steps.length === 0) return []
  const pts = series.steps.map((s) => ({ t: s.t, daily: s.daily, label: s.label }))
  const last = series.steps[series.steps.length - 1]
  if (series.end > last.t) pts.push({ t: series.end, daily: last.daily, label: last.label })
  return pts
}
