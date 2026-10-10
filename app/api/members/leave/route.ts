import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/server/firebase-admin'
import { requireMember } from '@/lib/server/auth'
import { leaveCircle } from '@/lib/server/invites'
import { NO_STORE, actorFrom, inviteErrorResponse, readJson } from '../../invites/_shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/members/leave {pid}: leave a care circle (not the owner).
 * Server-side so a viewer's departure still lands in the activity feed
 * (rules only let editors append activity).
 */
export async function POST(req: Request) {
  try {
    const body = await readJson(req)
    const pid = typeof body.pid === 'string' ? body.pid : ''
    const { user } = await requireMember(req, pid, 'viewer')
    await leaveCircle(getAdminDb(), actorFrom(user), pid)
    return NextResponse.json({ ok: true }, { headers: NO_STORE })
  } catch (err) {
    return inviteErrorResponse(err)
  }
}
