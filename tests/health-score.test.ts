import { describe, expect, it } from 'vitest'
import { computeHealthScore, getScoreColor, getScoreLabel } from '@/lib/calculations/health-score'
import { REFERENCE_RANGES } from '@/lib/constants/reference-ranges'
import type { LabValue } from '@/lib/types/lab-record'

/** Synthetic LabValue using REFERENCE_RANGES defaults (no record override). */
function lv(testName: string, value: number, overrides: Partial<LabValue> = {}): LabValue {
  const ref = REFERENCE_RANGES[testName]
  return {
    testName,
    panel: ref?.panel ?? 'kidney',
    value,
    unit: ref?.unit ?? '',
    isAbnormal: false,
    ...overrides,
  }
}

/** Mirror of the decay formula, for expected values. */
function decay(deviation: number, range: number): number {
  const pct = range > 0 ? deviation / range : 1
  return Math.max(0, Math.round(100 * (1 - Math.min(pct, 1) ** 0.8)))
}

describe('computeHealthScore — single value scoring', () => {
  it('scores in-range values (including the bounds) as 100', () => {
    for (const v of [0.7, 1.0, 1.3]) {
      const s = computeHealthScore([lv('Creatinine', v)])
      expect(s.systems.kidney).toBe(100)
      expect(s.overall).toBe(100)
    }
  })

  it('decays above the range relative to range width', () => {
    // Creatinine 0.7–1.3, width 0.6; 1.6 is 0.3 over → 50% of width
    const score = computeHealthScore([lv('Creatinine', 1.6)]).systems.kidney!
    expect(score).toBe(decay(0.3, 0.6))
    expect(score).toBe(43)
  })

  it('decays below the range symmetrically', () => {
    // Potassium 3.5–5.1 (width 1.6): 0.4 below and 0.4 above score the same
    const low = computeHealthScore([lv('Potassium', 3.1)]).systems.electrolytes
    const high = computeHealthScore([lv('Potassium', 5.5)]).systems.electrolytes
    expect(low).toBe(high)
    expect(low).toBe(decay(0.4, 1.6))
  })

  it('is monotonically non-increasing with deviation and floors at 0', () => {
    let prev = 101
    for (const v of [1.3, 1.35, 1.5, 1.8, 1.9, 2.5, 10]) {
      const s = computeHealthScore([lv('Creatinine', v)]).systems.kidney!
      expect(s).toBeLessThanOrEqual(prev)
      expect(s).toBeGreaterThanOrEqual(0)
      prev = s
    }
    expect(computeHealthScore([lv('Creatinine', 1.9)]).systems.kidney).toBe(0) // deviation == width
    expect(computeHealthScore([lv('Creatinine', 50)]).systems.kidney).toBe(0)
  })

  it('uses record-specific referenceMin/Max over the defaults', () => {
    // Default eGFR range is 60–120, so 70 would be in range...
    expect(computeHealthScore([lv('eGFR', 70)]).systems.kidney).toBe(100)
    // ...but a record range of 90–120 makes it 20 below a 30-wide range.
    const overridden = computeHealthScore([lv('eGFR', 70, { referenceMin: 90, referenceMax: 120 })])
    expect(overridden.systems.kidney).toBe(decay(20, 30))

    // A wider record range can bring an out-of-default value back in range.
    expect(computeHealthScore([lv('Creatinine', 1.4, { referenceMax: 1.5 })]).systems.kidney).toBe(100)
  })

  it('treats a referenceMin of 0 as an override (not as missing)', () => {
    // LDL default 0–100; an explicit 0 min must not fall back via ||
    expect(computeHealthScore([lv('LDL Cholesterol', 50, { referenceMin: 0, referenceMax: 100 })]).systems.lipid).toBe(100)
  })

  it('scores any deviation from a zero-width range as 0', () => {
    // Urine Protein is 0–0; but urine isn't a scored system, so use a record override
    expect(computeHealthScore([lv('Creatinine', 1.1, { referenceMin: 1, referenceMax: 1 })]).systems.kidney).toBe(0)
  })

  it('gives unknown tests a neutral 50 with default weight 3', () => {
    const unknown: LabValue = { testName: 'Mystery', panel: 'kidney', value: 1, unit: '', isAbnormal: false }
    expect(computeHealthScore([unknown]).systems.kidney).toBe(50)
    // weight 3 vs Creatinine weight 10: (50*3 + 100*10) / 13 = 88.46
    expect(computeHealthScore([unknown, lv('Creatinine', 1)]).systems.kidney).toBe(88)
  })
})

describe('computeHealthScore — weighting', () => {
  it('weights values within a system by REFERENCE_RANGES weight', () => {
    // Creatinine (w10) = 100, Uric Acid (w5) out of range
    const uric = 9.0 // range 3.5–7.2 (width 3.7), 1.8 over
    const uricScore = decay(1.8, 3.7)
    const s = computeHealthScore([lv('Creatinine', 1.0), lv('Uric Acid', uric)])
    expect(s.systems.kidney).toBe(Math.round((100 * 10 + uricScore * 5) / 15))
  })

  it('weights systems kidney 3, immunosuppression 3, electrolytes 2, hemogram 2, lipid 1', () => {
    // kidney 100 (w3) + lipid 0 (w1) = 75
    const a = computeHealthScore([lv('Creatinine', 1.0), lv('LDL Cholesterol', 1000)])
    expect(a.systems.kidney).toBe(100)
    expect(a.systems.lipid).toBe(0)
    expect(a.overall).toBe(75)

    // hemogram 0 (w2) + tacrolimus 100 (w3) = 60
    const b = computeHealthScore([lv('Hemoglobin', 0), lv('Tacrolimus', 7)])
    expect(b.systems.hemogram).toBe(0)
    expect(b.systems.immunosuppression).toBe(100)
    expect(b.overall).toBe(60)

    // electrolytes 0 (w2) + lipid 100 (w1) = 33
    const c = computeHealthScore([lv('Sodium', 0), lv('Triglycerides', 100)])
    expect(c.overall).toBe(33)
  })

  it('maps the tacrolimus panel to the immunosuppression system', () => {
    const s = computeHealthScore([lv('Tacrolimus', 7)])
    expect(s.systems.immunosuppression).toBe(100)
    expect(s.systems.kidney).toBeNull()
  })
})

describe('computeHealthScore — missing data', () => {
  it('returns null for unmeasured systems and excludes them from overall', () => {
    const s = computeHealthScore([lv('Creatinine', 1.6)])
    expect(s.systems).toEqual({
      kidney: 43,
      immunosuppression: null,
      electrolytes: null,
      hemogram: null,
      lipid: null,
    })
    // Overall is the kidney score alone, not dragged down by missing systems
    expect(s.overall).toBe(43)
  })

  it('returns overall null when nothing is measured', () => {
    const s = computeHealthScore([])
    expect(s.overall).toBeNull()
    expect(Object.values(s.systems).every((x) => x === null)).toBe(true)
  })

  it('ignores the urine panel (not a scored system)', () => {
    const s = computeHealthScore([lv('Urine pH', 6), lv('Specific Gravity', 1.02)])
    expect(s.overall).toBeNull()
  })
})

describe('getScoreColor / getScoreLabel', () => {
  it('uses 80 / 60 / 40 thresholds', () => {
    expect(getScoreColor(80)).toBe('#10b981')
    expect(getScoreColor(79)).toBe('#f59e0b')
    expect(getScoreColor(60)).toBe('#f59e0b')
    expect(getScoreColor(59)).toBe('#ef4444')
    expect(getScoreLabel(100)).toBe('Good')
    expect(getScoreLabel(80)).toBe('Good')
    expect(getScoreLabel(79)).toBe('Fair')
    expect(getScoreLabel(60)).toBe('Fair')
    expect(getScoreLabel(59)).toBe('Concerning')
    expect(getScoreLabel(40)).toBe('Concerning')
    expect(getScoreLabel(39)).toBe('Critical')
    expect(getScoreLabel(0)).toBe('Critical')
  })
})

describe('computeHealthScore — patient targets', () => {
  it('without targets behaves exactly as before (old signature)', () => {
    const values = [lv('Creatinine', 1.6), lv('eGFR', 50), lv('Tacrolimus', 9)]
    expect(computeHealthScore(values, undefined)).toEqual(computeHealthScore(values))
    expect(computeHealthScore(values, {})).toEqual(computeHealthScore(values))
  })

  it('a target overrides the printed range (eGFR no longer "always abnormal")', () => {
    // Report prints the general-population range; doctor's target is ≥ 45.
    const egfr = lv('eGFR', 58, { referenceMin: 90, referenceMax: 200 })
    expect(computeHealthScore([egfr]).systems.kidney).toBeLessThan(100)
    expect(computeHealthScore([egfr], { eGFR: { min: 45, max: null } }).systems.kidney).toBe(100)
  })

  it('a tighter target can lower the score', () => {
    // Tacrolimus 9.5 is inside the default 5–10 but above a 5–8 target (1.5 over width 3).
    const tac = lv('Tacrolimus', 9.5)
    expect(computeHealthScore([tac]).systems.immunosuppression).toBe(100)
    expect(computeHealthScore([tac], { Tacrolimus: { min: 5, max: 8 } }).systems.immunosuppression).toBe(decay(1.5, 3))
  })

  it('one-sided target keeps the default other bound for the width', () => {
    // eGFR target ≥ 45 + default max 120 → width 75; value 30 is 15 below.
    const s = computeHealthScore([lv('eGFR', 30)], { eGFR: { min: 45, max: null } }).systems.kidney
    expect(s).toBe(decay(15, 75))
  })

  it('open-sided range (conflicting bound dropped) decays against the default width', () => {
    // Target max 0.5 conflicts with default min 0.7 → range ≤ 0.5; width falls back to 0.6.
    const s = computeHealthScore([lv('Creatinine', 0.8)], { Creatinine: { min: null, max: 0.5 } }).systems.kidney
    expect(s).toBe(decay(0.3, 0.6))
  })

  it('a target makes an otherwise-unknown test scoreable', () => {
    // Unknown tests are neutral (50) and not in any system, so check through a known panel
    const unknown = { ...lv('Ferritin', 10), panel: 'hemogram' as const }
    expect(computeHealthScore([unknown]).systems.hemogram).toBe(50)
    expect(computeHealthScore([unknown], { Ferritin: { min: 30, max: 300 } }).systems.hemogram).toBe(decay(20, 270))
  })
})
