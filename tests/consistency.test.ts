import { describe, expect, it } from 'vitest'
import { REFERENCE_RANGES, CKD_STAGES } from '@/lib/constants/reference-ranges'
import { ALL_TESTS, CRITICAL_METRICS, PANELS } from '@/lib/constants/test-panels'
import { METROPOLIS_PATTERNS } from '@/lib/parsing/metropolis'
import { PERSONAL_DATA } from '@/lib/personal/sample'
import { SEED_RECORDS } from '@/lib/constants/seed-data'
import { isDeltaPositive } from '@/lib/utils'

// The lab-test vocabulary must stay in sync across these sources (see CLAUDE.md):
// a name mismatch silently degrades scoring, panels and trends.

const refNames = new Set(Object.keys(REFERENCE_RANGES))

describe('lab test vocabulary', () => {
  it('every PANELS test exists in REFERENCE_RANGES', () => {
    expect(ALL_TESTS.filter((t) => !refNames.has(t))).toEqual([])
  })

  it('every PANELS test sits in the panel REFERENCE_RANGES assigns it', () => {
    const wrong = PANELS.flatMap((p) =>
      p.tests.filter((t) => REFERENCE_RANGES[t] && REFERENCE_RANGES[t].panel !== p.id).map((t) => `${p.id}:${t}`)
    )
    expect(wrong).toEqual([])
  })

  it('every REFERENCE_RANGES test appears in exactly one panel', () => {
    const counts: Record<string, number> = {}
    for (const t of ALL_TESTS) counts[t] = (counts[t] || 0) + 1
    expect(Object.keys(REFERENCE_RANGES).filter((t) => counts[t] !== 1)).toEqual([])
  })

  it('every METROPOLIS_PATTERNS key exists in REFERENCE_RANGES', () => {
    expect(Object.keys(METROPOLIS_PATTERNS).filter((t) => !refNames.has(t))).toEqual([])
  })

  it('CRITICAL_METRICS exist in REFERENCE_RANGES', () => {
    expect(CRITICAL_METRICS.filter((t) => !refNames.has(t))).toEqual([])
  })

  it('every testName in the synthetic sample seed records exists in REFERENCE_RANGES', () => {
    const names = PERSONAL_DATA.seedRecords.flatMap((r) => r.values.map((v) => v.testName))
    expect(names.length).toBeGreaterThan(0)
    expect(names.filter((t) => !refNames.has(t))).toEqual([])
  })

  it('sample seed values use the panel REFERENCE_RANGES assigns', () => {
    const wrong = PERSONAL_DATA.seedRecords.flatMap((r) =>
      r.values.filter((v) => REFERENCE_RANGES[v.testName]?.panel !== v.panel).map((v) => v.testName)
    )
    expect(wrong).toEqual([])
  })

  it('sample eGFR values use the REFERENCE_RANGES eGFR range', () => {
    const egfr = PERSONAL_DATA.seedRecords.flatMap((r) => r.values.filter((v) => v.testName === 'eGFR'))
    expect(egfr.length).toBeGreaterThan(0)
    for (const v of egfr) {
      expect(v.referenceMin).toBe(REFERENCE_RANGES['eGFR'].min)
      expect(v.referenceMax).toBe(REFERENCE_RANGES['eGFR'].max)
    }
  })

  it('sample isAbnormal flags agree with each value\'s own reference range', () => {
    const wrong = PERSONAL_DATA.seedRecords.flatMap((r) =>
      r.values
        .filter((v) => v.referenceMin != null && v.referenceMax != null)
        .filter((v) => v.isAbnormal !== (v.value < v.referenceMin! || v.value > v.referenceMax!))
        .map((v) => `${r.recordDate}:${v.testName}`)
    )
    expect(wrong).toEqual([])
  })

  it('SEED_RECORDS come from the synthetic sample', () => {
    expect(SEED_RECORDS).toBe(PERSONAL_DATA.seedRecords)
  })
})

describe('REFERENCE_RANGES sanity', () => {
  it.each(Object.entries(REFERENCE_RANGES))('%s has min <= max and weight 1–10', (_name, ref) => {
    expect(ref.min).toBeLessThanOrEqual(ref.max)
    expect(ref.weight).toBeGreaterThanOrEqual(1)
    expect(ref.weight).toBeLessThanOrEqual(10)
  })

  it('CKD_STAGES are ordered by descending minEGFR and end at 0', () => {
    const mins = CKD_STAGES.map((s) => s.minEGFR)
    expect([...mins].sort((a, b) => b - a)).toEqual(mins)
    expect(mins[mins.length - 1]).toBe(0)
  })
})

describe('delta direction source of truth', () => {
  it.each(Object.entries(REFERENCE_RANGES))('isDeltaPositive agrees with REFERENCE_RANGES for %s', (name, ref) => {
    expect(isDeltaPositive(name, 'up')).toBe(!!ref.higherIsBetter)
    expect(isDeltaPositive(name, 'down')).toBe(!ref.higherIsBetter)
  })

  it('Hemoglobin is higher-is-better', () => {
    expect(REFERENCE_RANGES['Hemoglobin'].higherIsBetter).toBe(true)
  })

  it('unknown tests default to lower-is-better', () => {
    expect(isDeltaPositive('Mystery', 'down')).toBe(true)
    expect(isDeltaPositive('Mystery', 'up')).toBe(false)
  })
})
