import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/server/firebase-admin'
import { HttpError, errorResponse, requireMember } from '@/lib/server/auth'
import { notifyRecordAdded } from '@/lib/server/notifications/reminders'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ID_RE = /^[A-Za-z0-9_-]{1,128}$/

/**
 * POST /api/notifications/record-added {pid, recordId} (editor+).
 *
 * Called by the upload / new-record flows after the client saved a lab
 * record (client writes can't trigger server push without Cloud Functions).
 * Tells the rest of the care circle, and sends any new critical alert now
 * instead of waiting for the hourly cron. Idempotent per record.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { pid?: unknown; recordId?: unknown }
    const pid = typeof body.pid === 'string' ? body.pid : ''
    const recordId = typeof body.recordId === 'string' ? body.recordId : ''
    const { user } = await requireMember(req, pid, 'editor')
    if (!ID_RE.test(recordId)) throw new HttpError(400, 'Invalid record id')

    const db = getAdminDb()
    const member = await db.doc(`patients/${pid}/members/${user.uid}`).get()
    const name = (member.get('displayName') as string | undefined) || user.name || null
    const summary = await notifyRecordAdded(db, new Date(), pid, recordId, { uid: user.uid, name })
    return NextResponse.json({ ok: true, ...summary })
  } catch (err) {
    return errorResponse(err)
  }
}
