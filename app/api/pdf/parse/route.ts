import { NextRequest, NextResponse } from 'next/server'
import { requireUser, requireRole, errorResponse, HttpError } from '@/lib/server/auth'
import { getAdminDb } from '@/lib/server/firebase-admin'
import { extractLabValues } from '@/lib/server/pdf/extract'
import { reserveExtraction } from '@/lib/server/usage'

export const runtime = 'nodejs'

/**
 * Legacy parse endpoint (fallback when the vault upload fails): POST
 * multipart `pid` + `file` (PDF, ≤ 10 MB) → extracted values. Nothing is
 * stored. Editors and owners of `pid` only; a Gemini fallback counts against
 * the caller's daily extraction quota (lib/server/usage.ts).
 *
 * The body size is checked from Content-Length BEFORE it is read: requests
 * without a numeric Content-Length get 411, oversized ones 413.
 */

const MAX_BYTES = 10 * 1024 * 1024 // 10 MB
// multipart overhead on top of the file itself
const MAX_REQUEST_BYTES = MAX_BYTES + 64 * 1024

export async function POST(req: NextRequest) {
  // Netlify ends functions at 30 s (not maxDuration): leave the model until
  // 25 s after the request arrived, then fall back to the parser's values.
  const deadline = Date.now() + 25_000
  try {
    const user = await requireUser(req)

    const rawLength = req.headers.get('content-length')
    if (!rawLength || !/^\d+$/.test(rawLength.trim())) throw new HttpError(411, 'Content-Length required')
    if (Number(rawLength) > MAX_REQUEST_BYTES) throw new HttpError(413, 'File too large (max 10 MB)')

    const formData = await req.formData()
    const pid = formData.get('pid')
    await requireRole(user, typeof pid === 'string' ? pid : '', 'editor')

    const file = formData.get('file')
    if (!(file instanceof File)) throw new HttpError(400, 'No file provided')
    if (file.size > MAX_BYTES) throw new HttpError(413, 'File too large (max 10 MB)')

    const buffer = Buffer.from(await file.arrayBuffer())
    const isPdfType = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    const hasPdfMagic = buffer.subarray(0, 5).toString('latin1') === '%PDF-'
    if (!isPdfType || !hasPdfMagic) throw new HttpError(415, 'Only PDF files are supported')

    const result = await extractLabValues(buffer, 'application/pdf', {
      deadline,
      beforeAi: async () => {
        await reserveExtraction(getAdminDb(), user.uid)
      },
    })
    return NextResponse.json(
      {
        values: result.values,
        date: result.date,
        labName: result.labName || 'Unknown Lab',
        extractedCount: result.extractedCount,
        method: result.method,
        note: result.note ?? null,
        retryable: !!result.partial,
      },
      { headers: { 'Cache-Control': 'private, no-store' } }
    )
  } catch (err) {
    return errorResponse(err)
  }
}
