import { REFERENCE_RANGES } from '@/lib/constants/reference-ranges'
import type { Target } from '@/lib/types/care'

/**
 * Patient-specific target resolution.
 *
 * Each bound of a test's "normal" range is resolved independently with the
 * precedence
 *
 *   doctor's target (patients/{pid}/targets/{testName})
 *     > range printed on the lab report (LabValue.referenceMin/Max)
 *     > REFERENCE_RANGES default
 *
 * so a one-sided target ("eGFR at least 45") keeps the other bound from the
 * report or the default. Pure functions only; no Firebase.
 */

/** The parts of a Target that resolution needs. */
export type TargetLike = Pick<Target, 'min' | 'max'> & Partial<Pick<Target, 'unit' | 'setBy' | 'notes'>>

/** Targets keyed by testName (the Firestore doc id). */
export type TargetMap = Record<string, TargetLike | undefined>

export type RangeSource = 'target' | 'record' | 'default'

export interface ResolvedRange {
  /** Lower bound, or null when unbounded below. */
  min: number | null
  /** Upper bound, or null when unbounded above. */
  max: number | null
  /** Where the bounds came from: 'target' if either bound is the doctor's target. */
  source: RangeSource
  /** The target itself when source === 'target' (for "set by" / notes labels). */
  target?: TargetLike
}

/** Any min/max pair (either side may be open). */
export interface Bounds {
  min?: number | null
  max?: number | null
}

/** Printed reference range on a lab value (both optional). */
export interface RecordRangeRefs {
  referenceMin?: number | null
  referenceMax?: number | null
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Target[] (e.g. from a Firestore listing) → map keyed by testName. */
export function toTargetMap(targets: readonly (TargetLike & { testName: string })[]): TargetMap {
  const map: TargetMap = {}
  for (const t of targets) map[t.testName] = t
  return map
}

/** True when the target constrains at least one bound. */
export function hasTargetBounds(t: TargetLike | undefined | null): t is TargetLike {
  return !!t && (isNum(t.min) || isNum(t.max))
}

/**
 * Resolve the range a value should be judged against.
 *
 * @param testName  REFERENCE_RANGES key (exact string)
 * @param value     the lab value's printed range, if any (pass `undefined` for
 *                  "no particular record", e.g. a chart band)
 * @param targets   patient targets keyed by testName (optional)
 * @returns the resolved bounds, or null when nothing at all is known
 *          (unknown test, no printed range, no target)
 */
export function resolveRange(
  testName: string,
  value?: RecordRangeRefs | null,
  targets?: TargetMap | null
): ResolvedRange | null {
  const target = targets?.[testName]
  const ref = REFERENCE_RANGES[testName]

  const recordMin = isNum(value?.referenceMin) ? value!.referenceMin! : null
  const recordMax = isNum(value?.referenceMax) ? value!.referenceMax! : null
  const targetMin = isNum(target?.min) ? target!.min! : null
  const targetMax = isNum(target?.max) ? target!.max! : null

  const pick = (t: number | null, r: number | null, d: number | null): [number | null, RangeSource | null] => {
    if (t != null) return [t, 'target']
    if (r != null) return [r, 'record']
    if (d != null) return [d, 'default']
    return [null, null]
  }

  let [min, minSrc] = pick(targetMin, recordMin, ref ? ref.min : null)
  let [max, maxSrc] = pick(targetMax, recordMax, ref ? ref.max : null)

  // A one-sided target can conflict with the other, non-target bound
  // (e.g. target min 12 vs printed max 10). The doctor's target wins: drop
  // the conflicting bound and leave that side open.
  if (min != null && max != null && min > max) {
    if (minSrc === 'target' && maxSrc !== 'target') [max, maxSrc] = [null, null]
    else if (maxSrc === 'target' && minSrc !== 'target') [min, minSrc] = [null, null]
    else [min, max] = [max, min] // both from the same source and inverted: swap
  }

  if (min == null && max == null) return null

  const source: RangeSource =
    minSrc === 'target' || maxSrc === 'target'
      ? 'target'
      : minSrc === 'record' || maxSrc === 'record'
        ? 'record'
        : 'default'

  return source === 'target' ? { min, max, source, target } : { min, max, source }
}

/** Is `value` inside the (possibly one-sided) range? Bounds are inclusive. */
export function isInRange(value: number, range: Bounds): boolean {
  if (range.min != null && value < range.min) return false
  if (range.max != null && value > range.max) return false
  return true
}

/**
 * Width used to normalise deviation outside a range. Two-sided: max − min.
 * One-sided: the default REFERENCE_RANGES width for the test if positive,
 * else the magnitude of the bound, else 1.
 */
export function rangeWidth(testName: string, range: Bounds): number {
  if (range.min != null && range.max != null) return range.max - range.min
  const ref = REFERENCE_RANGES[testName]
  const refWidth = ref ? ref.max - ref.min : 0
  if (refWidth > 0) return refWidth
  const bound = range.min ?? range.max ?? 0
  return Math.abs(bound) || 1
}

/** Distance outside the range (0 when inside). */
export function deviationFromRange(value: number, range: Bounds): number {
  if (range.min != null && value < range.min) return range.min - value
  if (range.max != null && value > range.max) return value - range.max
  return 0
}

/**
 * good / warning / danger for a value, using the resolved range. Same rule
 * as getStatusColor in lib/utils.ts (outside by ≤ 50 % of the range width is
 * borderline), but target-aware and one-sided-aware. Unknown ranges are 'good'.
 */
export function valueStatus(
  testName: string,
  value: number,
  refs?: RecordRangeRefs | null,
  targets?: TargetMap | null
): 'good' | 'warning' | 'danger' {
  const range = resolveRange(testName, refs, targets)
  if (!range) return 'good'
  const deviation = deviationFromRange(value, range)
  if (deviation === 0) return 'good'
  const width = rangeWidth(testName, range)
  return width > 0 && deviation / width <= 0.5 ? 'warning' : 'danger'
}

/** "5–8", "≥ 45", "≤ 200" for display. */
export function formatRange(range: Bounds): string {
  if (range.min != null && range.max != null) return `${range.min}–${range.max}`
  if (range.min != null) return `≥ ${range.min}`
  if (range.max != null) return `≤ ${range.max}`
  return '—'
}

/** Tests offered first in the targets editor (most commonly targeted after a transplant). */
export const COMMON_TARGET_TESTS = ['Tacrolimus', 'Creatinine', 'eGFR', 'Potassium', 'Hemoglobin'] as const

/**
 * Validate a target before saving. Returns an error message or null.
 * At least one bound; bounds finite; min ≤ max.
 */
export function validateTargetBounds(min: number | null | undefined, max: number | null | undefined): string | null {
  const hasMin = min != null
  const hasMax = max != null
  if (!hasMin && !hasMax) return 'Set a minimum, a maximum, or both.'
  if ((hasMin && !Number.isFinite(min)) || (hasMax && !Number.isFinite(max))) return 'Enter numbers only.'
  if (hasMin && hasMax && (min as number) > (max as number)) return 'Minimum must not be above maximum.'
  return null
}
