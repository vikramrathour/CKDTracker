import type { Alert } from '@/lib/calculations/alerts'
import type { TimeOfDay } from '@/lib/calculations/medications'
import { addDaysYmd, istParts } from '@/lib/notifications/ist'
import { wants, type NotificationPrefs, type NotificationType } from '@/lib/notifications/prefs'
import { formatPersonName } from '@/lib/phone'

/**
 * Pure planning for push notifications: given "now" and a patient's data,
 * decide who gets what. The Admin I/O around it (reminders.ts, send.ts) stays
 * thin. No server-only import so tests can load it.
 *
 * Lock-screen privacy: titles and bodies never contain lab values, test
 * names, medicine names or doctor names, only "open CKD Tracker" nudges.
 */

/** IST hour of the evening digest (visit tomorrow, lab due tomorrow). */
export const DIGEST_HOUR = 18

/** Medication reminder slots, IST hour per MedicationDoc.timeOfDay value. */
export const MEDICATION_SLOT_HOURS: Record<TimeOfDay, number> = {
  morning: 8,
  afternoon: 14,
  evening: 19,
  night: 22,
}

/** Only alert on a report this recent (avoids alerting on old data the first time a member enables alerts). */
export const ALERT_FRESH_DAYS = 14

export type NotificationKind = 'visit' | 'lab-due' | 'alert' | 'medication' | 'record-added' | 'test'

export interface PlannedNotification {
  uid: string
  pid?: string
  kind: NotificationKind
  title: string
  body: string
  /** In-app path opened on click. */
  url: string
  /** Same tag replaces an older notification on the device. */
  tag: string
}

/** Server bookkeeping on patients/{pid}.notificationState (Admin-written). */
export interface NotificationState {
  /** IST date of the last evening digest. */
  digestDate?: string
  /** `${YYYY-MM-DD}@${slot}` of the last medication slot handled. */
  medSlot?: string
  /** uid → labRecords id the member was last alerted about (or deliberately skipped). */
  alertRecordByUid?: Record<string, string>
  /** labRecords ids already announced to the circle (most recent last, capped). */
  recordAddedIds?: string[]
}

export interface ScheduleMember {
  uid: string
  prefs: NotificationPrefs
}

export interface ScheduleVisit {
  id: string
  visitDate: string
  visitTime?: string | null
}

export interface ScheduleQuestion {
  id: string
  status: string
  visitId?: string | null
}

export interface ScheduleMedication {
  isActive?: boolean
  timeOfDay?: TimeOfDay[] | null
}

export interface ScheduleRecord {
  id: string
  /** ISO */
  recordDate: string
  /** ISO */
  createdAt?: string
}

export interface SchedulePatient {
  pid: string
  displayName: string
  /** YYYY-MM-DD, optional patients/{pid}.nextLabDate. */
  nextLabDate?: string | null
  members: ScheduleMember[]
  visits: ScheduleVisit[]
  questions: ScheduleQuestion[]
  medications: ScheduleMedication[]
  latestRecord?: ScheduleRecord | null
  /** computeAlerts() output for the patient's records. */
  alerts: Alert[]
  state: NotificationState
}

export type CronMode = 'hourly' | 'daily'

export interface PlanResult {
  notifications: PlannedNotification[]
  state: NotificationState
  stateChanged: boolean
}

// ---------------------------------------------------------------- wording

/** Subject used in sentences: "you" on your own profile (pid == uid), else the patient's first name. */
export function subjectFor(pid: string, displayName: string, uid: string): { who: string; whose: string; self: boolean } {
  if (pid === uid) return { who: 'You', whose: 'Your', self: true }
  const first = (displayName || '').trim().split(/\s+/)[0] || 'Your patient'
  return { who: first, whose: `${first}’s`, self: false }
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

function hhmm(value: string | null | undefined): string | null {
  return typeof value === 'string' && /^\d{2}:\d{2}$/.test(value) ? value : null
}

/** Open questions that belong to this visit or to no visit yet. */
export function openQuestionCount(questions: ScheduleQuestion[], visitId: string): number {
  return questions.filter((q) => q.status === 'open' && (!q.visitId || q.visitId === visitId)).length
}

/** Critical alerts raised by the latest record (alerts on older records are not "new"). */
export function newCriticalAlerts(alerts: Alert[], latestRecordId: string | undefined | null): Alert[] {
  if (!latestRecordId) return []
  return alerts.filter((a) => a.severity === 'critical' && a.recordId === latestRecordId)
}

function isFresh(record: ScheduleRecord, now: Date): boolean {
  const iso = record.createdAt || record.recordDate
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return false
  return now.getTime() - t <= ALERT_FRESH_DAYS * 86_400_000
}

// ---------------------------------------------------------------- planners

function recipients(members: ScheduleMember[], type: NotificationType, minutes: number): ScheduleMember[] {
  return members.filter((m) => wants(m.prefs, type, minutes))
}

/** Alerts for members who haven't been told about the latest record yet. Mutates `state`. */
export function planAlerts(now: Date, p: SchedulePatient, state: NotificationState): PlannedNotification[] {
  const latest = p.latestRecord
  if (!latest) return []
  const critical = newCriticalAlerts(p.alerts, latest.id)
  if (critical.length === 0 || !isFresh(latest, now)) return []

  const { minutes } = istParts(now)
  const byUid = { ...(state.alertRecordByUid ?? {}) }
  const out: PlannedNotification[] = []
  for (const m of p.members) {
    if (!m.prefs.alerts) continue
    if (byUid[m.uid] === latest.id) continue
    // Quiet hours: defer (state untouched) so the next run after quiet hours sends it.
    if (!wants(m.prefs, 'alerts', minutes)) continue
    const s = subjectFor(p.pid, p.displayName, m.uid)
    out.push({
      uid: m.uid,
      pid: p.pid,
      kind: 'alert',
      title: 'New lab alert',
      body: s.self
        ? 'Your latest report has a flag to review. Open CKD Tracker.'
        : `New lab alert for ${s.who}. Open CKD Tracker.`,
      url: '/dashboard',
      tag: `alert-${p.pid}`,
    })
    byUid[m.uid] = latest.id
  }
  if (out.length) state.alertRecordByUid = byUid
  return out
}

function planDigest(now: Date, p: SchedulePatient): PlannedNotification[] {
  const { date, minutes } = istParts(now)
  const tomorrow = addDaysYmd(date, 1)
  const out: PlannedNotification[] = []

  const visits = p.visits.filter((v) => v.visitDate === tomorrow)
  for (const v of visits) {
    const time = hhmm(v.visitTime)
    const questions = openQuestionCount(p.questions, v.id)
    for (const m of recipients(p.members, 'visitReminders', minutes)) {
      const s = subjectFor(p.pid, p.displayName, m.uid)
      const verb = s.self ? 'have' : 'has'
      const q = questions > 0 ? ` ${plural(questions, 'question')} to ask.` : ''
      out.push({
        uid: m.uid,
        pid: p.pid,
        kind: 'visit',
        title: 'Doctor visit tomorrow',
        body: `${s.who} ${verb} a doctor visit tomorrow${time ? ` at ${time}` : ''}.${q} Open CKD Tracker to prepare.`,
        url: `/visits/${v.id}`,
        tag: `visit-${p.pid}-${v.id}`,
      })
    }
  }

  if (p.nextLabDate === tomorrow) {
    for (const m of recipients(p.members, 'labReminders', minutes)) {
      const s = subjectFor(p.pid, p.displayName, m.uid)
      out.push({
        uid: m.uid,
        pid: p.pid,
        kind: 'lab-due',
        title: 'Lab test tomorrow',
        body: `${s.whose} lab test is due tomorrow. Open CKD Tracker for details.`,
        url: '/records',
        tag: `lab-due-${p.pid}`,
      })
    }
  }
  return out
}

function planMedications(now: Date, p: SchedulePatient, slot: TimeOfDay): PlannedNotification[] {
  const { minutes } = istParts(now)
  const count = p.medications.filter((m) => m.isActive !== false && (m.timeOfDay ?? []).includes(slot)).length
  if (count === 0) return []
  const when = slot === 'night' ? 'tonight' : `this ${slot}`
  return recipients(p.members, 'medicationReminders', minutes).map((m) => {
    const s = subjectFor(p.pid, p.displayName, m.uid)
    return {
      uid: m.uid,
      pid: p.pid,
      kind: 'medication' as const,
      title: 'Medication reminder',
      body: s.self
        ? `Time for your ${plural(count, 'medicine')} ${when}.`
        : `${s.who} has ${plural(count, 'medicine')} to take ${when}.`,
      url: '/medications',
      tag: `meds-${p.pid}-${slot}`,
    }
  })
}

/** The medication slot due at this IST hour, if any. */
export function slotForHour(hour: number): TimeOfDay | null {
  const hit = (Object.entries(MEDICATION_SLOT_HOURS) as [TimeOfDay, number][]).find(([, h]) => h === hour)
  return hit ? hit[0] : null
}

/**
 * Everything due for one patient on this cron run.
 *
 * - hourly mode: digest at DIGEST_HOUR IST, medication slots at their hour,
 *   alerts on every run.
 * - daily mode (Vercel Hobby, one run a day): digest regardless of the hour,
 *   alerts, no medication reminders.
 *
 * Each digest/slot runs at most once per IST day (tracked in state), so a
 * retried or duplicated cron invocation doesn't double-send.
 */
export function planReminders(now: Date, p: SchedulePatient, mode: CronMode = 'hourly'): PlanResult {
  const { date, hour } = istParts(now)
  const state: NotificationState = { ...p.state }
  let stateChanged = false
  const notifications: PlannedNotification[] = []

  const digestDue = mode === 'daily' || hour === DIGEST_HOUR
  if (digestDue && state.digestDate !== date) {
    notifications.push(...planDigest(now, p))
    state.digestDate = date
    stateChanged = true
  }

  const slot = mode === 'hourly' ? slotForHour(hour) : null
  if (slot) {
    const key = `${date}@${slot}`
    if (state.medSlot !== key) {
      notifications.push(...planMedications(now, p, slot))
      state.medSlot = key
      stateChanged = true
    }
  }

  const alerts = planAlerts(now, p, state)
  if (alerts.length) {
    notifications.push(...alerts)
    stateChanged = true
  }

  return { notifications, state, stateChanged }
}

export const RECORD_ADDED_MEMORY = 20

/**
 * "X added a report" for everyone in the circle except the author. Returns
 * nothing when this record was already announced (idempotent per record).
 */
export function planRecordAdded(
  now: Date,
  p: Pick<SchedulePatient, 'pid' | 'displayName' | 'members' | 'state'>,
  actor: { uid: string; name?: string | null },
  recordId: string
): PlanResult {
  const state: NotificationState = { ...p.state }
  const seen = state.recordAddedIds ?? []
  if (seen.includes(recordId)) return { notifications: [], state, stateChanged: false }

  const { minutes } = istParts(now)
  // Never a phone number in a push: legacy phone-as-name shows as "Member ••01".
  const shown = formatPersonName(actor.name)
  const actorName = shown.startsWith('Member ••') ? shown : shown.split(/\s+/)[0] || 'Someone'
  const notifications = recipients(p.members, 'careCircleUpdates', minutes)
    .filter((m) => m.uid !== actor.uid)
    .map((m) => {
      const s = subjectFor(p.pid, p.displayName, m.uid)
      return {
        uid: m.uid,
        pid: p.pid,
        kind: 'record-added' as const,
        title: 'New report added',
        body: `${actorName} added a lab report ${s.self ? 'to your profile' : `for ${s.who}`}. Open CKD Tracker.`,
        url: `/records/${recordId}`,
        tag: `record-${p.pid}-${recordId}`,
      }
    })
  state.recordAddedIds = [...seen, recordId].slice(-RECORD_ADDED_MEMORY)
  return { notifications, state, stateChanged: true }
}

export function testNotification(uid: string): PlannedNotification {
  return {
    uid,
    kind: 'test',
    title: 'Test notification',
    body: 'Push notifications are working on this device.',
    url: '/settings',
    tag: 'test',
  }
}
