/**
 * Document vault paths, shared by the client uploader, the server routes that
 * read vault files (/api/documents/extract, the chat's get_document) and the
 * tests. Pure: no Firebase imports.
 *
 *   Firestore patients/{pid}/documents/{docId}              DocumentMeta (written FIRST)
 *   Storage   patients/{pid}/documents/{docId}/{fileName}   the bytes
 *
 * storage.rules only accept an upload whose path equals the metadata doc's
 * `storagePath`, so an object can't exist without its metadata.
 */

/** Firestore auto-ids and our own ids: plain [A-Za-z0-9_-]. */
export const DOCUMENT_ID_RE = /^[A-Za-z0-9_-]{1,128}$/

/** Storage object names: keep it to a safe, readable subset (≤ 120 chars). */
export function safeFileName(name: string): string {
  const cleaned = name.normalize('NFKD').replace(/[^\w.\-]+/g, '_').replace(/_+/g, '_')
  const tail = cleaned.slice(-120).replace(/^\.+/, '')
  return tail || 'document'
}

export function documentFolder(pid: string, docId: string): string {
  return `patients/${pid}/documents/${docId}/`
}

export function documentStoragePath(pid: string, docId: string, fileName: string): string {
  return `${documentFolder(pid, docId)}${fileName}`
}

/**
 * True when `path` is a file directly inside THIS document's folder:
 * patients/{pid}/documents/{docId}/{one segment}. Metadata is client-written,
 * so server code must never follow a path that points at another patient,
 * another document, a sub-folder, or uses `..`.
 */
export function isDocumentStoragePath(path: unknown, pid: string, docId: string): path is string {
  if (typeof path !== 'string' || !pid || !docId) return false
  if (pid.includes('/') || !DOCUMENT_ID_RE.test(docId)) return false
  const prefix = documentFolder(pid, docId)
  if (!path.startsWith(prefix)) return false
  const name = path.slice(prefix.length)
  // eslint-disable-next-line no-control-regex
  if (!name || name.length > 200 || name.includes('/') || name.includes('\\') || /[\u0000-\u001f\u007f]/.test(name)) return false
  return name !== '.' && name !== '..'
}
