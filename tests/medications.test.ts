import { describe, expect, it } from 'vitest'
import {
  buildDoseLevelSeries,
  dailyDose,
  dosesPerDay,
  isDoseChange,
  levelTestForMedication,
  parseDoseAmount,
  showsDoseChart,
  stepLinePoints,
  toTime,
} from '@/lib/calculations/medications'
import { medicationFormSchema, stopFormSchema, todayISODate } from '@/components/medications/medication-schema'

describe('dose parsing', () => {
  it('parseDoseAmount', () => {
    expect(parseDoseAmount('1 mg')).toBe(1)
    expect(parseDoseAmount('1.5mg')).toBe(1.5)
    expect(parseDoseAmount('0.5 mg tablet')).toBe(0.5)
    expect(parseDoseAmount('.5 mg')).toBe(0.5)
    expect(parseDoseAmount('1-0-1')).toBe(2)
    expect(parseDoseAmount('1.5 mg + 1 mg')).toBe(2.5)
    expect(parseDoseAmount('as directed')).toBeNull()
    expect(parseDoseAmount('')).toBeNull()
  })

  it('dosesPerDay', () => {
    expect(dosesPerDay('Once daily')).toBe(1)
    expect(dosesPerDay('OD')).toBe(1)
    expect(dosesPerDay('At night')).toBe(1)
    expect(dosesPerDay('Twice daily (12-hourly)')).toBe(2)
    expect(dosesPerDay('BD')).toBe(2)
    expect(dosesPerDay('every 12 hours')).toBe(2)
    expect(dosesPerDay('TDS')).toBe(3)
    expect(dosesPerDay('Four times a day')).toBe(4)
    expect(dosesPerDay('Alternate days')).toBe(0.5)
    expect(dosesPerDay('Once a week')).toBeCloseTo(1 / 7)
    expect(dosesPerDay('as needed')).toBeNull()
    expect(dosesPerDay('')).toBeNull()
  })

  it('dailyDose multiplies by frequency unless the dose is split notation', () => {
    expect(dailyDose('1 mg', 'Twice daily')).toBe(2)
    expect(dailyDose('1.5 mg', 'BD')).toBe(3)
    expect(dailyDose('1-0-0.5', 'Twice daily')).toBe(1.5)
    expect(dailyDose('2 mg', 'as needed')).toBe(2)
    expect(dailyDose('see notes', 'BD')).toBeNull()
  })

  it('isDoseChange ignores case and whitespace', () => {
    expect(isDoseChange({ dose: '1 mg', frequency: 'BD' }, { dose: ' 1  MG ', frequency: 'bd' })).toBe(false)
    expect(isDoseChange({ dose: '1 mg', frequency: 'BD' }, { dose: '1.5 mg', frequency: 'BD' })).toBe(true)
    expect(isDoseChange({ dose: '1 mg', frequency: 'BD' }, { dose: '1 mg', frequency: 'OD' })).toBe(true)
  })
})

describe('medication → level test', () => {
  it('maps tacrolimus names and brands', () => {
    for (const name of ['Tacrolimus', 'Pangraf 1mg', 'Prograf', 'Advagraf XL', 'tacrograf']) {
      expect(levelTestForMedication({ name })).toBe('Tacrolimus')
    }
    expect(levelTestForMedication({ name: 'Mycophenolate' })).toBeNull()
  })

  it('showsDoseChart for immunosuppressants and level-tracked drugs', () => {
    expect(showsDoseChart({ name: 'Mycophenolate', category: 'Immunosuppressant' })).toBe(true)
    expect(showsDoseChart({ name: 'Pangraf', category: 'Other' })).toBe(true)
    expect(showsDoseChart({ name: 'Amlodipine', category: 'Antihypertensive' })).toBe(false)
  })
})

describe('buildDoseLevelSeries', () => {
  const records = [
    { recordDate: '2026-01-10T00:00:00.000Z', values: [{ testName: 'Tacrolimus', value: 9.2 }] },
    { recordDate: '2026-02-10T00:00:00.000Z', values: [{ testName: 'Creatinine', value: 1.1 }] },
    { recordDate: '2026-03-10T00:00:00.000Z', values: [{ testName: 'Tacrolimus', value: 6.4 }] },
    { recordDate: '2026-01-01T00:00:00.000Z', values: [{ testName: 'Tacrolimus', value: 11 }] },
  ]
  const med = { dose: '1 mg', frequency: 'Twice daily', startDate: '2025-12-01', stoppedAt: null, isActive: true }
  const history = [
    { dose: '1 mg', frequency: 'Twice daily', effectiveDate: '2026-01-15', reason: 'High level' },
    { dose: '1.5 mg', frequency: 'Twice daily', effectiveDate: '2025-12-01', reason: 'Started' },
  ]
  const now = toTime('2026-04-01')

  it('levels are sorted and filtered to the level test', () => {
    const s = buildDoseLevelSeries(med, history, records, 'Tacrolimus', now)
    expect(s.levels.map((l) => l.value)).toEqual([11, 9.2, 6.4])
  })

  it('steps are sorted by effective date with daily totals; changes exclude the first', () => {
    const s = buildDoseLevelSeries(med, history, records, 'Tacrolimus', now)
    expect(s.steps.map((x) => x.daily)).toEqual([3, 2])
    expect(s.steps[0].label).toBe('1.5 mg · Twice daily')
    expect(s.changes).toHaveLength(1)
    expect(s.changes[0].reason).toBe('High level')
    expect(s.start).toBe(toTime('2025-12-01'))
    expect(s.end).toBe(now)
  })

  it('without history, draws the current dose from startDate (or first level)', () => {
    const s = buildDoseLevelSeries(med, [], records, 'Tacrolimus', now)
    expect(s.steps).toHaveLength(1)
    expect(s.steps[0]).toMatchObject({ t: toTime('2025-12-01'), daily: 2 })
    const noStart = buildDoseLevelSeries({ ...med, startDate: null }, [], records, 'Tacrolimus', now)
    expect(noStart.steps[0].t).toBe(toTime('2026-01-01T00:00:00.000Z'))
  })

  it('a stopped medication ends at stoppedAt', () => {
    const s = buildDoseLevelSeries({ ...med, isActive: false, stoppedAt: '2026-02-20' }, history, records, 'Tacrolimus', now)
    expect(s.end).toBe(toTime('2026-02-20'))
  })

  it('no level test → no levels', () => {
    expect(buildDoseLevelSeries(med, history, records, null, now).levels).toEqual([])
  })

  it('stepLinePoints closes the last step at end', () => {
    const s = buildDoseLevelSeries(med, history, records, 'Tacrolimus', now)
    const pts = stepLinePoints(s)
    expect(pts.map((p) => p.daily)).toEqual([3, 2, 2])
    expect(pts[pts.length - 1].t).toBe(now)
    expect(stepLinePoints({ steps: [], end: now })).toEqual([])
  })
})

describe('medication forms', () => {
  const valid = {
    name: ' Tacrolimus ',
    dose: '1 mg',
    frequency: 'Twice daily',
    category: 'Immunosuppressant' as const,
    timeOfDay: ['morning' as const, 'night' as const],
    prescribedBy: '',
    notes: '',
    startDate: '2025-12-01',
    changeDate: '',
    changeReason: '',
  }

  it('accepts a valid medication and trims', () => {
    const r = medicationFormSchema.safeParse(valid)
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.name).toBe('Tacrolimus')
      expect(r.data.timeOfDay).toEqual(['morning', 'night'])
    }
  })

  it('requires name, dose, frequency; rejects bad category/time/date', () => {
    expect(medicationFormSchema.safeParse({ ...valid, name: '  ' }).success).toBe(false)
    expect(medicationFormSchema.safeParse({ ...valid, dose: '' }).success).toBe(false)
    expect(medicationFormSchema.safeParse({ ...valid, frequency: '' }).success).toBe(false)
    expect(medicationFormSchema.safeParse({ ...valid, category: 'Vitamin' }).success).toBe(false)
    expect(medicationFormSchema.safeParse({ ...valid, timeOfDay: ['noon'] }).success).toBe(false)
    expect(medicationFormSchema.safeParse({ ...valid, startDate: '01/12/2025' }).success).toBe(false)
    expect(medicationFormSchema.safeParse({ ...valid, startDate: '2999-01-01' }).success).toBe(false)
  })

  it('stopFormSchema', () => {
    expect(stopFormSchema.safeParse({ stoppedAt: todayISODate(), reason: '' }).success).toBe(true)
    expect(stopFormSchema.safeParse({ stoppedAt: '', reason: '' }).success).toBe(false)
    expect(stopFormSchema.safeParse({ stoppedAt: '2999-01-01', reason: '' }).success).toBe(false)
  })
})
