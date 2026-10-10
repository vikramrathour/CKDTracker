import type { Vital } from '@/lib/types/care'

/**
 * Vitals: validation limits, simple clinical flags and grouping helpers.
 * Pure functions, no Firebase. Flags are deliberately simple prompts to call
 * the transplant team, not diagnoses.
 */

export type VitalKey = 'systolic' | 'diastolic' | 'pulse' | 'weightKg' | 'temperatureC' | 'glucose' | 'urineOutputMl'

export interface VitalLimit {
  min: number
  max: number
  unit: string
  label: string
  /** Decimal places accepted / shown. */
  step: number
}

/** Plausible input ranges: rejects typos (e.g. 1200 for BP) without second-guessing real readings. */
export const VITAL_LIMITS: Record<VitalKey, VitalLimit> = {
  systolic: { min: 50, max: 260, unit: 'mmHg', label: 'Systolic', step: 1 },
  diastolic: { min: 30, max: 160, unit: 'mmHg', label: 'Diastolic', step: 1 },
  pulse: { min: 25, max: 220, unit: 'bpm', label: 'Pulse', step: 1 },
  weightKg: { min: 20, max: 250, unit: 'kg', label: 'Weight', step: 0.1 },
  temperatureC: { min: 32, max: 43, unit: '°C', label: 'Temperature', step: 0.1 },
  glucose: { min: 20, max: 700, unit: 'mg/dL', label: 'Blood glucose', step: 1 },
  urineOutputMl: { min: 0, max: 10000, unit: 'mL', label: 'Urine output', step: 10 },
}

export const VITAL_KEYS = Object.keys(VITAL_LIMITS) as VitalKey[]

// ---- flags ----

export type FlagLevel = 'warning' | 'critical'

export interface VitalFlag {
  kind: 'bp' | 'temperature' | 'weight'
  level: FlagLevel
  message: string
}

/** BP thresholds (mmHg). */
export const BP_WARNING = { systolic: 140, diastolic: 90 } as const
export const BP_CRITICAL = { systolic: 180, diastolic: 120 } as const
/** Fever threshold (°C): infection risk on immunosuppression. */
export const FEVER_C = 38
/** Weight change (kg) within WEIGHT_WINDOW_DAYS that suggests fluid change. */
export const WEIGHT_CHANGE_KG = 2
export const WEIGHT_WINDOW_DAYS = 3

/** BP ≥ 180/120 critical; ≥ 140/90 warning (either number crossing is enough). */
export function bpFlag(systolic?: number | null, diastolic?: number | null): VitalFlag | null {
  const s = systolic ?? null
  const d = diastolic ?? null
  if (s == null && d == null) return null
  const reading = `${s ?? '–'}/${d ?? '–'}`
  if ((s != null && s >= BP_CRITICAL.systolic) || (d != null && d >= BP_CRITICAL.diastolic)) {
    return { kind: 'bp', level: 'critical', message: `BP ${reading} is very high. Recheck after resting; if it stays this high, contact the transplant team now.` }
  }
  if ((s != null && s >= BP_WARNING.systolic) || (d != null && d >= BP_WARNING.diastolic)) {
    return { kind: 'bp', level: 'warning', message: `BP ${reading} is above 140/90.` }
  }
  return null
}

/** Temperature ≥ 38 °C: warning (fever on immunosuppression). */
export function temperatureFlag(temperatureC?: number | null): VitalFlag | null {
  if (temperatureC == null || temperatureC < FEVER_C) return null
  return {
    kind: 'temperature',
    level: 'warning',
    message: `Temperature ${temperatureC} °C. Fever can mean infection after a transplant; tell the transplant team.`,
  }
}

const DAY_MS = 24 * 60 * 60 * 1000

const time = (iso: string) => new Date(iso).getTime()

/**
 * Weight change of more than 2 kg against any earlier weight within the
 * previous 3 days (fluid gain or loss). `history` may include `vital` itself
 * and readings in any order; only earlier readings are compared.
 */
export function weightChangeFlag(vital: Pick<Vital, 'recordedAt' | 'weightKg'> & { id?: string }, history: readonly Pick<Vital, 'recordedAt' | 'weightKg'>[]): VitalFlag | null {
  if (vital.weightKg == null) return null
  const t = time(vital.recordedAt)
  if (!Number.isFinite(t)) return null
  let worst: { delta: number; days: number } | null = null
  for (const h of history) {
    if (h === vital || h.weightKg == null) continue
    const ht = time(h.recordedAt)
    if (!Number.isFinite(ht) || ht >= t || t - ht > WEIGHT_WINDOW_DAYS * DAY_MS) continue
    const delta = vital.weightKg - h.weightKg
    if (Math.abs(delta) > WEIGHT_CHANGE_KG && (!worst || Math.abs(delta) > Math.abs(worst.delta))) {
      worst = { delta, days: (t - ht) / DAY_MS }
    }
  }
  if (!worst) return null
  const sign = worst.delta > 0 ? '+' : '−'
  const kg = Math.abs(Math.round(worst.delta * 10) / 10)
  const days = Math.max(1, Math.round(worst.days))
  return {
    kind: 'weight',
    level: 'warning',
    message: `Weight ${sign}${kg} kg in ${days} day${days === 1 ? '' : 's'}. ${worst.delta > 0 ? 'Rapid gain can be fluid retention' : 'Rapid loss can be dehydration'}; mention it to the transplant team.`,
  }
}

/** Every flag for one reading (weight needs the other readings). */
export function flagsForVital(vital: Vital, history: readonly Vital[] = []): VitalFlag[] {
  return [bpFlag(vital.systolic, vital.diastolic), temperatureFlag(vital.temperatureC), weightChangeFlag(vital, history)].filter(
    (f): f is VitalFlag => f !== null
  )
}

/** Highest level among flags, or null. */
export function worstLevel(flags: readonly VitalFlag[]): FlagLevel | null {
  if (flags.some((f) => f.level === 'critical')) return 'critical'
  return flags.length > 0 ? 'warning' : null
}

// ---- grouping / series ----

/** Local calendar day 'YYYY-MM-DD' of an ISO timestamp. */
export function localDay(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Readings grouped by local day, newest day first, newest reading first within a day. */
export function groupVitalsByDay<T extends Pick<Vital, 'recordedAt'>>(vitals: readonly T[]): { day: string; items: T[] }[] {
  const sorted = [...vitals].sort((a, b) => time(b.recordedAt) - time(a.recordedAt))
  const groups: { day: string; items: T[] }[] = []
  for (const v of sorted) {
    const day = localDay(v.recordedAt)
    const last = groups[groups.length - 1]
    if (last && last.day === day) last.items.push(v)
    else groups.push({ day, items: [v] })
  }
  return groups
}

/** Oldest-first points for one measurement (readings without it are skipped). */
export function vitalSeries(vitals: readonly Vital[], key: VitalKey): { date: string; value: number }[] {
  return vitals
    .filter((v) => typeof v[key] === 'number' && Number.isFinite(v[key]))
    .sort((a, b) => time(a.recordedAt) - time(b.recordedAt))
    .map((v) => ({ date: v.recordedAt, value: v[key] as number }))
}

/** Oldest-first BP pairs (either number may be missing). */
export function bpSeries(vitals: readonly Vital[]): { date: string; systolic: number | null; diastolic: number | null }[] {
  return vitals
    .filter((v) => v.systolic != null || v.diastolic != null)
    .sort((a, b) => time(a.recordedAt) - time(b.recordedAt))
    .map((v) => ({ date: v.recordedAt, systolic: v.systolic ?? null, diastolic: v.diastolic ?? null }))
}

/** True when a reading carries at least one measurement. */
export function hasAnyMeasurement(v: Partial<Record<VitalKey, number | null | undefined>>): boolean {
  return VITAL_KEYS.some((k) => typeof v[k] === 'number' && Number.isFinite(v[k] as number))
}
