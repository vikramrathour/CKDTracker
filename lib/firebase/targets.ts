import { collection, deleteDoc, doc, onSnapshot, type DocumentData, type Unsubscribe } from 'firebase/firestore'
import { getDb, toIso } from './firestore'
import { logActivity, setTarget } from './patients'
import type { Target } from '@/lib/types/care'

/**
 * Patient-specific targets: patients/{pid}/targets/{testName}.
 * The doc id is the exact REFERENCE_RANGES key. Writes go through
 * setTarget() in patients.ts (create vs update, createdBy, activity).
 */

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined)

export function targetFromDoc(id: string, data: DocumentData): Target {
  return {
    testName: str(data.testName) ?? id,
    min: num(data.min),
    max: num(data.max),
    unit: str(data.unit),
    setBy: str(data.setBy),
    notes: str(data.notes),
    createdBy: String(data.createdBy ?? ''),
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  }
}

export function subscribeTargets(
  pid: string,
  onNext: (targets: Target[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    collection(getDb(), 'patients', pid, 'targets'),
    (snap) => onNext(snap.docs.map((d) => targetFromDoc(d.id, d.data())).sort((a, b) => a.testName.localeCompare(b.testName))),
    onError
  )
}

export interface TargetInput {
  min: number | null
  max: number | null
  unit?: string
  setBy?: string
  notes?: string
}

/** Create or update. Empty strings are written as '' so edits can clear them. */
export async function saveTarget(pid: string, testName: string, input: TargetInput): Promise<void> {
  await setTarget(pid, testName, {
    min: input.min,
    max: input.max,
    unit: (input.unit ?? '').trim().slice(0, 30),
    setBy: (input.setBy ?? '').trim().slice(0, 120),
    notes: (input.notes ?? '').trim().slice(0, 500),
  })
}

export async function deleteTarget(pid: string, testName: string): Promise<void> {
  await deleteDoc(doc(getDb(), 'patients', pid, 'targets', testName))
  await logActivity(pid, 'target.updated', { targetType: 'target', targetId: testName, summary: `Removed target for ${testName}` })
}
