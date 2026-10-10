import { describe, expect, it } from 'vitest'
import { baselineOf, computeAlerts, median, seriesFor, type Alert } from '@/lib/calculations/alerts'
import type { LabRecord, LabValue } from '@/lib/types/lab-record'
import type { AlertRule, Target } from '@/lib/types/care'

// Synthetic data only.
let seq = 0
function rec(date: string, values: Record<string, number>): LabRecord {
  seq += 1
  return {
    id: `r${seq}`,
    recordDate: `${date}T00:00:00.000Z`,
    labName: 'Synthetic Lab',
    values: Object.entries(values).map(
      ([testName, value]): LabValue => ({ testName, value, unit: '', panel: 'kidney', isAbnormal: false })
    ),
  }
}

const target = (testName: string, min: number | null, max: number | null): Target => ({ testName, min, max, createdBy: 'u1' })
const rule = (r: Partial<AlertRule> & Pick<AlertRule, 'testName' | 'op'>): AlertRule => ({
  id: `rule-${r.testName}-${r.op}`,
  enabled: true,
  createdBy: 'u1',
  threshold: null,
  ...r,
})
const kinds = (alerts: Alert[]) => alerts.map((a) => a.kind)

describe('helpers', () => {
  it('median handles odd, even and empty', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([1, 4])).toBe(2.5)
    expect(median([])).toBeNull()
  })

  it('seriesFor sorts by date and skips records without the test', () => {
    const s = seriesFor([rec('2025-03-01', { Creatinine: 1.2 }), rec('2025-01-01', { Creatinine: 1.0 }), rec('2025-02-01', { eGFR: 70 })], 'Creatinine')
    expect(s.map((p) => p.value)).toEqual([1.0, 1.2])
    expect(s[0].date).toBe('2025-01-01')
  })

  it('baseline needs at least 2 prior values and uses at most 3', () => {
    const mk = (vals: number[]) => seriesFor(vals.map((v, i) => rec(`2025-01-${String(i + 1).padStart(2, '0')}`, { X: v })), 'X')
    expect(baselineOf(mk([1, 2]))).toBeNull()
    expect(baselineOf(mk([1, 2, 9]))).toBe(1.5)
    // only the 3 values before the latest: [10, 1, 2] → median 2 (the 100 is ignored)
    expect(baselineOf(mk([100, 10, 1, 2, 5]))).toBe(2)
  })
})

describe('computeAlerts — creatinine', () => {
  it('fires critical when > 20% above the median baseline', () => {
    const a = computeAlerts({
      records: [rec('2025-01-01', { Creatinine: 1.0 }), rec('2025-02-01', { Creatinine: 1.1 }), rec('2025-03-01', { Creatinine: 1.0 }), rec('2025-04-01', { Creatinine: 1.25 })],
    })
    expect(a).toHaveLength(1)
    expect(a[0]).toMatchObject({ kind: 'creatinine-rise', severity: 'critical', value: 1.25, threshold: 1.0, date: '2025-04-01' })
    expect(a[0].message).toContain('25% above')
  })

  it('does not fire at exactly 20%', () => {
    const a = computeAlerts({ records: [rec('2025-01-01', { Creatinine: 1.0 }), rec('2025-02-01', { Creatinine: 1.0 }), rec('2025-03-01', { Creatinine: 1.2 })] })
    expect(kinds(a)).not.toContain('creatinine-rise')
  })

  it('stays silent with fewer than 2 earlier values', () => {
    const a = computeAlerts({ records: [rec('2025-01-01', { Creatinine: 1.0 }), rec('2025-02-01', { Creatinine: 3.0 })] })
    expect(kinds(a)).not.toContain('creatinine-rise')
  })

  it('only judges the latest value (a past spike that resolved is not an alert)', () => {
    const a = computeAlerts({
      records: [rec('2025-01-01', { Creatinine: 1.0 }), rec('2025-02-01', { Creatinine: 1.0 }), rec('2025-03-01', { Creatinine: 2.0 }), rec('2025-04-01', { Creatinine: 1.0 })],
    })
    expect(kinds(a)).not.toContain('creatinine-rise')
  })

  it('is robust to unsorted input', () => {
    const a = computeAlerts({ records: [rec('2025-04-01', { Creatinine: 1.5 }), rec('2025-01-01', { Creatinine: 1.0 }), rec('2025-02-01', { Creatinine: 1.0 })] })
    expect(a[0]?.kind).toBe('creatinine-rise')
  })
})

describe('computeAlerts — eGFR', () => {
  it('warns on > 25% drop from baseline', () => {
    const a = computeAlerts({ records: [rec('2025-01-01', { eGFR: 60 }), rec('2025-02-01', { eGFR: 62 }), rec('2025-03-01', { eGFR: 58 }), rec('2025-04-01', { eGFR: 44 })] })
    expect(a.find((x) => x.kind === 'egfr-drop')).toMatchObject({ severity: 'warning', threshold: 60, value: 44 })
  })

  it('ignores a 25% drop exactly and any rise', () => {
    expect(computeAlerts({ records: [rec('2025-01-01', { eGFR: 60 }), rec('2025-02-01', { eGFR: 60 }), rec('2025-03-01', { eGFR: 45 })] })).toEqual([])
    expect(computeAlerts({ records: [rec('2025-01-01', { eGFR: 60 }), rec('2025-02-01', { eGFR: 60 }), rec('2025-03-01', { eGFR: 90 })] })).toEqual([])
  })
})

describe('computeAlerts — potassium', () => {
  it.each([
    [5.5, null],
    [5.6, 'warning'],
    [6.0, 'warning'],
    [6.1, 'critical'],
  ])('K⁺ %s → %s', (value, severity) => {
    const a = computeAlerts({ records: [rec('2025-01-01', { Potassium: value })] })
    if (severity == null) expect(a).toEqual([])
    else expect(a[0]).toMatchObject({ kind: 'potassium-high', severity, value })
  })

  it('a high K⁺ is not double-reported by a potassium target', () => {
    const a = computeAlerts({ records: [rec('2025-01-01', { Potassium: 6.3 })], targets: [target('Potassium', 3.5, 5.0)] })
    expect(kinds(a)).toEqual(['potassium-high'])
  })

  it('a K⁺ above the target but below 5.5 is reported by the target rule', () => {
    const a = computeAlerts({ records: [rec('2025-01-01', { Potassium: 5.2 })], targets: [target('Potassium', 3.5, 5.0)] })
    expect(a[0]).toMatchObject({ kind: 'outside-target', threshold: 5.0 })
  })
})

describe('computeAlerts — tacrolimus', () => {
  it('uses the patient target when set', () => {
    const a = computeAlerts({ records: [rec('2025-01-01', { Tacrolimus: 9 })], targets: [target('Tacrolimus', 5, 8)] })
    expect(a[0]).toMatchObject({ kind: 'tacrolimus-target', severity: 'warning', threshold: 8 })
    expect(a[0].message).toContain("patient's target of 5–8")
  })

  it('falls back to REFERENCE_RANGES (5–10) without a target', () => {
    expect(computeAlerts({ records: [rec('2025-01-01', { Tacrolimus: 9 })] })).toEqual([])
    const low = computeAlerts({ records: [rec('2025-01-01', { Tacrolimus: 4.2 })] })
    expect(low[0]).toMatchObject({ kind: 'tacrolimus-target', threshold: 5 })
    expect(low[0].message).toContain('below the usual range')
  })

  it('a target with only a max still applies; an empty target falls back', () => {
    expect(computeAlerts({ records: [rec('2025-01-01', { Tacrolimus: 7 })], targets: [target('Tacrolimus', null, 6)] })[0]?.threshold).toBe(6)
    expect(computeAlerts({ records: [rec('2025-01-01', { Tacrolimus: 7 })], targets: [target('Tacrolimus', null, null)] })).toEqual([])
  })

  it('accepts targets as a map keyed by test name', () => {
    const a = computeAlerts({ records: [rec('2025-01-01', { Tacrolimus: 9 })], targets: { Tacrolimus: target('Tacrolimus', 5, 8) } })
    expect(a).toHaveLength(1)
  })
})

describe('computeAlerts — targets', () => {
  it('flags any value outside its target, low or high', () => {
    const a = computeAlerts({
      records: [rec('2025-01-01', { Hemoglobin: 10.5, 'Uric Acid': 8 })],
      targets: [target('Hemoglobin', 11, null), target('Uric Acid', null, 7)],
    })
    expect(a.map((x) => [x.testName, x.threshold])).toEqual(
      expect.arrayContaining([
        ['Hemoglobin', 11],
        ['Uric Acid', 7],
      ])
    )
  })

  it('ignores targets for tests with no data', () => {
    expect(computeAlerts({ records: [], targets: [target('Hemoglobin', 11, 15)] })).toEqual([])
  })
})

describe('computeAlerts — user rules', () => {
  const records = [rec('2025-01-01', { Urea: 40 }), rec('2025-02-01', { Urea: 40 }), rec('2025-03-01', { Urea: 60 })]

  it('above / below', () => {
    expect(computeAlerts({ records, alertRules: [rule({ testName: 'Urea', op: 'above', threshold: 50 })] })[0]).toMatchObject({ kind: 'rule-above', threshold: 50 })
    expect(computeAlerts({ records, alertRules: [rule({ testName: 'Urea', op: 'below', threshold: 70 })] })[0]).toMatchObject({ kind: 'rule-below' })
    expect(computeAlerts({ records, alertRules: [rule({ testName: 'Urea', op: 'above', threshold: 60 })] })).toEqual([])
  })

  it('change-pct compares with baseline in either direction', () => {
    expect(computeAlerts({ records, alertRules: [rule({ testName: 'Urea', op: 'change-pct', threshold: 30 })] })[0]).toMatchObject({ kind: 'rule-change', threshold: 40 })
    expect(computeAlerts({ records, alertRules: [rule({ testName: 'Urea', op: 'change-pct', threshold: 60 })] })).toEqual([])
    const falling = [rec('2025-01-01', { Urea: 40 }), rec('2025-02-01', { Urea: 40 }), rec('2025-03-01', { Urea: 20 })]
    expect(computeAlerts({ records: falling, alertRules: [rule({ testName: 'Urea', op: 'change-pct', threshold: 30 })] })[0].message).toContain('fallen 50%')
  })

  it('outside-target uses the reference range when no target exists', () => {
    expect(computeAlerts({ records, alertRules: [rule({ testName: 'Urea', op: 'outside-target' })] })[0]).toMatchObject({ kind: 'rule-outside-target', threshold: 43 })
  })

  it('skips disabled rules, missing thresholds and unknown tests', () => {
    expect(
      computeAlerts({
        records,
        alertRules: [
          rule({ testName: 'Urea', op: 'above', threshold: 10, enabled: false }),
          rule({ testName: 'Urea', op: 'above', threshold: null }),
          rule({ testName: 'Nope', op: 'above', threshold: 1 }),
        ],
      })
    ).toEqual([])
  })

  it('includes the rule label and id', () => {
    const a = computeAlerts({ records, alertRules: [rule({ id: 'abc', testName: 'Urea', op: 'above', threshold: 50, label: 'Doctor asked' })] })
    expect(a[0].message).toContain('(Doctor asked)')
    expect(a[0].id).toContain(':abc')
  })
})

describe('computeAlerts — ordering and robustness', () => {
  it('sorts critical first, then newest', () => {
    const a = computeAlerts({
      records: [rec('2025-01-01', { Tacrolimus: 12 }), rec('2025-02-01', { Potassium: 6.4 }), rec('2025-03-01', { Tacrolimus: 13 })],
    })
    expect(a.map((x) => x.severity)).toEqual(['critical', 'warning'])
    expect(a[1].date).toBe('2025-03-01')
  })

  it('handles empty / malformed input', () => {
    expect(computeAlerts({ records: [] })).toEqual([])
    const bad = { ...rec('2025-01-01', {}), values: [{ testName: 'Potassium', value: NaN } as LabValue] }
    expect(computeAlerts({ records: [bad], targets: null, alertRules: null })).toEqual([])
  })

  it('a healthy, stable history yields no alerts', () => {
    const records = ['2025-01-01', '2025-02-01', '2025-03-01', '2025-04-01'].map((d) =>
      rec(d, { Creatinine: 1.1, eGFR: 72, Potassium: 4.6, Tacrolimus: 6.5 })
    )
    expect(computeAlerts({ records, targets: [target('Tacrolimus', 5, 8)] })).toEqual([])
  })
})
