/**
 * Notification preferences, stored on the profile doc as
 * `users/{uid}.notificationPrefs` (owner-only per firestore.rules). Pure:
 * shared by the Settings UI and the server-side scheduler.
 *
 * Times are India Standard Time (the app's only market today); see ist.ts.
 */

export type NotificationType =
  | 'labReminders'
  | 'visitReminders'
  | 'medicationReminders'
  | 'alerts'
  | 'careCircleUpdates'

/** HH:mm, IST. A window may wrap midnight (22:00 → 07:00). */
export interface QuietHours {
  start: string
  end: string
}

export interface NotificationPrefs {
  labReminders: boolean
  visitReminders: boolean
  medicationReminders: boolean
  alerts: boolean
  careCircleUpdates: boolean
  quietHours?: QuietHours | null
}

/**
 * Defaults for users who never opened the Notifications settings. Medication
 * reminders are opt-in: every care-circle member would otherwise get them.
 * Nothing is delivered until push is enabled on a device anyway.
 */
export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  labReminders: true,
  visitReminders: true,
  medicationReminders: false,
  alerts: true,
  careCircleUpdates: true,
  quietHours: null,
}

export const NOTIFICATION_TYPES: { key: NotificationType; label: string; description: string }[] = [
  { key: 'alerts', label: 'Lab alerts', description: 'A new report has a critical flag' },
  { key: 'visitReminders', label: 'Visit reminders', description: 'The evening before a doctor visit, with open questions' },
  { key: 'labReminders', label: 'Lab test reminders', description: 'The evening before the next lab test is due' },
  { key: 'medicationReminders', label: 'Medication reminders', description: '08:00, 14:00, 19:00 and 22:00 IST, per medicine schedule' },
  { key: 'careCircleUpdates', label: 'Care-circle updates', description: 'Someone in the care circle adds a report' },
]

const HM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

/** Minutes since midnight for "HH:mm", or null when malformed. */
export function parseHm(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const m = value.match(HM_RE)
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

function normalizeQuietHours(raw: unknown): QuietHours | null {
  if (!raw || typeof raw !== 'object') return null
  const { start, end } = raw as Record<string, unknown>
  const s = parseHm(start)
  const e = parseHm(end)
  if (s == null || e == null || s === e) return null
  return { start: start as string, end: end as string }
}

/** Fill missing/invalid fields from the defaults. Accepts anything (Firestore data). */
export function normalizePrefs(raw: unknown): NotificationPrefs {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const out: NotificationPrefs = { ...DEFAULT_NOTIFICATION_PREFS }
  for (const { key } of NOTIFICATION_TYPES) {
    if (typeof src[key] === 'boolean') out[key] = src[key] as boolean
  }
  out.quietHours = normalizeQuietHours(src.quietHours)
  return out
}

/** True when `minutesOfDay` (IST) falls inside the quiet window (start inclusive, end exclusive). */
export function isQuietTime(minutesOfDay: number, quiet: QuietHours | null | undefined): boolean {
  if (!quiet) return false
  const s = parseHm(quiet.start)
  const e = parseHm(quiet.end)
  if (s == null || e == null || s === e) return false
  return s < e ? minutesOfDay >= s && minutesOfDay < e : minutesOfDay >= s || minutesOfDay < e
}

/** Whether a user wants this type right now (pref on and outside quiet hours). */
export function wants(prefs: NotificationPrefs, type: NotificationType, minutesOfDay: number): boolean {
  return prefs[type] === true && !isQuietTime(minutesOfDay, prefs.quietHours)
}
