import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/server/firebase-admin'
import { requireUser } from '@/lib/server/auth'
import { redeemInvite } from '@/lib/server/invites'
import { NO_STORE, actorFrom, inviteErrorResponse, readJson } from '../_shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/invites/redeem {inviteId, displayName?}
 * 200 {pid, patientName, role, alreadyMember}; 403 phone mismatch;
 * 404 unknown; 410 expired / revoked / already used.
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser(req)
    const body = await readJson(req)
    const result = await redeemInvite(getAdminDb(), actorFrom(user), String(body.inviteId ?? ''), {
      displayName: body.displayName,
    })
    return NextResponse.json(result, { headers: NO_STORE })
  } catch (err) {
    return inviteErrorResponse(err)
  }
}
