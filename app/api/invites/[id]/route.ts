import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/server/firebase-admin'
import { requireMember } from '@/lib/server/auth'
import { getInvite, revokeInvite } from '@/lib/server/invites'
import { NO_STORE, actorFrom, inviteErrorResponse } from '../_shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** DELETE /api/invites/{id}: the patient's owner revokes a pending invite. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const db = getAdminDb()
    const invite = await getInvite(db, id)
    const { user } = await requireMember(req, invite.pid, 'owner')
    await revokeInvite(db, actorFrom(user), id)
    return NextResponse.json({ ok: true }, { headers: NO_STORE })
  } catch (err) {
    return inviteErrorResponse(err)
  }
}
