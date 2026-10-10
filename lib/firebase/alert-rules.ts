import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  type DocumentData,
  type Unsubscribe,
} from 'firebase/firestore'
import { currentUid, getDb, toIso } from './firestore'
import type { AlertOperator, AlertRule } from '@/lib/types/care'

/**
 * patients/{pid}/alertRules — user-defined alert rules, evaluated by
 * computeAlerts() in lib/calculations/alerts.ts (banner, chat, push).
 * Shape is enforced by validAlertRule() in firestore.rules: above/below need
 * a threshold, change-pct a positive percent, outside-target none.
 */

export const ALERT_OPERATORS: readonly AlertOperator[] = ['above', 'below', 'change-pct', 'outside-target']

const rulesCol = (pid: string) => collection(getDb(), 'patients', pid, 'alertRules')

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

export function alertRuleFromDoc(id: string, data: DocumentData): AlertRule {
  return {
    id,
    testName: typeof data.testName === 'string' ? data.testName : '',
    op: (ALERT_OPERATORS as readonly string[]).includes(data.op) ? (data.op as AlertOperator) : 'above',
    threshold: num(data.threshold),
    enabled: data.enabled !== false,
    label: typeof data.label === 'string' ? data.label : '',
    createdBy: String(data.createdBy ?? ''),
    createdAt: toIso(data.createdAt),
  }
}

export function subscribeAlertRules(
  pid: string,
  onNext: (rules: AlertRule[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    rulesCol(pid),
    (snap) =>
      onNext(
        snap.docs
          .map((d) => alertRuleFromDoc(d.id, d.data()))
          .sort((a, b) => a.testName.localeCompare(b.testName) || (a.createdAt ?? '').localeCompare(b.createdAt ?? ''))
      ),
    onError
  )
}

export interface AlertRuleInput {
  testName: string
  op: AlertOperator
  /** Required for above/below/change-pct; ignored (stored as null) for outside-target. */
  threshold: number | null
  label?: string
}

export async function addAlertRule(pid: string, input: AlertRuleInput): Promise<string> {
  const ref = await addDoc(rulesCol(pid), {
    testName: input.testName.slice(0, 100),
    op: input.op,
    threshold: input.op === 'outside-target' ? null : input.threshold,
    enabled: true,
    label: (input.label ?? '').trim().slice(0, 80),
    createdBy: currentUid(),
    createdAt: serverTimestamp(),
  })
  return ref.id
}

export async function setAlertRuleEnabled(pid: string, id: string, enabled: boolean): Promise<void> {
  await updateDoc(doc(getDb(), 'patients', pid, 'alertRules', id), { enabled })
}

export async function deleteAlertRule(pid: string, id: string): Promise<void> {
  await deleteDoc(doc(getDb(), 'patients', pid, 'alertRules', id))
}
