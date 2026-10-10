import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/server/firebase-admin'
import { runReminders } from '@/lib/server/notifications/reminders'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const NO_STORE = { 'Cache-Control': 'no-store' }

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const got = Buffer.from(req.headers.get('authorization') || '')
  const want = Buffer.from(`Bearer ${secret}`)
  return got.length === want.length && timingSafeEqual(got, want)
}

/**
 * GET /api/cron/reminders[?mode=daily]
 *
 * Vercel Cron calls this with `Authorization: Bearer ${CRON_SECRET}`.
 * Hourly (Pro): visit/lab digest at 18:00 IST, medication slots, alerts.
 * `?mode=daily` (Hobby, one run a day): digest + alerts, no medication reminders.
 * The response is counts only (no patient data).
 */
export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE })
  }
  const mode = new URL(req.url).searchParams.get('mode') === 'daily' ? 'daily' : 'hourly'
  try {
    const summary = await runReminders(getAdminDb(), new Date(), mode)
    return NextResponse.json({ ok: true, ...summary }, { headers: NO_STORE })
  } catch (err) {
    console.error('reminders cron failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Reminder run failed' }, { status: 500, headers: NO_STORE })
  }
}
