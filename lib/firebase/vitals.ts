import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  type DocumentData,
  type Unsubscribe,
} from 'firebase/firestore'
import { currentUid, getDb, toIso } from './firestore'
import { VITAL_KEYS, type VitalKey } from '@/lib/calculations/vitals'
import type { Vital } from '@/lib/types/care'

/**
 * Vitals log: patients/{pid}/vitals/{id}. `recordedAt` is a Firestore
 * Timestamp (ISO string in app code). Any subset of measurements may be
 * present; absent ones are not written.
 *
 * No activity entries: ActivityAction has no vitals action yet, and quick
 * entries several times a day would flood the feed.
 */

const vitalsCol = (pid: string) => collection(getDb(), 'patients', pid, 'vitals')

export type VitalInput = Partial<Record<VitalKey, number | null>> & {
  /** ISO timestamp or Date */
  recordedAt: string | Date
  notes?: string
}

export function vitalFromDoc(id: string, data: DocumentData): Vital {
  const v: Vital = {
    id,
    recordedAt: toIso(data.recordedAt) ?? toIso(data.createdAt) ?? new Date(0).toISOString(),
    createdBy: String(data.createdBy ?? ''),
    createdAt: toIso(data.createdAt),
  }
  for (const k of VITAL_KEYS) {
    const n = data[k]
    if (typeof n === 'number' && Number.isFinite(n)) v[k] = n
  }
  if (typeof data.notes === 'string' && data.notes) v.notes = data.notes
  return v
}

/** Most recent readings first (capped; a year of several-a-day entries fits). */
export function subscribeVitals(
  pid: string,
  onNext: (vitals: Vital[]) => void,
  onError: (err: Error) => void,
  max = 1000
): Unsubscribe {
  const q = query(vitalsCol(pid), orderBy('recordedAt', 'desc'), limit(max))
  return onSnapshot(q, (snap) => onNext(snap.docs.map((d) => vitalFromDoc(d.id, d.data()))), onError)
}

function measurementFields(input: VitalInput, forUpdate: boolean): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const k of VITAL_KEYS) {
    const n = input[k]
    if (typeof n === 'number' && Number.isFinite(n)) out[k] = n
    else if (forUpdate) out[k] = null // clear on edit
  }
  const notes = (input.notes ?? '').trim().slice(0, 500)
  if (notes || forUpdate) out.notes = notes
  const at = input.recordedAt instanceof Date ? input.recordedAt : new Date(input.recordedAt)
  out.recordedAt = Timestamp.fromDate(isNaN(at.getTime()) ? new Date() : at)
  return out
}

export async function addVital(pid: string, input: VitalInput): Promise<string> {
  const ref = await addDoc(vitalsCol(pid), {
    ...measurementFields(input, false),
    createdBy: currentUid(),
    createdAt: serverTimestamp(),
  })
  return ref.id
}

export async function updateVital(pid: string, id: string, input: VitalInput): Promise<void> {
  await updateDoc(doc(vitalsCol(pid), id), { ...measurementFields(input, true), updatedAt: serverTimestamp() })
}

export async function deleteVital(pid: string, id: string): Promise<void> {
  await deleteDoc(doc(vitalsCol(pid), id))
}
