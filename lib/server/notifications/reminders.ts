import 'server-only'
import type { Firestore } from 'firebase-admin/firestore'
import { computeAlerts } from '@/lib/calculations/alerts'
import type { LabRecord } from '@/lib/types/lab-record'
import type { AlertRule, Target } from '@/lib/types/care'
import type { TimeOfDay } from '@/lib/calculations/medications'
import { addDaysYmd, istParts } from '@/lib/notifications/ist'
import { plain } from '@/lib/server/patient-data'
import { PrefsStore, TokenStore, sendNotifications, type SendSummary } from './send'
import {
  DIGEST_HOUR,
  planAlerts,
  planRecordAdded,
  planReminders,
  slotForHour,
  type CronMode,
  type NotificationState,
  type PlannedNotification,
  type SchedulePatient,
} from './schedule'

/**
 * Admin I/O for the reminder cron and the record-added hook. Loads just what
 * the planners in schedule.ts need, sends, then saves the bookkeeping on
 * patients/{pid}.notificationState.
 */

/** Records loaded for alert computation (latest + baseline window). */
const RECORDS_FOR_ALERTS = 8

interface LoadOptions {
  now: Date
  /** Load tomorrow's visits + open questions. */
  digest: boolean
  /** Load active medications. */
  medications: boolean
}

async function loadSchedulePatient(
  db: Firestore,
  pid: string,
  patientData: Record<string, unknown>,
  prefs: PrefsStore,
  opts: LoadOptions
): Promise<SchedulePatient> {
  const base = `patients/${pid}`
  const tomorrow = addDaysYmd(istParts(opts.now).date, 1)

  const [membersSnap, recordsSnap, targetsSnap, rulesSnap, visitsSnap, questionsSnap, medsSnap] = await Promise.all([
    db.collection(`${base}/members`).get(),
    db.collection(`${base}/labRecords`).orderBy('recordDate', 'desc').limit(RECORDS_FOR_ALERTS).get(),
    db.collection(`${base}/targets`).get(),
    db.collection(`${base}/alertRules`).get(),
    opts.digest ? db.collection(`${base}/visits`).where('visitDate', '==', tomorrow).get() : null,
    opts.digest ? db.collection(`${base}/questions`).where('status', '==', 'open').get() : null,
    opts.medications ? db.collection(`${base}/medications`).where('isActive', '==', true).get() : null,
  ])

  const members = await Promise.all(
    membersSnap.docs.map(async (d) => ({ uid: d.id, prefs: await prefs.get(d.id) }))
  )

  const records = recordsSnap.docs
    .map((d) => {
      const r = { ...plain<LabRecord>(d.data()), id: d.id }
      if (!Array.isArray(r.values)) r.values = []
      return r
    })
    .reverse()
  const latest = records.length ? records[records.length - 1] : null
  const alerts = computeAlerts({
    records,
    targets: targetsSnap.docs.map((d) => ({ ...plain<Target>(d.data()), testName: d.id })),
    alertRules: rulesSnap.docs.map((d) => ({ ...plain<AlertRule>(d.data()), id: d.id })),
  })

  return {
    pid,
    displayName: typeof patientData.displayName === 'string' ? patientData.displayName : '',
    nextLabDate: typeof patientData.nextLabDate === 'string' ? patientData.nextLabDate : null,
    members,
    visits: visitsSnap
      ? visitsSnap.docs.map((d) => ({
          id: d.id,
          visitDate: String(d.get('visitDate') ?? ''),
          visitTime: (d.get('visitTime') as string | undefined) ?? null,
        }))
      : [],
    questions: questionsSnap
      ? questionsSnap.docs.map((d) => ({
          id: d.id,
          status: String(d.get('status') ?? ''),
          visitId: (d.get('visitId') as string | undefined) ?? null,
        }))
      : [],
    medications: medsSnap
      ? medsSnap.docs.map((d) => ({
          isActive: d.get('isActive') !== false,
          timeOfDay: (d.get('timeOfDay') as TimeOfDay[] | undefined) ?? [],
        }))
      : [],
    latestRecord: latest ? { id: latest.id, recordDate: latest.recordDate, createdAt: latest.createdAt } : null,
    alerts,
    state: plain<NotificationState>(patientData.notificationState as Record<string, unknown> | undefined),
  }
}

async function saveState(db: Firestore, pid: string, state: NotificationState): Promise<void> {
  await db.doc(`patients/${pid}`).set({ notificationState: state }, { merge: true })
}

export interface CronSummary extends SendSummary {
  mode: CronMode
  patients: number
  errors: number
  istHour: number
}

/** One cron run over every patient. */
export async function runReminders(db: Firestore, now: Date, mode: CronMode): Promise<CronSummary> {
  const { hour } = istParts(now)
  const digest = mode === 'daily' || hour === DIGEST_HOUR
  const medications = mode === 'hourly' && slotForHour(hour) != null
  const prefs = new PrefsStore(db)
  const tokens = new TokenStore(db, now)

  const patients = await db.collection('patients').get()
  const all: PlannedNotification[] = []
  let errors = 0

  for (const doc of patients.docs) {
    try {
      const p = await loadSchedulePatient(db, doc.id, doc.data(), prefs, { now, digest, medications })
      const plan = planReminders(now, p, mode)
      all.push(...plan.notifications)
      if (plan.stateChanged) await saveState(db, doc.id, plan.state)
    } catch (err) {
      errors += 1
      // Patient id only, never data.
      console.error(`reminders: patient ${doc.id} failed:`, err instanceof Error ? err.message : err)
    }
  }

  const sent = await sendNotifications(db, all, tokens)
  return { ...sent, mode, patients: patients.size, errors, istHour: hour }
}

/** Announce a new lab record to the circle and send any new critical alert right away. */
export async function notifyRecordAdded(
  db: Firestore,
  now: Date,
  pid: string,
  recordId: string,
  actor: { uid: string; name?: string | null }
): Promise<SendSummary & { skipped?: string }> {
  const patientSnap = await db.doc(`patients/${pid}`).get()
  if (!patientSnap.exists) return { notifications: 0, delivered: 0, failed: 0, pruned: 0, noDevice: 0, skipped: 'no-patient' }
  const recordSnap = await db.doc(`patients/${pid}/labRecords/${recordId}`).get()
  if (!recordSnap.exists) return { notifications: 0, delivered: 0, failed: 0, pruned: 0, noDevice: 0, skipped: 'no-record' }

  const p = await loadSchedulePatient(db, pid, patientSnap.data() ?? {}, new PrefsStore(db), {
    now,
    digest: false,
    medications: false,
  })
  const added = planRecordAdded(now, p, actor, recordId)
  // Alerts reuse the cron planner's bookkeeping so the cron won't repeat them.
  const state = { ...added.state }
  const alerts = planAlerts(now, p, state)
  if (added.stateChanged || alerts.length) await saveState(db, pid, state)
  return sendNotifications(db, [...added.notifications, ...alerts])
}
