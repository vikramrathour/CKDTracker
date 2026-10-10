import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  Timestamp,
  type DocumentData,
  type Unsubscribe,
} from 'firebase/firestore'
import { auth, db as _db } from './config'
import type { LabRecord, LabValue } from '@/lib/types/lab-record'

/**
 * Patient-scoped data access. Every clinical collection lives under
 * `patients/{pid}/…` (see firestore.rules); `pid` comes from usePatient().
 * Writes stamp `createdBy` with the signed-in uid, which the rules require.
 */

export function getDb() {
  if (!_db) throw new Error('Firebase not initialized')
  return _db
}

/** uid of the signed-in user; throws when signed out. */
export function currentUid(): string {
  const uid = auth?.currentUser?.uid
  if (!uid) throw new Error('Not signed in')
  return uid
}

/** Firestore Timestamp / Date / string → ISO string (undefined when absent). */
export function toIso(value: unknown): string | undefined {
  if (!value) return undefined
  if (typeof value === 'string') return value
  if (value instanceof Date) return value.toISOString()
  if (value instanceof Timestamp) return value.toDate().toISOString()
  if (typeof value === 'object' && 'toDate' in value && typeof (value as Timestamp).toDate === 'function') {
    return (value as Timestamp).toDate().toISOString()
  }
  return undefined
}

const patientCol = (pid: string, name: string) => collection(getDb(), 'patients', pid, name)
const patientDoc = (pid: string, name: string, id: string) => doc(getDb(), 'patients', pid, name, id)

// ---- Lab Records ----

export function labRecordFromDoc(id: string, data: DocumentData): LabRecord {
  return {
    ...data,
    id,
    values: Array.isArray(data.values) ? data.values : [],
    recordDate: toIso(data.recordDate) ?? new Date(0).toISOString(),
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  } as LabRecord
}

/** All records for a patient, newest first. */
export async function getLabRecords(pid: string): Promise<LabRecord[]> {
  const q = query(patientCol(pid, 'labRecords'), orderBy('recordDate', 'desc'))
  const snapshot = await getDocs(q)
  return snapshot.docs.map((d) => labRecordFromDoc(d.id, d.data()))
}

/**
 * Realtime records for a patient, sorted ascending by date (the order the
 * app's calculations expect). Returns the unsubscribe function.
 */
export function subscribeLabRecords(
  pid: string,
  onNext: (records: LabRecord[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const q = query(patientCol(pid, 'labRecords'), orderBy('recordDate', 'asc'))
  return onSnapshot(
    q,
    (snapshot) => onNext(snapshot.docs.map((d) => labRecordFromDoc(d.id, d.data()))),
    onError
  )
}

export async function getLabRecord(pid: string, recordId: string): Promise<LabRecord | null> {
  const snap = await getDoc(patientDoc(pid, 'labRecords', recordId))
  if (!snap.exists()) return null
  return labRecordFromDoc(snap.id, snap.data())
}

export async function addLabRecord(
  pid: string,
  record: {
    recordDate: Date
    labName: string
    doctorName?: string
    notes?: string
    pdfPath?: string
    values: Omit<LabValue, 'id'>[]
  }
): Promise<string> {
  const docRef = await addDoc(patientCol(pid, 'labRecords'), {
    recordDate: Timestamp.fromDate(record.recordDate),
    labName: record.labName.slice(0, 120),
    doctorName: record.doctorName || '',
    notes: record.notes || '',
    pdfPath: record.pdfPath || null,
    values: record.values,
    createdBy: currentUid(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return docRef.id
}

export async function updateLabRecord(
  pid: string,
  recordId: string,
  data: {
    recordDate?: Date
    labName?: string
    doctorName?: string
    notes?: string
    pdfPath?: string | null
    values?: Omit<LabValue, 'id'>[]
  }
): Promise<void> {
  const updateData: Record<string, unknown> = { updatedAt: serverTimestamp() }
  if (data.recordDate) updateData.recordDate = Timestamp.fromDate(data.recordDate)
  if (data.labName !== undefined) updateData.labName = data.labName.slice(0, 120)
  if (data.doctorName !== undefined) updateData.doctorName = data.doctorName
  if (data.notes !== undefined) updateData.notes = data.notes
  if (data.pdfPath !== undefined) updateData.pdfPath = data.pdfPath
  if (data.values !== undefined) updateData.values = data.values

  await updateDoc(patientDoc(pid, 'labRecords', recordId), updateData)
}

export async function deleteLabRecord(pid: string, recordId: string): Promise<void> {
  await deleteDoc(patientDoc(pid, 'labRecords', recordId))
}

// ---- User Profile (users/{uid}: account-level, not the patient) ----

export async function getUserProfile(uid: string) {
  const snap = await getDoc(doc(getDb(), 'users', uid))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() }
}

export async function updateUserProfile(uid: string, data: Record<string, unknown>) {
  await updateDoc(doc(getDb(), 'users', uid), {
    ...data,
    updatedAt: serverTimestamp(),
  })
}
