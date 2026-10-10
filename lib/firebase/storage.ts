import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { collection, deleteDoc, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { getStorageInstance } from './config'
import { currentUid, getDb } from './firestore'
import { DOCUMENT_CONTENT_TYPES, DOCUMENT_MAX_BYTES, type DocumentKind } from '@/lib/types/care'
import { documentStoragePath, safeFileName } from '@/lib/documents/paths'

/**
 * Upload a file into the patient's document vault:
 *   1. Firestore patients/{pid}/documents/{docId}   (DocumentMeta, incl. storagePath)
 *   2. Storage   patients/{pid}/documents/{docId}/{fileName}
 * Metadata goes first: storage.rules only accept an object whose path equals
 * the metadata's storagePath, so no file can exist without its metadata. If
 * the upload fails the metadata doc is removed again.
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
  const storagePath = documentStoragePath(pid, docRef.id, fileName)

  await setDoc(docRef, {
    kind: meta.kind,
    title: (meta.title ?? file.name).slice(0, 200),
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

  try {
    const storage = await getStorageInstance()
    await uploadBytes(ref(storage, storagePath), file, { contentType })
  } catch (err) {
    // Don't leave metadata pointing at a file that was never stored.
    await deleteDoc(docRef).catch(() => console.warn('Could not remove metadata for a failed upload'))
    throw err
  }
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
