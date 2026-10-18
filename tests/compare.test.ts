import { describe, expect, it } from 'vitest'
import { buildComparison } from '@/lib/calculations/compare'
import type { LabRecord, LabValue, Panel } from '@/lib/types/lab-record'

// Synthetic records only.

let seq = 0
function v(testName: string, value: number, panel: Panel = 'kidney', extra: Partial<LabValue> = {}): LabValue {
  return { testName, panel, value, unit: '', isAbnormal: false, ...extra }
}
function rec(date: string, values: LabValue[], extra: Partial<LabRecord> = {}): LabRecord {
  seq += 1
  return { id: `r${seq}`, recordDate: `${date}T00:00:00.000Z`, labName: 'Synthetic Lab', values, ...extra }
}

describe('buildComparison: snapshot (no anchor)', () => {
  it('takes the last three readings per test, newest first, across partial reports', () => {
    const records = [
      rec('2026-01-10', [v('Creatinine', 1.1), v('Potassium', 4.2, 'electrolytes')]),
      rec('2026-02-10', [v('Creatinine', 1.2)]),
      rec('2026-03-10', [v('Tacrolimus', 7.5, 'tacrolimus')]),
      rec('2026-04-10', [v('Creatinine', 1.25), v('Potassium', 4.4, 'electrolytes')]),
      rec('2026-05-10', [v('Creatinine', 1.3)]),
    ]
    const c = buildComparison(records)
    const cr = c.rows.find((r) => r.testName === 'Creatinine')!
    expect(cr.cells.map((x) => x?.value)).toEqual([1.3, 1.25, 1.2])
    expect(cr.cells[0]?.date.slice(0, 10)).toBe('2026-05-10')
    const k = c.rows.find((r) => r.testName === 'Potassium')!
    expect(k.cells.map((x) => x?.value ?? null)).toEqual([4.4, 4.2, null])
    const tac = c.rows.find((r) => r.testName === 'Tacrolimus')!
    expect(tac.cells.map((x) => x?.value ?? null)).toEqual([7.5, null, null])
    expect(tac.delta).toBeNull()
    expect(c.latestDate?.slice(0, 10)).toBe('2026-05-10')
  })

  it('computes the delta against the reading just before the latest', () => {
    const c = buildComparison([rec('2026-01-01', [v('Creatinine', 1.0)]), rec('2026-02-01', [v('Creatinine', 1.2)])])
    const cr = c.rows[0]
    expect(cr.delta).toMatchObject({ direction: 'up', percentage: 20, isGood: false })
  })

  it('respects depth', () => {
    const records = [1, 2, 3, 4].map((m) => rec(`2026-0${m}-01`, [v('Creatinine', m)]))
    expect(buildComparison(records, { depth: 2 }).rows[0].cells.map((x) => x?.value)).toEqual([4, 3])
  })

  it('puts out-of-range latest values in attention (danger first, critical first) and not in their panel', () => {
    const records = [
      rec('2026-01-01', [
        v('Creatinine', 1.0),
        v('Potassium', 5.3, 'electrolytes'), // borderline (≤ 50 % of width outside 3.5–5.1)
        v('Sodium', 125, 'electrolytes'), // far below 136–146: danger
        v('Hemoglobin', 14, 'hemogram'),
      ]),
      rec('2026-02-01', [
        v('Creatinine', 2.5), // danger, critical
        v('Potassium', 5.3, 'electrolytes'),
        v('Sodium', 125, 'electrolytes'),
        v('Hemoglobin', 14, 'hemogram'),
      ]),
    ]
    const c = buildComparison(records)
    expect(c.attention.map((r) => r.testName)).toEqual(['Creatinine', 'Sodium', 'Potassium'])
    expect(c.attention.map((r) => r.status)).toEqual(['danger', 'danger', 'warning'])
    const electrolytes = c.groups.find((g) => g.id === 'electrolytes')
    expect(electrolytes).toBeUndefined() // both electrolytes are in attention
    const hemogram = c.groups.find((g) => g.id === 'hemogram')!
    expect(hemogram.rows.map((r) => r.testName)).toEqual(['Hemoglobin'])
    expect(hemogram.outCount).toBe(0)
  })

  it('orders panels like PANELS, then other tests by name, then older results', () => {
    const records = [
      rec('2025-01-01', [v('Total Cholesterol', 150, 'lipid')]),
      rec('2026-03-01', [
        v('Zinc', 90, 'other', { referenceMin: 60, referenceMax: 120 }),
        v('ESR', 10, 'other', { referenceMin: 0, referenceMax: 15 }),
        v('Hemoglobin', 14, 'hemogram'),
        v('Creatinine', 1.0),
      ]),
    ]
    const c = buildComparison(records)
    expect(c.groups.map((g) => g.id)).toEqual(['hemogram', 'kidney', 'other', 'older'])
    expect(c.groups.find((g) => g.id === 'other')!.rows.map((r) => r.testName)).toEqual(['ESR', 'Zinc'])
    expect(c.groups.find((g) => g.id === 'older')!.rows.map((r) => r.testName)).toEqual(['Total Cholesterol'])
  })

  it('judges other tests against their printed range and uses targets for known tests', () => {
    const records = [
      rec('2026-01-01', [
        v('SGPT (ALT)', 60, 'other', { referenceMax: 45, unit: 'U/L' }),
        v('Tacrolimus', 9, 'tacrolimus'),
      ]),
    ]
    const c = buildComparison(records, { targets: { Tacrolimus: { min: 5, max: 8 } } })
    expect(c.attention.map((r) => r.testName).sort()).toEqual(['SGPT (ALT)', 'Tacrolimus'])
    const alt = c.attention.find((r) => r.testName === 'SGPT (ALT)')!
    expect(alt.label).toBe('SGPT (ALT)')
    expect(alt.unit).toBe('U/L')
    expect(alt.range).toMatchObject({ min: null, max: 45, source: 'record' })
  })

  it('returns an empty comparison for no records', () => {
    const c = buildComparison([])
    expect(c).toMatchObject({ rows: [], attention: [], groups: [], latestDate: null })
  })
})

describe('buildComparison: anchored on a report', () => {
  const a = rec('2026-01-01', [v('Creatinine', 1.0), v('Urea', 30)])
  const b = rec('2026-02-01', [v('Creatinine', 1.1)])
  const sameDayEarlier = rec('2026-03-01', [v('Creatinine', 1.15)])
  const anchor = rec('2026-03-01', [v('Creatinine', 1.2), v('Urea', 35)])
  const later = rec('2026-04-01', [v('Creatinine', 9.9), v('Urea', 99)])
  const records = [a, b, sameDayEarlier, anchor, later]

  it("only includes the anchor's tests and ignores later reports", () => {
    const c = buildComparison(records, { anchorRecordId: anchor.id })
    expect(c.rows.map((r) => r.testName).sort()).toEqual(['Creatinine', 'Urea'])
    const cr = c.rows.find((r) => r.testName === 'Creatinine')!
    expect(cr.cells.map((x) => x?.value)).toEqual([1.2, 1.15, 1.1])
    expect(cr.cells[0]?.recordId).toBe(anchor.id)
    const urea = c.rows.find((r) => r.testName === 'Urea')!
    expect(urea.cells.map((x) => x?.value ?? null)).toEqual([35, 30, null])
    expect(c.latestDate?.slice(0, 10)).toBe('2026-03-01')
  })

  it('never puts anchored rows in the older group', () => {
    const c = buildComparison(records, { anchorRecordId: a.id })
    expect(c.groups.map((g) => g.id)).toEqual(['kidney'])
  })

  it('returns an empty comparison for an unknown anchor', () => {
    expect(buildComparison(records, { anchorRecordId: 'nope' }).rows).toEqual([])
  })
})
