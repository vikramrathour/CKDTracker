import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/server/firebase-admin'
import { requireUser } from '@/lib/server/auth'
import { setMyDisplayName } from '@/lib/server/invites'
import { NO_STORE, actorFrom, inviteErrorResponse, readJson } from '../../invites/_shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/members/me {displayName}: set your own name on your profile and
 * on every care-circle member doc you hold (members can't write their own
 * member doc under the rules, and the activity rules match actorName to it).
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser(req)
    const body = await readJson(req)
    const result = await setMyDisplayName(getAdminDb(), actorFrom(user), body.displayName)
    return NextResponse.json({ ok: true, ...result }, { headers: NO_STORE })
  } catch (err) {
    return inviteErrorResponse(err)
  }
}
