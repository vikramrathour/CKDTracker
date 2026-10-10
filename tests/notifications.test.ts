import { describe, expect, it } from 'vitest'
import type { Alert } from '@/lib/calculations/alerts'
import { addDaysYmd, istParts } from '@/lib/notifications/ist'
import {
  DEFAULT_NOTIFICATION_PREFS,
  isQuietTime,
  normalizePrefs,
  parseHm,
  wants,
  type NotificationPrefs,
} from '@/lib/notifications/prefs'
import {
  newCriticalAlerts,
  openQuestionCount,
  planAlerts,
  planRecordAdded,
  planReminders,
  slotForHour,
  subjectFor,
  testNotification,
  type SchedulePatient,
} from '@/lib/server/notifications/schedule'

// Synthetic data only.

/** A Date for the given IST wall-clock time. */
const ist = (ymd: string, hm: string) => new Date(`${ymd}T${hm}:00.000+05:30`)

const allOn: NotificationPrefs = { ...DEFAULT_NOTIFICATION_PREFS, medicationReminders: true }

function alert(recordId: string, severity: Alert['severity'] = 'critical'): Alert {
  return {
    id: `potassium-high:Potassium:${recordId}`,
    kind: 'potassium-high',
    severity,
    testName: 'Potassium',
    message: 'synthetic',
    value: 9.99,
    threshold: 6,
    recordId,
    date: '2026-03-01',
  }
}

function patient(overrides: Partial<SchedulePatient> = {}): SchedulePatient {
  return {
    pid: 'owner1_abcdef',
    displayName: 'Asha Example',
    nextLabDate: null,
    members: [
      { uid: 'owner1', prefs: allOn },
      { uid: 'viewer1', prefs: allOn },
    ],
    visits: [],
    questions: [],
    medications: [],
    latestRecord: null,
    alerts: [],
    state: {},
    ...overrides,
  }
}

describe('ist helpers', () => {
  it('converts UTC to IST date, minutes and rounded hour', () => {
    const p = istParts(new Date('2026-03-01T20:00:00.000Z')) // 01:30 IST next day
    expect(p.date).toBe('2026-03-02')
    expect(p.minutes).toBe(90)
    expect(p.hour).toBe(2)
    expect(istParts(ist('2026-03-01', '17:58')).hour).toBe(18)
    expect(istParts(ist('2026-03-01', '18:04')).hour).toBe(18)
  })

  it('adds days across month and year ends', () => {
    expect(addDaysYmd('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDaysYmd('2026-12-31', 1)).toBe('2027-01-01')
  })
})

describe('notification prefs', () => {
  it('fills defaults and drops junk', () => {
    expect(normalizePrefs(null)).toEqual(DEFAULT_NOTIFICATION_PREFS)
    const p = normalizePrefs({ alerts: false, labReminders: 'yes', quietHours: { start: '25:00', end: '07:00' } })
    expect(p.alerts).toBe(false)
    expect(p.labReminders).toBe(true)
    expect(p.quietHours).toBeNull()
    expect(normalizePrefs({ quietHours: { start: '22:00', end: '07:00' } }).quietHours).toEqual({ start: '22:00', end: '07:00' })
    expect(normalizePrefs({ quietHours: { start: '07:00', end: '07:00' } }).quietHours).toBeNull()
  })

  it('medication reminders are opt-in', () => {
    expect(DEFAULT_NOTIFICATION_PREFS.medicationReminders).toBe(false)
  })

  it('parses HH:mm', () => {
    expect(parseHm('00:00')).toBe(0)
    expect(parseHm('23:59')).toBe(1439)
    expect(parseHm('7:00')).toBeNull()
    expect(parseHm(null)).toBeNull()
  })

  it('handles quiet windows that wrap midnight', () => {
    const q = { start: '22:00', end: '07:00' }
    expect(isQuietTime(parseHm('23:30')!, q)).toBe(true)
    expect(isQuietTime(parseHm('03:00')!, q)).toBe(true)
    expect(isQuietTime(parseHm('07:00')!, q)).toBe(false)
    expect(isQuietTime(parseHm('21:59')!, q)).toBe(false)
  })

  it('handles same-day quiet windows', () => {
    const q = { start: '13:00', end: '15:00' }
    expect(isQuietTime(parseHm('14:00')!, q)).toBe(true)
    expect(isQuietTime(parseHm('15:00')!, q)).toBe(false)
    expect(isQuietTime(parseHm('12:59')!, q)).toBe(false)
    expect(isQuietTime(600, null)).toBe(false)
  })

  it('wants() needs the type on and the time outside quiet hours', () => {
    const prefs = { ...allOn, quietHours: { start: '22:00', end: '07:00' } }
    expect(wants(prefs, 'alerts', parseHm('12:00')!)).toBe(true)
    expect(wants(prefs, 'alerts', parseHm('23:00')!)).toBe(false)
    expect(wants({ ...prefs, alerts: false }, 'alerts', parseHm('12:00')!)).toBe(false)
  })
})

describe('wording', () => {
  it('uses "you" on your own profile and the first name otherwise', () => {
    expect(subjectFor('u1', 'Asha Example', 'u1')).toMatchObject({ who: 'You', self: true })
    expect(subjectFor('u1_abcdef', 'Asha Example', 'u2')).toMatchObject({ who: 'Asha', whose: 'Asha’s', self: false })
  })

  it('counts open questions for this visit or unassigned', () => {
    const qs = [
      { id: 'q1', status: 'open', visitId: 'v1' },
      { id: 'q2', status: 'open', visitId: null },
      { id: 'q3', status: 'open', visitId: 'v2' },
      { id: 'q4', status: 'answered', visitId: 'v1' },
    ]
    expect(openQuestionCount(qs, 'v1')).toBe(2)
  })

  it('only critical alerts on the latest record are new', () => {
    const alerts = [alert('r2'), alert('r1'), alert('r2', 'warning')]
    expect(newCriticalAlerts(alerts, 'r2')).toHaveLength(1)
    expect(newCriticalAlerts(alerts, null)).toHaveLength(0)
  })

  it('maps IST hours to medication slots', () => {
    expect(slotForHour(8)).toBe('morning')
    expect(slotForHour(14)).toBe('afternoon')
    expect(slotForHour(19)).toBe('evening')
    expect(slotForHour(22)).toBe('night')
    expect(slotForHour(9)).toBeNull()
  })
})

describe('planReminders: evening digest', () => {
  const visitTomorrow = { id: 'v1', visitDate: '2026-03-02', visitTime: '10:30' }

  it('sends visit reminders at 18:00 IST with the open question count', () => {
    const p = patient({
      visits: [visitTomorrow, { id: 'v2', visitDate: '2026-03-05' }],
      questions: [
        { id: 'q1', status: 'open', visitId: 'v1' },
        { id: 'q2', status: 'open' },
      ],
    })
    const plan = planReminders(ist('2026-03-01', '18:00'), p)
    const visits = plan.notifications.filter((n) => n.kind === 'visit')
    expect(visits.map((n) => n.uid)).toEqual(['owner1', 'viewer1'])
    expect(visits[0].body).toContain('tomorrow at 10:30')
    expect(visits[0].body).toContain('2 questions to ask')
    expect(visits[0].url).toBe('/visits/v1')
    expect(plan.state.digestDate).toBe('2026-03-01')
    expect(plan.stateChanged).toBe(true)
  })

  it('does nothing at other hours in hourly mode', () => {
    const plan = planReminders(ist('2026-03-01', '11:00'), patient({ visits: [visitTomorrow] }))
    expect(plan.notifications).toHaveLength(0)
    expect(plan.stateChanged).toBe(false)
  })

  it('runs the digest at any hour in daily mode, and skips medications', () => {
    const p = patient({
      visits: [visitTomorrow],
      medications: [{ isActive: true, timeOfDay: ['morning'] }],
    })
    const plan = planReminders(ist('2026-03-01', '08:00'), p, 'daily')
    expect(plan.notifications.map((n) => n.kind)).toEqual(['visit', 'visit'])
  })

  it('sends the digest only once per IST day', () => {
    const p = patient({ visits: [visitTomorrow], state: { digestDate: '2026-03-01' } })
    expect(planReminders(ist('2026-03-01', '18:00'), p).notifications).toHaveLength(0)
  })

  it('respects visit preferences and quiet hours', () => {
    const p = patient({
      visits: [visitTomorrow],
      members: [
        { uid: 'owner1', prefs: { ...allOn, visitReminders: false } },
        { uid: 'viewer1', prefs: { ...allOn, quietHours: { start: '17:00', end: '20:00' } } },
        { uid: 'editor1', prefs: allOn },
      ],
    })
    const plan = planReminders(ist('2026-03-01', '18:00'), p)
    expect(plan.notifications.map((n) => n.uid)).toEqual(['editor1'])
  })

  it('reminds about a lab test due tomorrow', () => {
    const plan = planReminders(ist('2026-03-01', '18:00'), patient({ nextLabDate: '2026-03-02' }))
    const labs = plan.notifications.filter((n) => n.kind === 'lab-due')
    expect(labs).toHaveLength(2)
    expect(labs[0].body).toBe('Asha’s lab test is due tomorrow. Open CKD Tracker for details.')
  })
})

describe('planReminders: medications', () => {
  const meds = [
    { isActive: true, timeOfDay: ['morning' as const, 'night' as const] },
    { isActive: true, timeOfDay: ['morning' as const] },
    { isActive: false, timeOfDay: ['morning' as const] },
  ]

  it('counts active medicines for the slot, opt-in members only', () => {
    const p = patient({
      pid: 'owner1',
      medications: meds,
      members: [
        { uid: 'owner1', prefs: allOn },
        { uid: 'viewer1', prefs: DEFAULT_NOTIFICATION_PREFS },
      ],
    })
    const plan = planReminders(ist('2026-03-01', '08:00'), p)
    expect(plan.notifications).toHaveLength(1)
    expect(plan.notifications[0]).toMatchObject({ uid: 'owner1', kind: 'medication', url: '/medications' })
    expect(plan.notifications[0].body).toBe('Time for your 2 medicines this morning.')
    expect(plan.state.medSlot).toBe('2026-03-01@morning')
  })

  it('does not repeat a slot already handled', () => {
    const p = patient({ medications: meds, state: { medSlot: '2026-03-01@night' } })
    expect(planReminders(ist('2026-03-01', '22:00'), p).notifications).toHaveLength(0)
  })

  it('skips slots with no medicines', () => {
    const p = patient({ medications: meds })
    const plan = planReminders(ist('2026-03-01', '14:00'), p)
    expect(plan.notifications).toHaveLength(0)
    expect(plan.state.medSlot).toBe('2026-03-01@afternoon')
  })
})

describe('planReminders: alerts', () => {
  const now = ist('2026-03-03', '11:00')
  const latestRecord = { id: 'r2', recordDate: '2026-03-01T00:00:00.000Z', createdAt: '2026-03-02T09:00:00.000Z' }

  it('alerts each member once per new record', () => {
    const p = patient({ latestRecord, alerts: [alert('r2')] })
    const first = planReminders(now, p)
    expect(first.notifications.map((n) => n.kind)).toEqual(['alert', 'alert'])
    expect(first.state.alertRecordByUid).toEqual({ owner1: 'r2', viewer1: 'r2' })

    const again = planReminders(now, { ...p, state: first.state })
    expect(again.notifications).toHaveLength(0)
  })

  it('never puts values or test names in the text', () => {
    const p = patient({ latestRecord, alerts: [alert('r2')] })
    for (const n of planReminders(now, p).notifications) {
      expect(`${n.title} ${n.body}`).not.toMatch(/9\.99|Potassium/)
    }
  })

  it('ignores warnings, alerts on older records and stale records', () => {
    expect(planReminders(now, patient({ latestRecord, alerts: [alert('r2', 'warning')] })).notifications).toHaveLength(0)
    expect(planReminders(now, patient({ latestRecord, alerts: [alert('r1')] })).notifications).toHaveLength(0)
    const old = { id: 'r2', recordDate: '2025-12-01T00:00:00.000Z', createdAt: '2025-12-02T00:00:00.000Z' }
    expect(planReminders(now, patient({ latestRecord: old, alerts: [alert('r2')] })).notifications).toHaveLength(0)
  })

  it('defers alerts during quiet hours instead of dropping them', () => {
    const quiet = { ...allOn, quietHours: { start: '22:00', end: '07:00' } }
    const p = patient({ latestRecord, alerts: [alert('r2')], members: [{ uid: 'owner1', prefs: quiet }] })
    const night = planAlerts(ist('2026-03-03', '23:00'), p, {})
    expect(night).toHaveLength(0)
    const state = {}
    expect(planAlerts(ist('2026-03-04', '07:30'), p, state)).toHaveLength(1)
    expect(state).toEqual({ alertRecordByUid: { owner1: 'r2' } })
  })

  it('skips members who turned alerts off', () => {
    const p = patient({
      latestRecord,
      alerts: [alert('r2')],
      members: [{ uid: 'owner1', prefs: { ...allOn, alerts: false } }],
    })
    expect(planReminders(now, p).notifications).toHaveLength(0)
  })
})

describe('planRecordAdded', () => {
  const p = patient({
    members: [
      { uid: 'owner1', prefs: allOn },
      { uid: 'viewer1', prefs: allOn },
      { uid: 'viewer2', prefs: { ...allOn, careCircleUpdates: false } },
    ],
  })

  it('tells everyone except the author, once per record', () => {
    const now = ist('2026-03-01', '12:00')
    const plan = planRecordAdded(now, p, { uid: 'owner1', name: 'Ravi Example' }, 'rec1')
    expect(plan.notifications.map((n) => n.uid)).toEqual(['viewer1'])
    expect(plan.notifications[0].body).toBe('Ravi added a lab report for Asha. Open CKD Tracker.')
    expect(plan.notifications[0].url).toBe('/records/rec1')
    const again = planRecordAdded(now, { ...p, state: plan.state }, { uid: 'owner1' }, 'rec1')
    expect(again.notifications).toHaveLength(0)
    expect(again.stateChanged).toBe(false)
  })

  it('caps the remembered record ids', () => {
    let state = {}
    for (let i = 0; i < 30; i++) state = planRecordAdded(new Date(), { ...p, state }, { uid: 'x' }, `r${i}`).state
    expect((state as { recordAddedIds: string[] }).recordAddedIds).toHaveLength(20)
  })
})

it('test notification goes to the caller', () => {
  expect(testNotification('u9')).toMatchObject({ uid: 'u9', kind: 'test', url: '/settings' })
})
