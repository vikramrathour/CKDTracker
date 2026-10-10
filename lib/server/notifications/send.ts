import 'server-only'
import type { Firestore } from 'firebase-admin/firestore'
import { getMessaging } from 'firebase-admin/messaging'
import { getAdminAuth } from '@/lib/server/firebase-admin'
import { normalizePrefs, type NotificationPrefs } from '@/lib/notifications/prefs'
import type { PlannedNotification } from './schedule'

/**
 * Admin-side FCM delivery. Tokens live at users/{uid}/fcmTokens/{token}
 * (written by the browser, see lib/firebase/messaging.ts).
 *
 * Messages are data-only: the service worker (app/sw.ts) renders them, so the
 * same code path handles background display and click-through, and nothing is
 * shown twice. Never log titles/bodies.
 */

/** Tokens not seen for this long are treated as dead and removed. */
export const TOKEN_STALE_DAYS = 60

/** FCM errors that mean "this token will never work again". */
const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
])

export function isDeadTokenError(code: string | undefined): boolean {
  return !!code && DEAD_TOKEN_CODES.has(code)
}

function toMillis(v: unknown): number | null {
  if (!v) return null
  if (typeof v === 'string') {
    const t = Date.parse(v)
    return Number.isFinite(t) ? t : null
  }
  if (typeof v === 'object' && typeof (v as { toMillis?: unknown }).toMillis === 'function') {
    return (v as { toMillis: () => number }).toMillis()
  }
  return null
}

export interface SendSummary {
  notifications: number
  delivered: number
  failed: number
  pruned: number
  /** Users with no registered device. */
  noDevice: number
}

/** Loads (and caches) a user's live tokens, pruning stale ones. */
export class TokenStore {
  private cache = new Map<string, string[]>()
  pruned = 0

  constructor(private db: Firestore, private now: Date = new Date()) {}

  async tokens(uid: string): Promise<string[]> {
    const hit = this.cache.get(uid)
    if (hit) return hit
    const snap = await this.db.collection(`users/${uid}/fcmTokens`).get()
    const live: string[] = []
    const cutoff = this.now.getTime() - TOKEN_STALE_DAYS * 86_400_000
    for (const d of snap.docs) {
      const seen = toMillis(d.get('lastSeenAt')) ?? toMillis(d.get('createdAt'))
      if (seen != null && seen < cutoff) {
        await d.ref.delete().catch(() => {})
        this.pruned += 1
      } else {
        live.push(d.id)
      }
    }
    this.cache.set(uid, live)
    return live
  }

  async remove(uid: string, token: string): Promise<void> {
    await this.db.doc(`users/${uid}/fcmTokens/${token}`).delete().catch(() => {})
    this.cache.set(uid, (this.cache.get(uid) ?? []).filter((t) => t !== token))
    this.pruned += 1
  }
}

/** Loads (and caches) users/{uid}.notificationPrefs. */
export class PrefsStore {
  private cache = new Map<string, NotificationPrefs>()

  constructor(private db: Firestore) {}

  async get(uid: string): Promise<NotificationPrefs> {
    const hit = this.cache.get(uid)
    if (hit) return hit
    const snap = await this.db.doc(`users/${uid}`).get()
    const prefs = normalizePrefs(snap.exists ? snap.get('notificationPrefs') : null)
    this.cache.set(uid, prefs)
    return prefs
  }
}

export async function sendNotifications(
  db: Firestore,
  notifications: PlannedNotification[],
  tokens: TokenStore = new TokenStore(db)
): Promise<SendSummary> {
  const summary: SendSummary = { notifications: notifications.length, delivered: 0, failed: 0, pruned: 0, noDevice: 0 }
  if (notifications.length === 0) return summary
  const messaging = getMessaging(getAdminAuth().app)
  const prunedBefore = tokens.pruned

  for (const n of notifications) {
    const list = await tokens.tokens(n.uid)
    if (list.length === 0) {
      summary.noDevice += 1
      continue
    }
    const res = await messaging.sendEachForMulticast({
      tokens: list,
      data: {
        title: n.title,
        body: n.body,
        url: n.url,
        tag: n.tag,
        kind: n.kind,
      },
      webpush: {
        headers: { Urgency: n.kind === 'alert' ? 'high' : 'normal', TTL: String(n.kind === 'medication' ? 3 * 3600 : 24 * 3600) },
      },
    })
    summary.delivered += res.successCount
    summary.failed += res.failureCount
    for (let i = 0; i < res.responses.length; i++) {
      const r = res.responses[i]
      if (!r.success && isDeadTokenError(r.error?.code)) await tokens.remove(n.uid, list[i])
    }
  }
  summary.pruned = tokens.pruned - prunedBefore
  return summary
}
