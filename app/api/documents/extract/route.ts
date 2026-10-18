import { NextRequest, NextResponse } from 'next/server'
import { getStorage } from 'firebase-admin/storage'
import { FieldValue } from 'firebase-admin/firestore'
import { requireMember, errorResponse, HttpError } from '@/lib/server/auth'
import { getAdminAuth, getAdminDb } from '@/lib/server/firebase-admin'
import { extractLabValues } from '@/lib/server/pdf/extract'
import { fromCachedExtraction, toCachedExtraction, type CachedExtraction } from '@/lib/server/pdf/cache'
import { reserveExtraction } from '@/lib/server/usage'
import { DOCUMENT_ID_RE, isDocumentStoragePath } from '@/lib/documents/paths'
import { DOCUMENT_MAX_BYTES } from '@/lib/types/care'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * POST /api/documents/extract  { pid, documentId, force? }   (editor and up)
 *
 * Reads a vault document (patients/{pid}/documents/{documentId}) with the
 * Admin SDK and extracts lab values for the client's review screen.
 *
 * The result is cached on the document (`extraction`, server-written only) and
 * returned on repeat calls without touching Gemini. `force: true` re-reads the
 * file; if the daily AI quota is used up the cached result is returned instead.
 * Each Gemini call counts against EXTRACT_DAILY_LIMIT (lib/server/usage.ts).
 */

function bucketName(): string {
  const name =
    process.env.FIREBASE_STORAGE_BUCKET ||
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ? `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.appspot.com` : '')
  if (!name) throw new Error('Storage bucket not configured')
  return name
}

function respond(documentId: string, r: CachedExtraction, cached: boolean, note?: string | null, retryable = false) {
  return NextResponse.json(
    {
      documentId,
      values: r.values,
      date: r.date,
      labName: r.labName,
      method: r.method,
      extractedCount: r.values.length,
      note: note ?? r.note ?? null,
      cached,
      // The model was skipped or failed: trying again may read more.
      retryable,
    },
    { headers: { 'Cache-Control': 'private, no-store' } }
  )
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as { pid?: unknown; documentId?: unknown; force?: unknown } | null
    const pid = typeof body?.pid === 'string' ? body.pid : ''
    const documentId = typeof body?.documentId === 'string' ? body.documentId : ''
    const force = body?.force === true
    if (!DOCUMENT_ID_RE.test(documentId)) throw new HttpError(400, 'Invalid document id')
    const { user } = await requireMember(req, pid, 'editor')

    const db = getAdminDb()
    const docRef = db.doc(`patients/${pid}/documents/${documentId}`)
    const snap = await docRef.get()
    if (!snap.exists) throw new HttpError(404, 'Document not found')
    const meta = snap.data() as { storagePath?: unknown; contentType?: string; extraction?: unknown }
    // The metadata is client-written: only follow paths inside this document's folder.
    if (!isDocumentStoragePath(meta.storagePath, pid, documentId)) {
      throw new HttpError(400, 'Document has no stored file')
    }

    const cached = fromCachedExtraction(meta.extraction)
    if (cached && !force) return respond(documentId, cached, true)

    const file = getStorage(getAdminAuth().app).bucket(bucketName()).file(meta.storagePath)
    const [exists] = await file.exists()
    if (!exists) throw new HttpError(404, 'Stored file is missing')
    const [fileMeta] = await file.getMetadata()
    if (Number(fileMeta.size ?? 0) >= DOCUMENT_MAX_BYTES) throw new HttpError(413, 'File too large')
    const [buf] = await file.download()

    let result
    try {
      result = await extractLabValues(buf, (fileMeta.contentType as string | undefined) ?? meta.contentType, {
        beforeAi: async () => {
          await reserveExtraction(db, user.uid)
        },
      })
    } catch (err) {
      // Over quota on a photo (429): fall back to the earlier result if there is one.
      if (cached && err instanceof HttpError && err.status === 429) return respond(documentId, cached, true, err.message)
      throw err
    }

    // Quota hit / AI unavailable / transient model error: don't cache a weaker
    // result, and prefer an earlier full one.
    if (result.partial) {
      if (cached) return respond(documentId, cached, true, result.note)
      return respond(documentId, toCachedExtraction(result), false, undefined, true)
    }

    const entry = toCachedExtraction(result)
    await docRef
      .update({ extraction: { ...entry, extractedAt: FieldValue.serverTimestamp() } })
      .catch(() => console.error('Extract: could not cache the result'))
    return respond(documentId, entry, false)
  } catch (err) {
    return errorResponse(err)
  }
}
