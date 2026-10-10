import { describe, expect, it } from 'vitest'
import { buildVisitPrep, findPreviousVisit, visitAlerts } from '@/lib/visits/prep'
import { splitVisits, type VisitRecord } from '@/lib/visits/types'
import { toLabValue } from '@/lib/parsing/metropolis'
import type { LabRecord, LabValue } from '@/lib/types/lab-record'
import type { Medication } from '@/lib/types/medication'
import type { Question } from '@/lib/types/care'

// Synthetic data only.

function rec(id: string, date: string, vals: Record<string, number>): LabRecord {
  return {
    id,
    recordDate: `${date}T00:00:00.000Z`,
    labName: 'Test Lab',
    values: Object.entries(vals).map(([k, v]) => toLabValue(k, v) as LabValue),
  }
}

function visit(id: string, visitDate: string, extra: Partial<VisitRecord> = {}): VisitRecord {
  return { id, visitDate, createdBy: 'u1', ...extra }
}

const records = [
  rec('r1', '2026-01-10', { Creatinine: 1.1, eGFR: 70, Tacrolimus: 7, Potassium: 4.2 }),
  rec('r2', '2026-02-10', { Creatinine: 1.2, eGFR: 66, Tacrolimus: 8 }),
  rec('r3', '2026-03-05', { Creatinine: 1.5, eGFR: 52, Tacrolimus: 11.5, Hemoglobin: 12.1 }),
  rec('r4', '2026-03-20', { Creatinine: 1.4, eGFR: 55 }),
  rec('r5', '2026-05-01', { Creatinine: 1.0 }), // after the visit
]

const visits = [visit('v1', '2026-02-15', { advice: 'Repeat labs in 4 weeks' }), visit('v2', '2026-03-25')]

const meds: Medication[] = [
  { id: 'm1', name: 'Tacrolimus', dose: '2 mg', frequency: 'BD', category: 'Immunosuppressant', isActive: true },
  { id: 'm2', name: 'Old drug', dose: '5 mg', frequency: 'OD', category: 'Other', isActive: false },
]

const questions: Question[] = [
  { id: 'q1', text: 'Should the tacrolimus dose change?', status: 'open', createdBy: 'u1', createdAt: '2026-03-06T00:00:00Z' },
  { id: 'q2', text: 'Already answered', status: 'answered', createdBy: 'u1' },
  { id: 'q3', text: 'For another visit', status: 'open', visitId: 'other', createdBy: 'u1' },
  { id: 'q4', text: 'Asked here', status: 'asked', visitId: 'v2', source: 'chat', createdBy: 'u1', createdAt: '2026-03-07T00:00:00Z' },
]

describe('findPreviousVisit', () => {
  it('picks the latest visit strictly before', () => {
    expect(findPreviousVisit(visits[1], visits)?.id).toBe('v1')
    expect(findPreviousVisit(visits[0], visits)).toBeNull()
  })

  it('uses the time of day for same-day visits', () => {
    const a = visit('a', '2026-03-25', { visitTime: '09:00' })
    const b = visit('b', '2026-03-25', { visitTime: '15:30' })
    expect(findPreviousVisit(b, [a, b])?.id).toBe('a')
    expect(findPreviousVisit(a, [a, b])).toBeNull()
  })
})

describe('buildVisitPrep', () => {
  const summary = buildVisitPrep({ visit: visits[1], visits, records, medications: meds, questions })

  it('windows records after the previous visit up to the visit date', () => {
    expect(summary.since).toBe('2026-02-15')
    expect(summary.newRecords.map((r) => r.id)).toEqual(['r4', 'r3'])
    expect(summary.previousVisit).toEqual({ id: 'v1', visitDate: '2026-02-15', advice: 'Repeat labs in 4 weeks' })
  })

  it('computes deltas from the last value before the window', () => {
    const cr = summary.changes.find((c) => c.testName === 'Creatinine')!
    expect(cr.latest).toBe(1.4)
    expect(cr.latestDate).toBe('2026-03-20')
    expect(cr.baseline).toBe(1.2)
    expect(cr.baselineDate).toBe('2026-02-10')
    expect(cr.delta?.direction).toBe('up')
    expect(cr.delta?.isGood).toBe(false) // creatinine up is bad
    expect(cr.outOfRange).toBe(true)

    const egfr = summary.changes.find((c) => c.testName === 'eGFR')!
    expect(egfr.delta?.direction).toBe('down')
    expect(egfr.delta?.isGood).toBe(false) // higherIsBetter
  })

  it('marks tests new in the window with no baseline', () => {
    const hb = summary.changes.find((c) => c.testName === 'Hemoglobin')!
    expect(hb.baseline).toBeNull()
    expect(hb.delta).toBeNull()
    expect(hb.outOfRange).toBe(true)
  })

  it('orders critical metrics first and collects out-of-range values', () => {
    expect(summary.changes.slice(0, 3).map((c) => c.testName)).toEqual(['Creatinine', 'eGFR', 'Tacrolimus'])
    expect(summary.outOfRange.map((c) => c.testName)).toEqual(['Creatinine', 'eGFR', 'Tacrolimus', 'Hemoglobin'])
    expect(summary.changes.find((c) => c.testName === 'Potassium')).toBeUndefined()
  })

  it('gives a trend arrow once there are 3+ points', () => {
    const cr = summary.changes.find((c) => c.testName === 'Creatinine')!
    expect(cr.trend).toBe('up')
    expect(cr.trendGood).toBe(false)
    expect(summary.changes.find((c) => c.testName === 'Hemoglobin')!.trend).toBeNull()
  })

  it('prefers patient targets for out-of-range', () => {
    const s = buildVisitPrep({
      visit: visits[1], visits, records, medications: meds, questions,
      targets: { Tacrolimus: { min: 8, max: 12 } },
    })
    const tac = s.changes.find((c) => c.testName === 'Tacrolimus')!
    expect(tac.outOfRange).toBe(false)
    expect(tac.rangeSource).toBe('target')
  })

  it('lists active medications and open questions for this visit', () => {
    expect(summary.medications.map((m) => m.name)).toEqual(['Tacrolimus'])
    expect(summary.openQuestions.map((q) => q.id)).toEqual(['q1', 'q4'])
    expect(summary.openQuestions[1].source).toBe('chat')
    expect(summary.alerts).toEqual([])
  })

  it('falls back to the latest record when there is no previous visit', () => {
    const s = buildVisitPrep({ visit: visits[0], visits, records, medications: [], questions: [] })
    expect(s.since).toBeNull()
    expect(s.newRecords.map((r) => r.id)).toEqual(['r2'])
    const cr = s.changes.find((c) => c.testName === 'Creatinine')!
    expect(cr.baseline).toBe(1.1)
  })

  it('handles a patient with no records', () => {
    const s = buildVisitPrep({ visit: visits[1], visits, records: [], medications: [], questions: [] })
    expect(s.changes).toEqual([])
    expect(s.newRecords).toEqual([])
  })
})

describe('splitVisits', () => {
  it('sorts upcoming soonest first and past newest first', () => {
    const vs = [visit('a', '2026-01-01'), visit('b', '2026-12-01'), visit('c', '2026-11-01'), visit('d', '2026-06-01')]
    const { upcoming, past } = splitVisits(vs, '2026-10-10')
    expect(upcoming.map((v) => v.id)).toEqual(['c', 'b'])
    expect(past.map((v) => v.id)).toEqual(['d', 'a'])
  })
})

describe('visitAlerts', () => {
  const series = [
    rec('a', '2026-01-01', { Creatinine: 1.0 }),
    rec('b', '2026-02-01', { Creatinine: 1.0 }),
    rec('c', '2026-03-01', { Creatinine: 1.5, Potassium: 6.2 }),
    rec('d', '2026-04-01', { Creatinine: 1.0, Potassium: 4.0 }),
  ]

  it('flags what was true on the visit date, critical first', () => {
    const alerts = visitAlerts(series, '2026-03-10')
    expect(alerts.length).toBeGreaterThanOrEqual(2)
    expect(alerts.every((a) => a.severity === 'critical')).toBe(true)
    expect(alerts.map((a) => a.detail)).toContain('2026-03-01')
  })

  it('ignores records after the visit', () => {
    expect(visitAlerts(series, '2026-04-10')).toEqual([])
  })
})
