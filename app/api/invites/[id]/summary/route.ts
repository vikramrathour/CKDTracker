import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/server/firebase-admin'
import { getInviteSummary } from '@/lib/server/invites'
import { NO_STORE, inviteErrorResponse } from '../../_shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/invites/{id}/summary: PUBLIC (no auth), for the /invite/{id}
 * landing page. First names, role and status only: no phone numbers, no
 * medical data. The unguessable invite id is the capability.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const summary = await getInviteSummary(getAdminDb(), id)
    return NextResponse.json(summary, { headers: NO_STORE })
  } catch (err) {
    return inviteErrorResponse(err)
  }
}
