import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/server/firebase-admin'
import { requireMember } from '@/lib/server/auth'
import { createInvite, listInvitesForPatient } from '@/lib/server/invites'
import { NO_STORE, actorFrom, appOrigin, inviteErrorResponse, readJson } from './_shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/invites {pid, phone, role: 'editor'|'viewer', inviteeName?}
 * Owner only. 201 (new) / 200 (refreshed existing pending invite)
 * {inviteId, url, reused, role, expiresAt}.
 */
export async function POST(req: Request) {
  try {
    const body = await readJson(req)
    const pid = typeof body.pid === 'string' ? body.pid : ''
    const { user } = await requireMember(req, pid, 'owner')
    const result = await createInvite(getAdminDb(), actorFrom(user), {
      pid,
      phone: typeof body.phone === 'string' ? body.phone : '',
      role: body.role,
      inviteeName: body.inviteeName,
    })
    return NextResponse.json(
      {
        inviteId: result.inviteId,
        url: `${appOrigin(req)}/invite/${result.inviteId}`,
        reused: result.reused,
        role: result.role,
        expiresAt: result.expiresAt,
      },
      { status: result.reused ? 200 : 201, headers: NO_STORE }
    )
  } catch (err) {
    return inviteErrorResponse(err)
  }
}

/** GET /api/invites?pid=… (owner): that patient's pending invites, expired ones flagged. */
export async function GET(req: Request) {
  try {
    const pid = new URL(req.url).searchParams.get('pid') ?? ''
    await requireMember(req, pid, 'owner')
    const invites = await listInvitesForPatient(getAdminDb(), pid)
    const origin = appOrigin(req)
    return NextResponse.json(
      { invites: invites.map((i) => ({ ...i, url: `${origin}/invite/${i.id}` })) },
      { headers: NO_STORE }
    )
  } catch (err) {
    return inviteErrorResponse(err)
  }
}
