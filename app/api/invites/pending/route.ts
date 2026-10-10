import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/server/firebase-admin'
import { requireUser } from '@/lib/server/auth'
import { listPendingForActor } from '@/lib/server/invites'
import { NO_STORE, actorFrom, inviteErrorResponse } from '../_shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/invites/pending: invites sent to the caller's verified phone
 * number (ID token `phone_number`), pending and unexpired, for patients they
 * aren't already in. Empty for accounts without a phone number.
 */
export async function GET(req: Request) {
  try {
    const user = await requireUser(req)
    const actor = actorFrom(user)
    const invites = await listPendingForActor(getAdminDb(), actor)
    return NextResponse.json({ invites, hasPhone: Boolean(actor.phone) }, { headers: NO_STORE })
  } catch (err) {
    return inviteErrorResponse(err)
  }
}
