/**
 * India Standard Time helpers (UTC+05:30, no DST). Server code runs in UTC on
 * Vercel, so reminder scheduling converts explicitly instead of relying on the
 * process time zone.
 */
export const IST_OFFSET_MINUTES = 330

export interface IstParts {
  /** YYYY-MM-DD in IST */
  date: string
  /** Minutes since IST midnight (0–1439) */
  minutes: number
  /** IST hour rounded to the nearest hour (0–23): a cron that fires at 17:58 or 18:04 counts as 18. */
  hour: number
}

function ymdUtc(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function istParts(now: Date): IstParts {
  const shifted = new Date(now.getTime() + IST_OFFSET_MINUTES * 60_000)
  const minutes = shifted.getUTCHours() * 60 + shifted.getUTCMinutes()
  return { date: ymdUtc(shifted), minutes, hour: Math.round(minutes / 60) % 24 }
}

/** Add whole days to a YYYY-MM-DD string. */
export function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return ymdUtc(d)
}
