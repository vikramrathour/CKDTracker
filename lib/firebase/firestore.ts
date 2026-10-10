import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore'
import { db as _db } from './config'

function getDb() {
  if (!_db) throw new Error('Firebase not initialized')
  return _db
}
import type { LabRecord, LabValue } from '@/lib/types/lab-record'
import type { Medication } from '@/lib/types/medication'

// ---- Lab Records ----

export async function getLabRecords(uid: string): Promise<LabRecord[]> {
  const q = query(
    collection(getDb(), 'users', uid, 'labRecords'),
    orderBy('recordDate', 'desc')
  )
  const snapshot = await getDocs(q)
  return snapshot.docs.map((d) => ({
    id: d.id,
    ...d.data(),
    recordDate: (d.data().recordDate as Timestamp).toDate().toISOString(),
    createdAt: (d.data().createdAt as Timestamp)?.toDate().toISOString(),
    updatedAt: (d.data().updatedAt as Timestamp)?.toDate().toISOString(),
  })) as LabRecord[]
}

export async function getLabRecord(uid: string, recordId: string): Promise<LabRecord | null> {
  const snap = await getDoc(doc(getDb(), 'users', uid, 'labRecords', recordId))
  if (!snap.exists()) return null
  const data = snap.data()
  return {
    id: snap.id,
    ...data,
    recordDate: (data.recordDate as Timestamp).toDate().toISOString(),
    createdAt: (data.createdAt as Timestamp)?.toDate().toISOString(),
    updatedAt: (data.updatedAt as Timestamp)?.toDate().toISOString(),
  } as LabRecord
}

export async function addLabRecord(
  uid: string,
  record: {
    recordDate: Date
    labName: string
    doctorName?: string
    notes?: string
    pdfPath?: string
    values: Omit<LabValue, 'id'>[]
  }
): Promise<string> {
  const docRef = await addDoc(collection(getDb(), 'users', uid, 'labRecords'), {
    recordDate: Timestamp.fromDate(record.recordDate),
    labName: record.labName,
    doctorName: record.doctorName || '',
    notes: record.notes || '',
    pdfPath: record.pdfPath || null,
    values: record.values,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return docRef.id
}

export async function updateLabRecord(
  uid: string,
  recordId: string,
  data: {
    recordDate?: Date
    labName?: string
    doctorName?: string
    notes?: string
    values?: Omit<LabValue, 'id'>[]
  }
): Promise<void> {
  const updateData: Record<string, unknown> = { updatedAt: serverTimestamp() }
  if (data.recordDate) updateData.recordDate = Timestamp.fromDate(data.recordDate)
  if (data.labName !== undefined) updateData.labName = data.labName
  if (data.doctorName !== undefined) updateData.doctorName = data.doctorName
  if (data.notes !== undefined) updateData.notes = data.notes
  if (data.values !== undefined) updateData.values = data.values

  await updateDoc(doc(getDb(), 'users', uid, 'labRecords', recordId), updateData)
}

export async function deleteLabRecord(uid: string, recordId: string): Promise<void> {
  await deleteDoc(doc(getDb(), 'users', uid, 'labRecords', recordId))
}

// ---- Medications ----

export async function getMedications(uid: string): Promise<Medication[]> {
  const q = query(
    collection(getDb(), 'users', uid, 'medications'),
    orderBy('createdAt', 'asc')
  )
  const snapshot = await getDocs(q)
  return snapshot.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  })) as Medication[]
}

export async function addMedication(
  uid: string,
  med: Omit<Medication, 'id' | 'createdAt'>
): Promise<string> {
  const docRef = await addDoc(collection(getDb(), 'users', uid, 'medications'), {
    ...med,
    createdAt: serverTimestamp(),
  })
  return docRef.id
}

export async function updateMedication(
  uid: string,
  medId: string,
  data: Partial<Omit<Medication, 'id' | 'createdAt'>>
): Promise<void> {
  await updateDoc(doc(getDb(), 'users', uid, 'medications', medId), data)
}

export async function deleteMedication(uid: string, medId: string): Promise<void> {
  await deleteDoc(doc(getDb(), 'users', uid, 'medications', medId))
}

// ---- Shared Links ----

export async function getSharedLinkByToken(token: string) {
  const q = query(collection(getDb(), 'sharedLinks'))
  const snapshot = await getDocs(q)
  const link = snapshot.docs.find((d) => d.data().token === token && d.data().isActive)
  if (!link) return null
  const data = link.data()
  if (data.expiresAt && (data.expiresAt as Timestamp).toDate() < new Date()) return null
  return { id: link.id, ...data }
}

// ---- User Profile ----

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
