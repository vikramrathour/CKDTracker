import { describe, expect, it } from 'vitest'
import { computeTrendData, linearRegression } from '@/lib/calculations/trends'
import { REFERENCE_RANGES } from '@/lib/constants/reference-ranges'
import type { LabRecord } from '@/lib/types/lab-record'

describe('linearRegression', () => {
  it('fits a perfect line exactly', () => {
    const r = linearRegression([
      { x: 0, y: 1 },
      { x: 1, y: 3 },
      { x: 2, y: 5 },
      { x: 3, y: 7 },
    ])
    expect(r.slope).toBeCloseTo(2, 10)
    expect(r.intercept).toBeCloseTo(1, 10)
    expect(r.rSquared).toBeCloseTo(1, 10)
  })

  it('fits a perfect decreasing line', () => {
    const r = linearRegression([
      { x: 10, y: 0 },
      { x: 20, y: -5 },
    ])
    expect(r.slope).toBeCloseTo(-0.5, 10)
    expect(r.intercept).toBeCloseTo(5, 10)
    expect(r.rSquared).toBeCloseTo(1, 10)
  })

  it('returns zero slope and rSquared 0 for a flat series', () => {
    const r = linearRegression([
      { x: 0, y: 4 },
      { x: 5, y: 4 },
      { x: 9, y: 4 },
    ])
    expect(r.slope).toBe(0)
    expect(r.intercept).toBeCloseTo(4, 10)
    expect(r.rSquared).toBe(0)
  })

  it('returns zeros for fewer than 2 points', () => {
    expect(linearRegression([])).toEqual({ slope: 0, intercept: 0, rSquared: 0 })
    expect(linearRegression([{ x: 3, y: 9 }])).toEqual({ slope: 0, intercept: 0, rSquared: 0 })
  })

  it('returns the mean as intercept when all x are identical', () => {
    const r = linearRegression([
      { x: 2, y: 1 },
      { x: 2, y: 3 },
      { x: 2, y: 8 },
    ])
    expect(r).toEqual({ slope: 0, intercept: 4, rSquared: 0 })
  })

  it('computes rSquared between 0 and 1 for noisy data', () => {
    const r = linearRegression([
      { x: 0, y: 1 },
      { x: 1, y: 2 },
      { x: 2, y: 1.5 },
      { x: 3, y: 3.5 },
    ])
    expect(r.slope).toBeGreaterThan(0)
    expect(r.rSquared).toBeGreaterThan(0)
    expect(r.rSquared).toBeLessThan(1)
  })
})

function rec(recordDate: string, values: Record<string, number>): LabRecord {
  return {
    id: recordDate,
    recordDate,
    labName: 'Synthetic Lab',
    values: Object.entries(values).map(([testName, value]) => ({
      testName,
      panel: REFERENCE_RANGES[testName]?.panel ?? 'kidney',
      value,
      unit: REFERENCE_RANGES[testName]?.unit ?? '',
      isAbnormal: false,
    })),
  }
}

describe('computeTrendData', () => {
  it('returns null with fewer than 2 data points for the test', () => {
    expect(computeTrendData([], 'Creatinine')).toBeNull()
    expect(computeTrendData([rec('2025-01-01', { Creatinine: 1 })], 'Creatinine')).toBeNull()
    expect(
      computeTrendData([rec('2025-01-01', { Creatinine: 1 }), rec('2025-02-01', { Sodium: 140 })], 'Creatinine')
    ).toBeNull()
  })

  it('sorts records chronologically before regressing', () => {
    const t = computeTrendData(
      [rec('2025-03-01', { Creatinine: 1.4 }), rec('2025-01-01', { Creatinine: 1.0 }), rec('2025-02-01', { Creatinine: 1.2 })],
      'Creatinine'
    )!
    expect(t.points.map((p) => p.date)).toEqual(['2025-01-01', '2025-02-01', '2025-03-01'])
    expect(t.points.map((p) => p.value)).toEqual([1.0, 1.2, 1.4])
  })

  it('computes min / max / avg and slope per day', () => {
    // +10 over 10 days -> slope 1/day
    const t = computeTrendData([rec('2025-01-01', { Sodium: 130 }), rec('2025-01-11', { Sodium: 140 })], 'Sodium')!
    expect(t.min).toBe(130)
    expect(t.max).toBe(140)
    expect(t.avg).toBe(135)
    expect(t.slope).toBe(1)
    expect(t.rSquared).toBe(1)
    expect(t.unit).toBe('mEq/L')
    expect(t.testName).toBe('Sodium')
  })

  it('rising lower-is-better test (Creatinine) is worsening; falling is improving', () => {
    const up = computeTrendData([rec('2025-01-01', { Creatinine: 1.0 }), rec('2025-01-31', { Creatinine: 1.6 })], 'Creatinine')!
    expect(up.direction).toBe('worsening')
    const down = computeTrendData([rec('2025-01-01', { Creatinine: 1.6 }), rec('2025-01-31', { Creatinine: 1.0 })], 'Creatinine')!
    expect(down.direction).toBe('improving')
  })

  it('rising higherIsBetter test (eGFR, HDL) is improving; falling is worsening', () => {
    const up = computeTrendData([rec('2025-01-01', { eGFR: 50 }), rec('2025-03-01', { eGFR: 70 })], 'eGFR')!
    expect(up.direction).toBe('improving')
    const down = computeTrendData([rec('2025-01-01', { eGFR: 70 }), rec('2025-03-01', { eGFR: 50 })], 'eGFR')!
    expect(down.direction).toBe('worsening')
    const hdl = computeTrendData([rec('2025-01-01', { 'HDL Cholesterol': 35 }), rec('2025-06-01', { 'HDL Cholesterol': 50 })], 'HDL Cholesterol')!
    expect(hdl.direction).toBe('improving')
  })

  it('is stable when |slope| < 0.001 per day', () => {
    const flat = computeTrendData([rec('2025-01-01', { eGFR: 70 }), rec('2025-06-01', { eGFR: 70 })], 'eGFR')!
    expect(flat.direction).toBe('stable')
    // 0.01 over 365 days ≈ 0.000027/day
    const tiny = computeTrendData([rec('2024-01-01', { Creatinine: 1.1 }), rec('2024-12-31', { Creatinine: 1.11 })], 'Creatinine')!
    expect(tiny.direction).toBe('stable')
  })

  it('handles unknown tests (no ref) as lower-is-better with empty unit', () => {
    const t = computeTrendData([rec('2025-01-01', { Mystery: 1 }), rec('2025-01-11', { Mystery: 5 })], 'Mystery')!
    expect(t.unit).toBe('')
    expect(t.direction).toBe('worsening')
  })

  it('rising Hemoglobin trend agrees with deltas (improving)', () => {
    const t = computeTrendData([rec('2025-01-01', { Hemoglobin: 11 }), rec('2025-03-01', { Hemoglobin: 13 })], 'Hemoglobin')!
    expect(t.direction).toBe('improving')
  })
})
