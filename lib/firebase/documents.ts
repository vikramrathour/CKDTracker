import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  updateDoc,
  writeBatch,
  type DocumentData,
  type Unsubscribe,
} from 'firebase/firestore'
import { deleteObject, ref } from 'firebase/storage'
import { getStorageInstance } from './config'
import { currentUid, getDb, toIso } from './firestore'
import { logActivity } from './patients'
import { formatYmd } from '@/lib/utils'
import type { DocumentMeta } from '@/lib/types/care'
import type { LabRecord, LabValue } from '@/lib/types/lab-record'

/**
 * Document vault metadata (patients/{pid}/documents) and record ↔ document
 * links. Uploads go through uploadDocument() in ./storage.
 */

/** Lab records created from a vault document carry its id (local extra; see lib/types/lab-record). */
export type LabRecordWithSource = LabRecord & { sourceDocumentId?: string | null }

const documentsCol = (pid: string) => collection(getDb(), 'patients', pid, 'documents')

export function documentFromDoc(id: string, data: DocumentData): DocumentMeta {
  return { ...data, id, createdAt: toIso(data.createdAt) } as DocumentMeta
}

/** Realtime vault listing, newest first (by document date, then upload time). */
export function subscribeDocuments(
  pid: string,
  onNext: (docs: DocumentMeta[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    documentsCol(pid),
    (snap) =>
      onNext(
        snap.docs
          .map((d) => documentFromDoc(d.id, d.data()))
          .sort((a, b) => (b.documentDate || b.createdAt || '').localeCompare(a.documentDate || a.createdAt || ''))
      ),
    onError
  )
}

export async function getDocumentMeta(pid: string, id: string): Promise<DocumentMeta | null> {
  const snap = await getDoc(doc(getDb(), 'patients', pid, 'documents', id))
  return snap.exists() ? documentFromDoc(snap.id, snap.data()) : null
}

/** Delete the stored file, then its metadata. A missing file is not an error. */
export async function deleteDocument(pid: string, meta: Pick<DocumentMeta, 'id' | 'storagePath'>): Promise<void> {
  if (meta.storagePath?.startsWith(`patients/${pid}/documents/${meta.id}/`)) {
    const storage = await getStorageInstance()
    try {
      await deleteObject(ref(storage, meta.storagePath))
    } catch (err) {
      if ((err as { code?: string })?.code !== 'storage/object-not-found') throw err
    }
  }
  await deleteDoc(doc(getDb(), 'patients', pid, 'documents', meta.id))
}

export async function updateDocumentMeta(
  pid: string,
  id: string,
  data: Partial<Pick<DocumentMeta, 'kind' | 'title' | 'documentDate'>>
): Promise<void> {
  const clean: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data)) if (v !== undefined) clean[k] = v
  await updateDoc(doc(getDb(), 'patients', pid, 'documents', id), clean)
}

/**
 * Save reviewed values from a vault document as a new lab record and link
 * both ways in one batch: record.sourceDocumentId + pdfPath → document,
 * document.labRecordId + documentDate → record.
 */
export async function saveRecordFromDocument(
  pid: string,
  document: Pick<DocumentMeta, 'id' | 'storagePath'>,
  record: { recordDate: string; labName: string; values: LabValue[]; notes?: string }
): Promise<string> {
  const db = getDb()
  const batch = writeBatch(db)
  const recordRef = doc(collection(db, 'patients', pid, 'labRecords'))
  batch.set(recordRef, {
    recordDate: Timestamp.fromDate(new Date(record.recordDate)),
    labName: record.labName.slice(0, 120),
    doctorName: '',
    notes: record.notes ?? '',
    pdfPath: document.storagePath,
    sourceDocumentId: document.id,
    values: record.values,
    createdBy: currentUid(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  batch.update(doc(db, 'patients', pid, 'documents', document.id), {
    labRecordId: recordRef.id,
    documentDate: record.recordDate.slice(0, 10),
  })
  await batch.commit()
  await logActivity(pid, 'record.added', { targetType: 'labRecord', targetId: recordRef.id, summary: `Added a report for ${formatYmd(record.recordDate.slice(0, 10))}` })
  return recordRef.id
}
