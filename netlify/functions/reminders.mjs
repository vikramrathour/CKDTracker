/**
 * Netlify Scheduled Function: the Netlify equivalent of the Vercel cron in
 * vercel.json. Every hour at :30 UTC (:00 IST) it calls
 * GET /api/cron/reminders with `Authorization: Bearer ${CRON_SECRET}`; the
 * route does the work (and its own 60 s limit applies, not this function's 30 s).
 * Scheduled functions only run on published production deploys.
 */
export default async () => {
  const base = process.env.URL
  const secret = process.env.CRON_SECRET
  if (!base || !secret) {
    console.error('reminders: URL or CRON_SECRET not set')
    return
  }
  try {
    const res = await fetch(`${base}/api/cron/reminders`, {
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(25_000),
    })
    // Counts only; the route never returns patient data.
    console.log('reminders:', res.status, (await res.text()).slice(0, 300))
  } catch (err) {
    console.error('reminders: call failed:', err instanceof Error ? err.message : 'unknown error')
  }
}

export const config = {
  schedule: '30 * * * *',
}
