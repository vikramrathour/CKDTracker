import 'server-only'
import { getApps } from 'firebase-admin/app'
import { getStorage } from 'firebase-admin/storage'
import type { DocumentData, Firestore } from 'firebase-admin/firestore'
import type { Content } from '@google/genai'
import type { LabRecord } from '@/lib/types/lab-record'
import type { Medication } from '@/lib/types/medication'
import type { AlertRule, DocumentMeta, DoseChange, Question, Target, Visit } from '@/lib/types/care'
import { getAdminDb } from '@/lib/server/firebase-admin'
import { CONTEXT_LIMITS, type ChatContextInput } from './context'
import { DOCUMENT_INLINE_MAX_BYTES, type LoadedDocument } from './tools'
import { isDocumentStoragePath } from '@/lib/documents/paths'

/**
 * Thin Admin-SDK loaders for /api/chat. Everything is read under
 * patients/{pid}/… for the pid the caller was authorised for.
 */

export const HISTORY_MESSAGES = 12
const HISTORY_CHARS = 4000

/** Admin Timestamp / Date / string → ISO string. */
export function adminIso(v: unknown): string | undefined {
  if (!v) return undefined
  if (typeof v === 'string') return v
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'object' && v && 'toDate' in v && typeof (v as { toDate: unknown }).toDate === 'function') {
    return (v as { toDate: () => Date }).toDate().toISOString()
  }
  return undefined
}

function withDates<T>(id: string, data: DocumentData, dateKeys: string[]): T {
  const out: Record<string, unknown> = { ...data, id }
  for (const k of dateKeys) if (k in data) out[k] = adminIso(data[k]) ?? null
  return out as T
}

async function safeList<T>(p: Promise<T[]>): Promise<T[]> {
  try {
    return await p
  } catch {
    // A missing index or collection must not break the chat; the model is told
    // the data is missing instead.
    return []
  }
}

export async function loadLabRecords(db: Firestore, pid: string): Promise<LabRecord[]> {
  const snap = await db.collection(`patients/${pid}/labRecords`).orderBy('recordDate', 'asc').get()
  return snap.docs.map((d) => {
    const r = withDates<LabRecord>(d.id, d.data(), ['recordDate', 'createdAt', 'updatedAt'])
    return { ...r, values: Array.isArray(r.values) ? r.values : [], recordDate: r.recordDate || new Date(0).toISOString() }
  })
}

export async function loadChatContextInput(
  db: Firestore,
  pid: string,
  records: LabRecord[],
  today: string
): Promise<ChatContextInput> {
  const base = db.doc(`patients/${pid}`)
  const [patientSnap, medications, visits, questions, targets, alertRules, documents] = await Promise.all([
    base.get(),
    safeList(base.collection('medications').get().then((s) => s.docs.map((d) => withDates<Medication>(d.id, d.data(), ['createdAt'])))),
    safeList(
      base.collection('visits').orderBy('visitDate', 'desc').limit(CONTEXT_LIMITS.visits).get()
        .then((s) => s.docs.map((d) => withDates<Visit>(d.id, d.data(), ['createdAt', 'updatedAt'])))
    ),
    safeList(
      base.collection('questions').where('status', '==', 'open').limit(CONTEXT_LIMITS.questions).get()
        .then((s) => s.docs.map((d) => withDates<Question>(d.id, d.data(), ['createdAt', 'askedAt', 'answeredAt'])))
    ),
    safeList(base.collection('targets').get().then((s) => s.docs.map((d) => ({ testName: d.id, ...d.data() }) as Target))),
    safeList(base.collection('alertRules').get().then((s) => s.docs.map((d) => withDates<AlertRule>(d.id, d.data(), ['createdAt'])))),
    safeList(
      base.collection('documents').orderBy('createdAt', 'desc').limit(CONTEXT_LIMITS.documents).get()
        .then((s) => s.docs.map((d) => withDates<DocumentMeta>(d.id, d.data(), ['createdAt'])))
    ),
  ])

  const active = medications.filter((m) => m.isActive !== false)
  const doseChanges = (
    await Promise.all(
      active.map((m) =>
        safeList(
          base.collection(`medications/${m.id}/doseHistory`).orderBy('effectiveDate', 'desc').limit(CONTEXT_LIMITS.doseChangesPerMed).get()
            .then((s) => s.docs.map((d) => ({ ...withDates<DoseChange>(d.id, d.data(), ['createdAt']), medicationId: m.id })))
        )
      )
    )
  ).flat()

  const p = patientSnap.exists ? patientSnap.data() ?? {} : {}
  const dateOnly = (v: unknown) => adminIso(v)?.slice(0, 10) ?? null
  return {
    today,
    patient: { dateOfBirth: dateOnly(p.dateOfBirth), transplantDate: dateOnly(p.transplantDate) },
    records,
    medications,
    doseChanges,
    visits,
    questions,
    targets,
    alertRules,
    documents,
  }
}

/** Last HISTORY_MESSAGES turns of a thread, oldest first, as Gemini contents. */
export async function loadHistory(db: Firestore, pid: string, chatId: string): Promise<Content[]> {
  const snap = await db
    .collection(`patients/${pid}/chats/${chatId}/messages`)
    .orderBy('createdAt', 'desc')
    .limit(HISTORY_MESSAGES)
    .get()
  return snap.docs
    .reverse()
    .map((d) => d.data())
    .filter((m) => (m.role === 'user' || m.role === 'model') && typeof m.text === 'string' && m.text)
    .map((m) => ({ role: m.role as string, parts: [{ text: String(m.text).slice(0, HISTORY_CHARS) }] }))
}

/**
 * Document metadata + bytes, only for patients/{pid}/documents/{docId}.
 * Bytes are downloaded only when the file is ≤ maxBytes (the caller's
 * remaining per-message allowance, never more than DOCUMENT_INLINE_MAX_BYTES).
 */
export async function loadDocumentForPatient(
  pid: string,
  docId: string,
  maxBytes: number = DOCUMENT_INLINE_MAX_BYTES
): Promise<LoadedDocument | null> {
  const db = getAdminDb()
  const snap = await db.doc(`patients/${pid}/documents/${docId}`).get()
  if (!snap.exists) return null
  const meta = snap.data() as Partial<DocumentMeta>
  // Scope check: the file must sit directly in THIS document's folder of THIS patient.
  if (!isDocumentStoragePath(meta.storagePath, pid, docId)) return null
  const path = meta.storagePath
  const limit = Math.min(maxBytes, DOCUMENT_INLINE_MAX_BYTES)
  const contentType = String(meta.contentType || '')
  const declared = Number(meta.size) || 0
  const base = { contentType, size: declared, title: meta.title, documentDate: meta.documentDate ?? null }
  if (declared > limit) return base

  const bucketName = process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
  const file = getStorage(getApps()[0]).bucket(bucketName).file(path)
  const [fileMeta] = await file.getMetadata()
  const size = Number(fileMeta.size) || declared
  if (size > limit) return { ...base, size }
  const [data] = await file.download()
  return { ...base, size: data.length, data }
}
