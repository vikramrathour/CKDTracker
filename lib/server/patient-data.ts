import 'server-only'
import type { DocumentData, Firestore } from 'firebase-admin/firestore'
import { getAdminDb } from './firebase-admin'
import type { LabRecord } from '@/lib/types/lab-record'
import type { Medication } from '@/lib/types/medication'
import type { AlertRule, DocumentMeta, DoseChange, Question, Target, Vital } from '@/lib/types/care'
import type { VisitRecord } from '@/lib/visits/types'
import { sanitizeBundle } from '@/lib/export/sanitize'

/**
 * Admin-SDK reads of a patient's data for server routes (visit-prep PDF,
 * export). Callers must have checked membership with requireMember first.
 * Firestore Timestamps are converted to ISO strings, matching the client
 * data layer, so the same pure builders work on both sides.
 */

function isTimestampLike(v: unknown): v is { toDate: () => Date } {
  return !!v && typeof v === 'object' && typeof (v as { toDate?: unknown }).toDate === 'function'
}

/** Deep-convert Timestamps → ISO strings. */
export function plain<T = Record<string, unknown>>(data: DocumentData | undefined): T {
  const conv = (v: unknown): unknown => {
    if (isTimestampLike(v)) return v.toDate().toISOString()
    if (Array.isArray(v)) return v.map(conv)
    if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, conv(x)]))
    }
    return v
  }
  return conv(data ?? {}) as T
}

async function list<T>(db: Firestore, path: string): Promise<T[]> {
  const snap = await db.collection(path).get()
  return snap.docs.map((d) => ({ ...plain(d.data()), id: d.id }) as T)
}

export interface PatientBundle {
  patient: Record<string, unknown> | null
  records: LabRecord[]
  medications: (Medication & { doseHistory?: DoseChange[] })[]
  visits: VisitRecord[]
  questions: Question[]
  targets: Target[]
  alertRules: AlertRule[]
}

export async function loadPatientCore(pid: string, opts: { doseHistory?: boolean } = {}): Promise<PatientBundle> {
  const db = getAdminDb()
  const base = `patients/${pid}`
  const [patientSnap, records, medications, visits, questions, targets, alertRules] = await Promise.all([
    db.doc(base).get(),
    list<LabRecord>(db, `${base}/labRecords`),
    list<Medication>(db, `${base}/medications`),
    list<VisitRecord>(db, `${base}/visits`),
    list<Question>(db, `${base}/questions`),
    list<Target>(db, `${base}/targets`),
    list<AlertRule>(db, `${base}/alertRules`),
  ])
  let meds: PatientBundle['medications'] = medications
  if (opts.doseHistory) {
    meds = await Promise.all(
      medications.map(async (m) => ({
        ...m,
        doseHistory: await list<DoseChange>(db, `${base}/medications/${m.id}/doseHistory`),
      }))
    )
  }
  sanitizeBundle({ records, medications: meds, visits, questions })
  records.sort((a, b) => a.recordDate.localeCompare(b.recordDate))
  for (const m of meds) m.doseHistory?.sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate))

  return {
    patient: patientSnap.exists ? { ...plain(patientSnap.data()), id: pid } : null,
    records,
    medications: meds,
    visits,
    questions,
    targets: targets.map((t) => ({ ...t, testName: t.testName || (t as { id?: string }).id || '' })),
    alertRules,
  }
}

export async function loadVitalsAndDocuments(pid: string): Promise<{ vitals: Vital[]; documents: DocumentMeta[] }> {
  const db = getAdminDb()
  const [vitals, documents] = await Promise.all([
    list<Vital>(db, `patients/${pid}/vitals`),
    list<DocumentMeta>(db, `patients/${pid}/documents`),
  ])
  return { vitals, documents }
}
