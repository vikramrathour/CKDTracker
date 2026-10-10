import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  type DocumentData,
  type Unsubscribe,
} from 'firebase/firestore'
import { currentUid, getDb, toIso } from './firestore'
import { logActivity } from './patients'
import { formatYmd } from '@/lib/utils'
import type { VisitRecord } from '@/lib/visits/types'

/** patients/{pid}/visits — viewer read, editor write (firestore.rules). */

export type VisitInput = Omit<VisitRecord, 'id' | 'createdBy' | 'createdAt' | 'updatedAt'>

const visitsCol = (pid: string) => collection(getDb(), 'patients', pid, 'visits')

export function visitFromDoc(id: string, data: DocumentData): VisitRecord {
  return {
    ...data,
    id,
    visitDate: typeof data.visitDate === 'string' ? data.visitDate : '',
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  } as VisitRecord
}

/** Firestore rejects `undefined`; drop those keys (null and '' are kept). */
export function compact<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v
  return out as Partial<T>
}

/** Realtime visits (unsorted; use splitVisits). */
export function subscribeVisits(
  pid: string,
  onNext: (visits: VisitRecord[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    visitsCol(pid),
    (snap) => onNext(snap.docs.map((d) => visitFromDoc(d.id, d.data()))),
    onError
  )
}

export async function getVisit(pid: string, id: string): Promise<VisitRecord | null> {
  const snap = await getDoc(doc(getDb(), 'patients', pid, 'visits', id))
  return snap.exists() ? visitFromDoc(snap.id, snap.data()) : null
}

export async function addVisit(pid: string, input: VisitInput): Promise<string> {
  const ref = await addDoc(visitsCol(pid), {
    ...compact(input),
    createdBy: currentUid(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  await logActivity(pid, 'visit.added', { targetType: 'visit', targetId: ref.id, summary: `Added a visit for ${formatYmd(input.visitDate)}` })
  return ref.id
}

export async function updateVisit(pid: string, id: string, input: Partial<VisitInput>): Promise<void> {
  await updateDoc(doc(getDb(), 'patients', pid, 'visits', id), { ...compact(input), updatedAt: serverTimestamp() })
}

export async function deleteVisit(pid: string, id: string): Promise<void> {
  await deleteDoc(doc(getDb(), 'patients', pid, 'visits', id))
}
