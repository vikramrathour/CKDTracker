import { describe, expect, it } from 'vitest'
import {
  COMMON_TARGET_TESTS,
  deviationFromRange,
  formatRange,
  hasTargetBounds,
  isInRange,
  rangeWidth,
  resolveRange,
  toTargetMap,
  validateTargetBounds,
  valueStatus,
  type TargetMap,
} from '@/lib/calculations/targets'
import { REFERENCE_RANGES } from '@/lib/constants/reference-ranges'
import { targetFormSchema } from '@/components/targets/target-schema'

// Synthetic targets only.
const TARGETS: TargetMap = {
  Tacrolimus: { min: 5, max: 8, setBy: 'Dr Example' },
  eGFR: { min: 45, max: null },
  Potassium: { min: null, max: 5.5 },
}

describe('resolveRange — precedence', () => {
  it('falls back to REFERENCE_RANGES with no record range and no target', () => {
    expect(resolveRange('Creatinine')).toEqual({ min: 0.7, max: 1.3, source: 'default' })
    expect(resolveRange('Creatinine', {}, {})).toEqual({ min: 0.7, max: 1.3, source: 'default' })
  })

  it('prefers the record-printed range over the default', () => {
    expect(resolveRange('Creatinine', { referenceMin: 0.6, referenceMax: 1.2 })).toEqual({
      min: 0.6,
      max: 1.2,
      source: 'record',
    })
  })

  it('mixes a one-sided printed range with the default other bound', () => {
    expect(resolveRange('Creatinine', { referenceMax: 1.4 })).toEqual({ min: 0.7, max: 1.4, source: 'record' })
  })

  it('prefers the target over both', () => {
    const r = resolveRange('Tacrolimus', { referenceMin: 4, referenceMax: 12 }, TARGETS)
    expect(r).toMatchObject({ min: 5, max: 8, source: 'target' })
    expect(r?.target?.setBy).toBe('Dr Example')
  })

  it('keeps the other bound from the record when the target is one-sided', () => {
    expect(resolveRange('eGFR', { referenceMin: 90, referenceMax: 130 }, TARGETS)).toMatchObject({
      min: 45,
      max: 130,
      source: 'target',
    })
    expect(resolveRange('Potassium', { referenceMin: 3.5, referenceMax: 5.1 }, TARGETS)).toMatchObject({
      min: 3.5,
      max: 5.5,
      source: 'target',
    })
  })

  it('keeps the other bound from the default when the target is one-sided and no record range', () => {
    expect(resolveRange('eGFR', undefined, TARGETS)).toMatchObject({ min: 45, max: REFERENCE_RANGES.eGFR.max, source: 'target' })
  })

  it('ignores null / undefined / NaN record bounds', () => {
    expect(resolveRange('Creatinine', { referenceMin: null, referenceMax: NaN })).toEqual({ min: 0.7, max: 1.3, source: 'default' })
  })

  it('ignores a target with no bounds', () => {
    expect(resolveRange('Creatinine', undefined, { Creatinine: { min: null, max: null } })).toEqual({
      min: 0.7,
      max: 1.3,
      source: 'default',
    })
  })

  it('a target for a test not in REFERENCE_RANGES still resolves', () => {
    expect(resolveRange('Ferritin', undefined, { Ferritin: { min: 30, max: 300 } })).toMatchObject({
      min: 30,
      max: 300,
      source: 'target',
    })
  })

  it('returns null when nothing is known', () => {
    expect(resolveRange('Unknown Test')).toBeNull()
    expect(resolveRange('Unknown Test', {}, {})).toBeNull()
  })

  it('unknown test with a printed range uses it', () => {
    expect(resolveRange('Unknown Test', { referenceMin: 1, referenceMax: 2 })).toEqual({ min: 1, max: 2, source: 'record' })
  })

  it('drops a conflicting non-target bound instead of producing min > max', () => {
    // Target min 12 vs printed max 10: the target wins, upper side opens.
    expect(resolveRange('Hemoglobin', { referenceMin: 8, referenceMax: 10 }, { Hemoglobin: { min: 12, max: null } })).toMatchObject({
      min: 12,
      max: null,
      source: 'target',
    })
    // Target max 0.5 vs default min 0.7.
    expect(resolveRange('Creatinine', undefined, { Creatinine: { min: null, max: 0.5 } })).toMatchObject({
      min: null,
      max: 0.5,
      source: 'target',
    })
  })

  it('swaps an inverted printed range', () => {
    expect(resolveRange('Creatinine', { referenceMin: 1.3, referenceMax: 0.7 })).toEqual({ min: 0.7, max: 1.3, source: 'record' })
  })

  it('fixes the eGFR "always abnormal" case when a target exists', () => {
    // Report prints the general-population range (>90); a transplant patient at 58
    // is abnormal against it but fine against a doctor's target of ≥ 45.
    const value = { testName: 'eGFR', value: 58, referenceMin: 90, referenceMax: 200 }
    expect(valueStatus('eGFR', value.value, value)).not.toBe('good')
    expect(valueStatus('eGFR', value.value, value, { eGFR: { min: 45, max: null } })).toBe('good')
  })
})

describe('range helpers', () => {
  it('isInRange is inclusive and supports open sides', () => {
    expect(isInRange(5, { min: 5, max: 8 })).toBe(true)
    expect(isInRange(8, { min: 5, max: 8 })).toBe(true)
    expect(isInRange(8.01, { min: 5, max: 8 })).toBe(false)
    expect(isInRange(1000, { min: 45, max: null })).toBe(true)
    expect(isInRange(-5, { min: null, max: 5.5 })).toBe(true)
  })

  it('deviationFromRange', () => {
    expect(deviationFromRange(6, { min: 5, max: 8 })).toBe(0)
    expect(deviationFromRange(4, { min: 5, max: 8 })).toBe(1)
    expect(deviationFromRange(10, { min: 5, max: 8 })).toBe(2)
    expect(deviationFromRange(30, { min: 45, max: null })).toBe(15)
  })

  it('rangeWidth uses the two-sided width, else the default width, else |bound|', () => {
    expect(rangeWidth('Tacrolimus', { min: 5, max: 8 })).toBe(3)
    expect(rangeWidth('eGFR', { min: 45, max: null })).toBe(REFERENCE_RANGES.eGFR.max - REFERENCE_RANGES.eGFR.min)
    expect(rangeWidth('Ferritin', { min: 30, max: null })).toBe(30)
    expect(rangeWidth('Ferritin', { min: 0, max: null })).toBe(1)
  })

  it('valueStatus: good / warning (≤ 50 % of width outside) / danger', () => {
    expect(valueStatus('Tacrolimus', 6, undefined, TARGETS)).toBe('good')
    expect(valueStatus('Tacrolimus', 9.5, undefined, TARGETS)).toBe('warning') // 1.5 over a width of 3
    expect(valueStatus('Tacrolimus', 9.6, undefined, TARGETS)).toBe('danger')
    expect(valueStatus('Tacrolimus', 9.6)).toBe('good') // default 5–10
    expect(valueStatus('Unknown Test', 123)).toBe('good')
  })

  it('formatRange', () => {
    expect(formatRange({ min: 5, max: 8 })).toBe('5–8')
    expect(formatRange({ min: 45, max: null })).toBe('≥ 45')
    expect(formatRange({ min: null, max: 5.5 })).toBe('≤ 5.5')
    expect(formatRange({ min: null, max: null })).toBe('—')
  })

  it('toTargetMap / hasTargetBounds', () => {
    const map = toTargetMap([{ testName: 'Tacrolimus', min: 5, max: 8 }, { testName: 'eGFR', min: null, max: null }])
    expect(Object.keys(map).sort()).toEqual(['Tacrolimus', 'eGFR'])
    expect(hasTargetBounds(map.Tacrolimus)).toBe(true)
    expect(hasTargetBounds(map.eGFR)).toBe(false)
    expect(hasTargetBounds(undefined)).toBe(false)
  })

  it('common target tests exist in REFERENCE_RANGES', () => {
    for (const t of COMMON_TARGET_TESTS) expect(REFERENCE_RANGES[t]).toBeDefined()
  })
})

describe('target validation', () => {
  it('validateTargetBounds', () => {
    expect(validateTargetBounds(null, null)).toMatch(/minimum, a maximum/)
    expect(validateTargetBounds(8, 5)).toMatch(/above maximum/)
    expect(validateTargetBounds(5, 5)).toBeNull()
    expect(validateTargetBounds(5, null)).toBeNull()
    expect(validateTargetBounds(null, 8)).toBeNull()
    expect(validateTargetBounds(NaN, 8)).toMatch(/numbers/)
  })

  it('targetFormSchema parses blanks to null and rejects bad input', () => {
    const ok = targetFormSchema.safeParse({ min: ' 5 ', max: '', setBy: ' Dr Example ', notes: '' })
    expect(ok.success && ok.data).toEqual({ min: 5, max: null, setBy: 'Dr Example', notes: '' })

    expect(targetFormSchema.safeParse({ min: '', max: '', setBy: '', notes: '' }).success).toBe(false)
    expect(targetFormSchema.safeParse({ min: 'abc', max: '', setBy: '', notes: '' }).success).toBe(false)
    const inverted = targetFormSchema.safeParse({ min: '9', max: '5', setBy: '', notes: '' })
    expect(inverted.success).toBe(false)
    if (!inverted.success) expect(inverted.error.issues[0].path).toEqual(['max'])
  })
})
