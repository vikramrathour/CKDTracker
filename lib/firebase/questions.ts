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
import { logActivity } from './patients'
import type { Question, QuestionStatus } from '@/lib/types/care'

/** patients/{pid}/questions — questions for the doctor (open → asked → answered). */

const questionsCol = (pid: string) => collection(getDb(), 'patients', pid, 'questions')
const questionDoc = (pid: string, id: string) => doc(getDb(), 'patients', pid, 'questions', id)

export function questionFromDoc(id: string, data: DocumentData): Question {
  return {
    ...data,
    id,
    text: typeof data.text === 'string' ? data.text : '',
    status: (['open', 'asked', 'answered'] as const).includes(data.status) ? data.status : 'open',
    createdAt: toIso(data.createdAt),
    askedAt: toIso(data.askedAt) ?? null,
    answeredAt: toIso(data.answeredAt) ?? null,
  } as Question
}

export function subscribeQuestions(
  pid: string,
  onNext: (questions: Question[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    questionsCol(pid),
    (snap) =>
      onNext(
        snap.docs
          .map((d) => questionFromDoc(d.id, d.data()))
          .sort((a, b) => (b.createdAt ?? '9999').localeCompare(a.createdAt ?? '9999'))
      ),
    onError
  )
}

export async function addQuestion(pid: string, text: string, opts: { visitId?: string | null } = {}): Promise<string> {
  const ref = await addDoc(questionsCol(pid), {
    text: text.trim().slice(0, 1000),
    status: 'open',
    visitId: opts.visitId ?? null,
    source: 'user',
    createdBy: currentUid(),
    createdAt: serverTimestamp(),
  })
  await logActivity(pid, 'question.added', { targetType: 'question', targetId: ref.id, summary: 'Added a question for the doctor' })
  return ref.id
}

export async function updateQuestionText(pid: string, id: string, text: string, visitId?: string | null): Promise<void> {
  const data: Record<string, unknown> = { text: text.trim().slice(0, 1000) }
  if (visitId !== undefined) data.visitId = visitId
  await updateDoc(questionDoc(pid, id), data)
}

/**
 * Move a question through open → asked → answered (or back). Timestamps are
 * set on entry to a status and cleared when moving back before it.
 */
export async function setQuestionStatus(
  pid: string,
  id: string,
  status: QuestionStatus,
  extra: { answer?: string; visitId?: string | null } = {}
): Promise<void> {
  const data: Record<string, unknown> = { status }
  if (status === 'open') {
    data.askedAt = null
    data.answeredAt = null
  } else if (status === 'asked') {
    data.askedAt = serverTimestamp()
    data.answeredAt = null
  } else {
    data.answeredAt = serverTimestamp()
    data.answer = (extra.answer ?? '').trim().slice(0, 4000)
  }
  if (extra.visitId !== undefined) data.visitId = extra.visitId
  await updateDoc(questionDoc(pid, id), data)
}

export async function deleteQuestion(pid: string, id: string): Promise<void> {
  await deleteDoc(questionDoc(pid, id))
}

export async function linkQuestionToVisit(pid: string, id: string, visitId: string | null): Promise<void> {
  await updateDoc(questionDoc(pid, id), { visitId })
}

/**
 * After saving a visit: point the selected questions at it and unlink the
 * ones that were deselected. Best-effort per question.
 */
export async function syncVisitQuestions(
  pid: string,
  visitId: string,
  selectedIds: string[],
  questions: Pick<Question, 'id' | 'visitId'>[]
): Promise<void> {
  const selected = new Set(selectedIds)
  const ops: Promise<void>[] = []
  for (const q of questions) {
    if (selected.has(q.id) && q.visitId !== visitId) ops.push(linkQuestionToVisit(pid, q.id, visitId))
    else if (!selected.has(q.id) && q.visitId === visitId) ops.push(linkQuestionToVisit(pid, q.id, null))
  }
  const results = await Promise.allSettled(ops)
  if (results.some((r) => r.status === 'rejected')) console.warn('Some question links were not updated')
}
