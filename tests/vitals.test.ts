import { describe, expect, it } from 'vitest'
import {
  bpFlag,
  bpSeries,
  flagsForVital,
  groupVitalsByDay,
  hasAnyMeasurement,
  localDay,
  temperatureFlag,
  vitalSeries,
  weightChangeFlag,
  worstLevel,
} from '@/lib/calculations/vitals'
import { emptyVitalForm, toLocalInput, vitalFormSchema } from '@/components/vitals/vital-schema'
import type { Vital } from '@/lib/types/care'

/** Local-time ISO for day/hour, so grouping is timezone-independent. */
const at = (day: number, hour = 9, month = 0) => new Date(2026, month, day, hour).toISOString()

function vital(id: string, recordedAt: string, extra: Partial<Vital> = {}): Vital {
  return { id, recordedAt, createdBy: 'u1', ...extra }
}

describe('bpFlag', () => {
  it('no flag below 140/90 or with no readings', () => {
    expect(bpFlag(120, 80)).toBeNull()
    expect(bpFlag(139, 89)).toBeNull()
    expect(bpFlag(null, null)).toBeNull()
    expect(bpFlag(undefined, undefined)).toBeNull()
  })

  it('warning at ≥ 140 systolic or ≥ 90 diastolic', () => {
    expect(bpFlag(140, 80)?.level).toBe('warning')
    expect(bpFlag(120, 90)?.level).toBe('warning')
    expect(bpFlag(179, 119)?.level).toBe('warning')
  })

  it('critical at ≥ 180 systolic or ≥ 120 diastolic', () => {
    expect(bpFlag(180, 100)?.level).toBe('critical')
    expect(bpFlag(150, 120)?.level).toBe('critical')
    expect(bpFlag(200, 130)?.message).toMatch(/200\/130/)
  })

  it('works with one number', () => {
    expect(bpFlag(185, null)?.level).toBe('critical')
    expect(bpFlag(null, 95)?.level).toBe('warning')
  })
})

describe('temperatureFlag', () => {
  it('warning from 38 °C', () => {
    expect(temperatureFlag(37.9)).toBeNull()
    expect(temperatureFlag(38)?.level).toBe('warning')
    expect(temperatureFlag(39.4)?.message).toMatch(/infection/)
    expect(temperatureFlag(null)).toBeNull()
  })
})

describe('weightChangeFlag', () => {
  const history = [
    vital('a', at(1), { weightKg: 70 }),
    vital('b', at(2), { weightKg: 71 }),
    vital('c', at(3), { pulse: 70 }), // no weight
  ]

  it('flags a gain > 2 kg within 3 days', () => {
    const v = vital('d', at(4), { weightKg: 72.5 })
    const flag = weightChangeFlag(v, [...history, v])
    expect(flag?.level).toBe('warning')
    expect(flag?.message).toMatch(/\+2\.5 kg in 3 days/)
    expect(flag?.message).toMatch(/fluid/)
  })

  it('flags a loss > 2 kg', () => {
    const v = vital('d', at(3), { weightKg: 67.5 })
    expect(weightChangeFlag(v, history)?.message).toMatch(/−3\.5 kg in 1 day\b/)
  })

  it('exactly 2 kg is not flagged', () => {
    const v = vital('d', at(3), { weightKg: 72 })
    expect(weightChangeFlag(v, [vital('a', at(2), { weightKg: 70 })])).toBeNull()
  })

  it('ignores readings older than 3 days and later readings', () => {
    const v = vital('d', at(10), { weightKg: 75 })
    expect(weightChangeFlag(v, history)).toBeNull()
    const later = vital('e', at(11), { weightKg: 60 })
    expect(weightChangeFlag(v, [later])).toBeNull()
  })

  it('no weight → no flag', () => {
    expect(weightChangeFlag(vital('x', at(2), {}), history)).toBeNull()
  })
})

describe('flagsForVital / worstLevel', () => {
  it('collects every flag', () => {
    const prev = vital('a', at(1), { weightKg: 70 })
    const v = vital('b', at(2), { systolic: 185, diastolic: 100, temperatureC: 38.5, weightKg: 73 })
    const flags = flagsForVital(v, [prev, v])
    expect(flags.map((f) => f.kind).sort()).toEqual(['bp', 'temperature', 'weight'])
    expect(worstLevel(flags)).toBe('critical')
    expect(worstLevel(flags.filter((f) => f.kind !== 'bp'))).toBe('warning')
    expect(worstLevel([])).toBeNull()
  })
})

describe('grouping and series', () => {
  const vitals = [
    vital('1', at(5, 8), { systolic: 130, diastolic: 85, weightKg: 70 }),
    vital('2', at(5, 20), { pulse: 72 }),
    vital('3', at(6, 7), { systolic: 125, weightKg: 70.4 }),
    vital('4', at(3, 9), { temperatureC: 37 }),
  ]

  it('groups by local day, newest first', () => {
    const groups = groupVitalsByDay(vitals)
    expect(groups.map((g) => g.day)).toEqual(['2026-01-06', '2026-01-05', '2026-01-03'])
    expect(groups[1].items.map((v) => v.id)).toEqual(['2', '1'])
  })

  it('localDay', () => {
    expect(localDay(at(9, 23, 1))).toBe('2026-02-09')
  })

  it('vitalSeries is oldest first and skips missing values', () => {
    expect(vitalSeries(vitals, 'weightKg')).toEqual([
      { date: at(5, 8), value: 70 },
      { date: at(6, 7), value: 70.4 },
    ])
    expect(vitalSeries(vitals, 'glucose')).toEqual([])
  })

  it('bpSeries keeps partial pairs', () => {
    expect(bpSeries(vitals)).toEqual([
      { date: at(5, 8), systolic: 130, diastolic: 85 },
      { date: at(6, 7), systolic: 125, diastolic: null },
    ])
  })

  it('hasAnyMeasurement', () => {
    expect(hasAnyMeasurement({})).toBe(false)
    expect(hasAnyMeasurement({ pulse: null })).toBe(false)
    expect(hasAnyMeasurement({ urineOutputMl: 0 })).toBe(true)
  })
})

describe('vitalFormSchema', () => {
  const base = () => emptyVitalForm(new Date(2026, 0, 5, 9))

  it('parses blanks to null and numbers to numbers', () => {
    const r = vitalFormSchema.safeParse({ ...base(), systolic: '128', diastolic: '82', weightKg: '70.4' })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data).toMatchObject({ systolic: 128, diastolic: 82, weightKg: 70.4, pulse: null, notes: '' })
    }
  })

  it('requires at least one reading', () => {
    const r = vitalFormSchema.safeParse(base())
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues[0].path).toEqual(['root'])
  })

  it('rejects out-of-range values', () => {
    for (const [k, v] of [
      ['systolic', '1200'],
      ['pulse', '5'],
      ['weightKg', '700'],
      ['temperatureC', '45'],
      ['glucose', '5'],
      ['urineOutputMl', '-1'],
    ] as const) {
      const r = vitalFormSchema.safeParse({ ...base(), [k]: v, ...(k === 'systolic' ? { diastolic: '80' } : {}) })
      expect(r.success, `${k}=${v}`).toBe(false)
    }
  })

  it('needs both BP numbers, diastolic below systolic', () => {
    expect(vitalFormSchema.safeParse({ ...base(), systolic: '120' }).success).toBe(false)
    expect(vitalFormSchema.safeParse({ ...base(), systolic: '80', diastolic: '120' }).success).toBe(false)
  })

  it('rejects text and future times', () => {
    expect(vitalFormSchema.safeParse({ ...base(), pulse: 'abc' }).success).toBe(false)
    const future = toLocalInput(new Date(Date.now() + 2 * 60 * 60 * 1000))
    expect(vitalFormSchema.safeParse({ ...base(), pulse: '70', recordedAt: future }).success).toBe(false)
    expect(vitalFormSchema.safeParse({ ...base(), pulse: '70', recordedAt: '' }).success).toBe(false)
  })
})
