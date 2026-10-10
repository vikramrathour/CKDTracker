import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { collection, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { getStorageInstance } from './config'
import { currentUid, getDb } from './firestore'
import { DOCUMENT_CONTENT_TYPES, DOCUMENT_MAX_BYTES, type DocumentKind } from '@/lib/types/care'

/** Storage object names: keep it to a safe, readable subset. */
function safeFileName(name: string): string {
  const cleaned = name.normalize('NFKD').replace(/[^\w.\-]+/g, '_').replace(/_+/g, '_')
  return cleaned.slice(-120) || 'document'
}

/**
 * Upload a file into the patient's document vault:
 *   Storage   patients/{pid}/documents/{docId}/{fileName}
 *   Firestore patients/{pid}/documents/{docId}   (DocumentMeta)
 * Editors/owners only; PDF or image, under 20 MB (storage.rules).
 */
export async function uploadDocument(
  pid: string,
  file: File,
  meta: { kind: DocumentKind; title?: string; documentDate?: string | null; labRecordId?: string | null; source?: 'upload' | 'camera' }
): Promise<{ docId: string; storagePath: string }> {
  const contentType = file.type || 'application/octet-stream'
  if (!(DOCUMENT_CONTENT_TYPES as readonly string[]).includes(contentType)) {
    throw new Error('Only PDF, JPEG, PNG, WebP or HEIC files can be stored')
  }
  if (file.size >= DOCUMENT_MAX_BYTES) throw new Error('Files must be under 20 MB')

  const db = getDb()
  const docRef = doc(collection(db, 'patients', pid, 'documents'))
  const fileName = safeFileName(file.name)
  const storagePath = `patients/${pid}/documents/${docRef.id}/${fileName}`

  const storage = await getStorageInstance()
  await uploadBytes(ref(storage, storagePath), file, { contentType })

  await setDoc(docRef, {
    kind: meta.kind,
    title: meta.title ?? file.name.slice(0, 200),
    fileName,
    storagePath,
    contentType,
    size: file.size,
    documentDate: meta.documentDate ?? null,
    labRecordId: meta.labRecordId ?? null,
    source: meta.source ?? 'upload',
    createdBy: currentUid(),
    createdAt: serverTimestamp(),
  })
  return { docId: docRef.id, storagePath }
}

/** Link a stored document to the lab record it produced. */
export async function linkDocumentToRecord(pid: string, docId: string, labRecordId: string): Promise<void> {
  await updateDoc(doc(getDb(), 'patients', pid, 'documents', docId), { labRecordId })
}

export async function getDocumentUrl(path: string): Promise<string> {
  const storage = await getStorageInstance()
  return getDownloadURL(ref(storage, path))
}

/** @deprecated use getDocumentUrl */
export const getPDFUrl = getDocumentUrl
