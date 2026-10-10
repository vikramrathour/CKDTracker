import { describe, expect, it } from 'vitest'
import { computeDelta, formatDelta } from '@/lib/calculations/deltas'
import {
  computeAgeGapDeficit,
  computeVolatility,
  countTimesAboveRange,
  determineCKDStage,
  getMedicationInteractions,
} from '@/lib/calculations/analysis'
import type { LabValue } from '@/lib/types/lab-record'
import type { Medication } from '@/lib/types/medication'

describe('computeDelta', () => {
  it('computes absolute and percentage change, rounded', () => {
    const d = computeDelta('Creatinine', 1.2, 1.0)
    expect(d.absolute).toBe(0.2)
    expect(d.percentage).toBe(20)
    expect(d.direction).toBe('up')
  })

  it('rounds absolute to 2 dp and percentage to 1 dp', () => {
    const d = computeDelta('Sodium', 140, 137)
    expect(d.absolute).toBe(3)
    expect(d.percentage).toBe(2.2) // 2.1897...
  })

  it('is stable when |change| < 1%', () => {
    const d = computeDelta('Sodium', 140.5, 140)
    expect(d.direction).toBe('stable')
    expect(d.isGood).toBe(true)
  })

  it('treats exactly 1% as a real change', () => {
    expect(computeDelta('Sodium', 101, 100).direction).toBe('up')
    expect(computeDelta('Sodium', 99, 100).direction).toBe('down')
  })

  it('lower-is-better tests: down is good, up is bad', () => {
    expect(computeDelta('Creatinine', 1.0, 1.4).isGood).toBe(true)
    expect(computeDelta('Creatinine', 1.4, 1.0).isGood).toBe(false)
  })

  it('higher-is-better tests (eGFR, HDL, Hemoglobin): up is good, down is bad', () => {
    expect(computeDelta('eGFR', 70, 60).isGood).toBe(true)
    expect(computeDelta('eGFR', 60, 70).isGood).toBe(false)
    expect(computeDelta('HDL Cholesterol', 50, 40).isGood).toBe(true)
    expect(computeDelta('Hemoglobin', 14, 12).isGood).toBe(true)
  })

  it('does not divide by zero when previous is 0', () => {
    const d = computeDelta('Urine Protein', 0, 0)
    expect(d.percentage).toBe(0)
    expect(d.direction).toBe('stable')
  })

  it('a change from a previous value of 0 is not "stable"', () => {
    const d = computeDelta('Urine Protein', 30, 0)
    expect(d.absolute).toBe(30)
    expect(d.percentage).toBe(0)
    expect(d.direction).toBe('up')
    expect(d.isGood).toBe(false)
  })

  it('a fall to 0 from a non-zero value is "down"', () => {
    const d = computeDelta('Urine Protein', 0, 30)
    expect(d.direction).toBe('down')
    expect(d.percentage).toBe(-100)
    expect(d.isGood).toBe(true)
  })
})

describe('formatDelta', () => {
  it('formats up, down and stable', () => {
    expect(formatDelta({ absolute: 0.2, percentage: 20, direction: 'up', isGood: false })).toBe('+20%')
    expect(formatDelta({ absolute: -0.2, percentage: -16.7, direction: 'down', isGood: true })).toBe('-16.7%')
    expect(formatDelta({ absolute: 0, percentage: 0.4, direction: 'stable', isGood: true })).toBe('~0%')
  })

  it('shows the absolute change instead of a percentage when previous was 0', () => {
    expect(formatDelta(computeDelta('Urine Protein', 30, 0))).toBe('+30')
    expect(formatDelta(computeDelta('Urine Protein', -5, 0))).toBe('-5')
  })
})

describe('determineCKDStage', () => {
  it.each([
    [120, '1', '≥90'],
    [90, '1', '≥90'],
    [89.9, '2', '60-89'],
    [89, '2', '60-89'],
    [60, '2', '60-89'],
    [59, '3a', '45-59'],
    [45, '3a', '45-59'],
    [44, '3b', '30-44'],
    [30, '3b', '30-44'],
    [29, '4', '15-29'],
    [15, '4', '15-29'],
  ])('eGFR %s -> stage %s (%s)', (egfr, stage, range) => {
    const s = determineCKDStage(egfr)
    expect(s.stage).toBe(stage)
    expect(s.eGFRRange).toBe(range)
    expect(s.label).toBe(`Stage ${stage}`)
    expect(s.description.length).toBeGreaterThan(0)
  })

  it.each([14.9, 14, 5, 0])('eGFR %s returns a well-formed stage 5', (egfr) => {
    const s = determineCKDStage(egfr)
    expect(s).toEqual({
      stage: '5',
      label: 'Stage 5',
      eGFRRange: expect.any(String),
      description: 'Kidney failure',
    })
    expect(s.eGFRRange).not.toMatch(/NaN|undefined|∞/)
    expect(s.eGFRRange).toBe('0-14')
  })

  it.each([-1, NaN])('degenerate eGFR %s still returns stage 5', (egfr) => {
    const s = determineCKDStage(egfr)
    expect(s.stage).toBe('5')
    expect(s.label).toBe('Stage 5')
    expect(s.eGFRRange).toBe('<15')
  })
})

describe('computeVolatility', () => {
  it('returns zeros and stable for fewer than 2 values', () => {
    expect(computeVolatility([])).toEqual({ standardDeviation: 0, coefficientOfVariation: 0, isStable: true })
    expect(computeVolatility([5])).toEqual({ standardDeviation: 0, coefficientOfVariation: 0, isStable: true })
  })

  it('returns zero spread for identical values', () => {
    expect(computeVolatility([7, 7, 7])).toEqual({ standardDeviation: 0, coefficientOfVariation: 0, isStable: true })
  })

  it('uses the sample (n-1) standard deviation', () => {
    // mean 3, sample variance 2.5, sd 1.5811, cv 52.7%
    const v = computeVolatility([1, 2, 3, 4, 5])
    expect(v.standardDeviation).toBe(1.58)
    expect(v.coefficientOfVariation).toBe(52.7)
    expect(v.isStable).toBe(false)
  })

  it('is stable below 10% CV', () => {
    // mean 1.1, sd 0.1 -> cv 9.09%
    const v = computeVolatility([1.0, 1.1, 1.2])
    expect(v.standardDeviation).toBe(0.1)
    expect(v.coefficientOfVariation).toBe(9.1)
    expect(v.isStable).toBe(true)
  })

  it('is not stable at >= 10% CV', () => {
    // mean 10, sd 1 -> cv exactly 10%
    expect(computeVolatility([9, 10, 11]).isStable).toBe(false)
  })

  it('returns CV 0 when the mean is 0', () => {
    const v = computeVolatility([-1, 1])
    expect(v.coefficientOfVariation).toBe(0)
    expect(v.standardDeviation).toBe(1.41)
  })
})

describe('computeAgeGapDeficit', () => {
  it('expects 120 up to age 30', () => {
    expect(computeAgeGapDeficit(120, 20)).toBe(0)
    expect(computeAgeGapDeficit(100, 30)).toBe(20)
  })

  it('expects 1 mL/min/year decline after 30', () => {
    expect(computeAgeGapDeficit(70, 50)).toBe(30) // expected 100
    expect(computeAgeGapDeficit(100, 50)).toBe(0)
  })

  it('floors the expected eGFR at 60', () => {
    expect(computeAgeGapDeficit(60, 90)).toBe(0) // 120-60 = 60
    expect(computeAgeGapDeficit(60, 110)).toBe(0) // would be 40, floored to 60
    expect(computeAgeGapDeficit(30, 110)).toBe(30)
  })

  it('is negative when eGFR beats the expectation, and rounds', () => {
    expect(computeAgeGapDeficit(110, 60)).toBe(-20)
    expect(computeAgeGapDeficit(70.4, 50)).toBe(30) // 29.6 -> 30
  })
})

function med(name: string, isActive = true): Medication {
  return { id: name, name, dose: '1 mg', frequency: 'Once daily', category: 'Other', isActive }
}

function val(testName: string, isAbnormal: boolean, value = 1, referenceMax?: number): LabValue {
  return { testName, panel: 'kidney', value, unit: '', isAbnormal, referenceMax }
}

describe('getMedicationInteractions', () => {
  it('returns nothing for no or unrelated medications', () => {
    expect(getMedicationInteractions([], [])).toEqual([])
    expect(getMedicationInteractions([med('Vitamin D3')], [])).toEqual([])
  })

  it('tacrolimus: potassium + creatinine, moderate when values are normal', () => {
    const r = getMedicationInteractions([med('Tacrolimus')], [val('Potassium', false), val('Creatinine', false)])
    expect(r.map((x) => [x.affectedTest, x.severity])).toEqual([
      ['Potassium', 'moderate'],
      ['Creatinine', 'moderate'],
    ])
    expect(r.every((x) => x.medication === 'Tacrolimus')).toBe(true)
  })

  it('tacrolimus: severity escalates to high for abnormal values', () => {
    const r = getMedicationInteractions([med('Tacrolimus')], [val('Potassium', true), val('Creatinine', true)])
    expect(r.map((x) => x.severity)).toEqual(['high', 'high'])
  })

  it('tacrolimus: moderate when the lab value is missing', () => {
    const r = getMedicationInteractions([med('Tacrolimus')], [])
    expect(r.map((x) => x.severity)).toEqual(['moderate', 'moderate'])
  })

  it('matches medication names case-insensitively', () => {
    expect(getMedicationInteractions([med('TACROLIMUS')], [])).toHaveLength(2)
    expect(getMedicationInteractions([med('prednisolone')], [])).toHaveLength(1)
  })

  it('ignores inactive medications', () => {
    expect(getMedicationInteractions([med('Tacrolimus', false)], [])).toEqual([])
  })

  it('prednisolone, dapagliflozin and enalapril', () => {
    const r = getMedicationInteractions(
      [med('Prednisolone'), med('Dapagliflozin'), med('Enalapril')],
      [val('Potassium', true)]
    )
    expect(r.map((x) => [x.medication, x.affectedTest, x.severity])).toEqual([
      ['Prednisolone', 'WBC Count', 'low'],
      ['Dapagliflozin', 'eGFR', 'low'],
      ['Enalapril', 'Potassium', 'high'],
    ])
  })

  it('a full synthetic regimen produces all interactions in order', () => {
    const r = getMedicationInteractions(
      [med('Tacrolimus'), med('Prednisolone'), med('Mycophenolate'), med('Dapagliflozin'), med('Enalapril')],
      []
    )
    expect(r.map((x) => `${x.medication}:${x.affectedTest}`)).toEqual([
      'Tacrolimus:Potassium',
      'Tacrolimus:Creatinine',
      'Prednisolone:WBC Count',
      'Dapagliflozin:eGFR',
      'Enalapril:Potassium',
    ])
  })
})

describe('countTimesAboveRange', () => {
  it('counts abnormal values above referenceMax per test', () => {
    const counts = countTimesAboveRange([
      [val('Creatinine', true, 1.5, 1.3), val('Potassium', false, 4.0, 5.1)],
      [val('Creatinine', true, 1.6, 1.3), val('Potassium', true, 5.5, 5.1)],
      [val('Creatinine', true, 0.5, 1.3)], // abnormal but below range
    ])
    expect(counts).toEqual({ Creatinine: 2, Potassium: 1 })
  })

  it('ignores values without a referenceMax', () => {
    expect(countTimesAboveRange([[val('Creatinine', true, 5)]])).toEqual({})
  })

  it('counts values above a referenceMax of 0', () => {
    expect(countTimesAboveRange([[val('Urine Protein', true, 30, 0)]])).toEqual({ 'Urine Protein': 1 })
  })
})
