import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
  type DocumentData,
  type Unsubscribe,
} from 'firebase/firestore'
import { apiFetch } from '@/lib/api/client'
import { currentUid, getDb, toIso } from './firestore'
import type { AlertRule, ChatMessage, ChatThread, Target } from '@/lib/types/care'
import type { ChartPayload } from '@/lib/server/chat/events'

/**
 * Client reads for "Chat with your reports". Threads and messages are written
 * only by /api/chat (Admin SDK); firestore.rules let the thread's creator read
 * them. The one client write here is saving a proposed doctor question
 * (editors only, like any other question).
 */

export interface ChatMessageView extends ChatMessage {
  citationMap?: Record<string, string[]>
  proposals?: string[]
  charts?: ChartPayload[]
}

function threadFromDoc(id: string, d: DocumentData): ChatThread {
  return {
    id,
    title: typeof d.title === 'string' ? d.title : 'Chat',
    createdBy: String(d.createdBy ?? ''),
    createdAt: toIso(d.createdAt),
    updatedAt: toIso(d.updatedAt),
    messageCount: typeof d.messageCount === 'number' ? d.messageCount : undefined,
  }
}

function messageFromDoc(id: string, d: DocumentData): ChatMessageView {
  return {
    id,
    role: d.role === 'model' ? 'model' : 'user',
    text: typeof d.text === 'string' ? d.text : '',
    citations: Array.isArray(d.citations) ? d.citations : [],
    citationMap: d.citationMap && typeof d.citationMap === 'object' ? d.citationMap : undefined,
    toolCalls: Array.isArray(d.toolCalls) ? d.toolCalls : [],
    proposals: Array.isArray(d.proposals) ? d.proposals : [],
    charts: Array.isArray(d.charts) ? d.charts : [],
    tokensIn: d.tokensIn,
    tokensOut: d.tokensOut,
    createdAt: toIso(d.createdAt),
  }
}

/** The signed-in user's threads for a patient, newest activity first. */
export function subscribeChatThreads(
  pid: string,
  uid: string,
  onNext: (threads: ChatThread[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  // Equality filter only (sorted client-side), so no composite index is needed;
  // the filter is also what lets the rules allow the list query.
  const q = query(collection(getDb(), 'patients', pid, 'chats'), where('createdBy', '==', uid))
  return onSnapshot(
    q,
    (snap) =>
      onNext(
        snap.docs
          .map((d) => threadFromDoc(d.id, d.data()))
          .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
      ),
    onError
  )
}

export function subscribeChatMessages(
  pid: string,
  chatId: string,
  onNext: (messages: ChatMessageView[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const q = query(collection(getDb(), 'patients', pid, 'chats', chatId, 'messages'), orderBy('createdAt', 'asc'))
  return onSnapshot(q, (snap) => onNext(snap.docs.map((d) => messageFromDoc(d.id, d.data()))), onError)
}

/** Save an assistant-proposed question after the user confirms (editor+; rules enforce createdBy). */
export async function addQuestionFromChat(pid: string, text: string): Promise<string> {
  const ref = await addDoc(collection(getDb(), 'patients', pid, 'questions'), {
    text: text.trim().slice(0, 500),
    status: 'open',
    source: 'chat',
    createdBy: currentUid(),
    createdAt: serverTimestamp(),
  })
  return ref.id
}

export async function deleteChatThread(pid: string, chatId: string): Promise<void> {
  const res = await apiFetch(`/api/chat/${encodeURIComponent(chatId)}?pid=${encodeURIComponent(pid)}`, { method: 'DELETE' })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || 'Could not delete this chat')
  }
}

/** Targets + alert rules for the alerts banner (realtime). */
export function subscribeAlertInputs(
  pid: string,
  onNext: (v: { targets: Target[]; alertRules: AlertRule[] }) => void,
  onError: (err: Error) => void
): Unsubscribe {
  let targets: Target[] = []
  let alertRules: AlertRule[] = []
  let gotTargets = false
  let gotRules = false
  const push = () => {
    if (gotTargets && gotRules) onNext({ targets, alertRules })
  }
  const u1 = onSnapshot(
    collection(getDb(), 'patients', pid, 'targets'),
    (s) => {
      targets = s.docs.map((d) => ({ ...(d.data() as Target), testName: (d.data().testName as string) || d.id }))
      gotTargets = true
      push()
    },
    onError
  )
  const u2 = onSnapshot(
    collection(getDb(), 'patients', pid, 'alertRules'),
    (s) => {
      alertRules = s.docs.map((d) => ({ ...(d.data() as AlertRule), id: d.id }))
      gotRules = true
      push()
    },
    onError
  )
  return () => {
    u1()
    u2()
  }
}
