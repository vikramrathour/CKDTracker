import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/server/firebase-admin'
import { errorResponse, requireUser } from '@/lib/server/auth'
import { sendNotifications } from '@/lib/server/notifications/send'
import { testNotification } from '@/lib/server/notifications/schedule'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** POST /api/notifications/test: push a test notification to all of the caller's devices. */
export async function POST(req: Request) {
  try {
    const user = await requireUser(req)
    const summary = await sendNotifications(getAdminDb(), [testNotification(user.uid)])
    if (summary.noDevice > 0) {
      return NextResponse.json({ error: 'Push isn’t enabled on any of your devices yet' }, { status: 400 })
    }
    return NextResponse.json({ ok: true, delivered: summary.delivered, failed: summary.failed })
  } catch (err) {
    return errorResponse(err)
  }
}
