import { NextResponse } from 'next/server'
import { errorResponse, HttpError, requireMember } from '@/lib/server/auth'
import { getAdminDb } from '@/lib/server/firebase-admin'
import { isSafeId } from '@/lib/server/chat/request'

/**
 * DELETE /api/chat/{chatId}?pid=…  — delete a thread and its messages.
 * Only the thread's creator may delete it (threads are private to them).
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function DELETE(req: Request, { params }: { params: Promise<{ chatId: string }> }) {
  try {
    const { chatId } = await params
    const pid = new URL(req.url).searchParams.get('pid') ?? ''
    if (!isSafeId(chatId)) throw new HttpError(400, 'Invalid chat id')
    if (!isSafeId(pid)) throw new HttpError(400, 'Invalid patient id')
    const { user } = await requireMember(req, pid, 'viewer')

    const db = getAdminDb()
    const threadRef = db.doc(`patients/${pid}/chats/${chatId}`)
    const thread = await threadRef.get()
    if (!thread.exists || thread.get('createdBy') !== user.uid) throw new HttpError(404, 'Chat not found')

    // recursiveDelete removes the messages subcollection in batches.
    await db.recursiveDelete(threadRef)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err)
  }
}
