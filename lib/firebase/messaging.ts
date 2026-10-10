import {
  deleteToken,
  getMessaging,
  getToken,
  isSupported,
  onMessage,
  type Messaging,
} from 'firebase/messaging'
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import app, { db } from './config'
import { apiFetch } from '@/lib/api/client'

/**
 * Web push via Firebase Cloud Messaging.
 *
 * - The service worker is app/sw.ts (built to /sw.js by @serwist/next). It
 *   gets the public Firebase config through its URL query string, see
 *   serviceWorkerUrl().
 * - Each device's token is stored at users/{uid}/fcmTokens/{token}
 *   (owner-only in firestore.rules); the server sends with the Admin SDK.
 * - "Enabled on this device" is remembered in localStorage; preferences per
 *   notification type live on users/{uid}.notificationPrefs (lib/firebase/notifications.ts).
 */

const TOKEN_KEY = 'ckd.push.token'
const SEEN_KEY = 'ckd.push.seenAt'
const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY

export type PushState =
  /** Browser can't do web push (iOS outside an installed PWA, old browsers, SW disabled in dev). */
  | 'unsupported'
  /** NEXT_PUBLIC_FIREBASE_VAPID_KEY / Firebase config missing. */
  | 'unconfigured'
  | 'denied'
  | 'default'
  | 'granted'

export interface ForegroundNotification {
  title: string
  body: string
  url: string
}

// ------------------------------------------------------------ service worker

/** The SW is off in `next dev` unless NEXT_PUBLIC_ENABLE_SW_IN_DEV=1 (mirrors next.config.js). */
export function serviceWorkerEnabled(): boolean {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return false
  return process.env.NODE_ENV === 'production' || process.env.NEXT_PUBLIC_ENABLE_SW_IN_DEV === '1'
}

/**
 * /sw.js?apiKey=…&projectId=…&messagingSenderId=…&appId=…
 * These are the same public NEXT_PUBLIC_* values every page already ships.
 */
export function serviceWorkerUrl(): string {
  const params = new URLSearchParams()
  const cfg: Record<string, string | undefined> = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  }
  for (const [k, v] of Object.entries(cfg)) if (v) params.set(k, v)
  const qs = params.toString()
  return qs ? `/sw.js?${qs}` : '/sw.js'
}

let registration: Promise<ServiceWorkerRegistration | null> | null = null

/** Register (once) the app's service worker. Resolves null when unavailable. */
export function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!serviceWorkerEnabled()) return Promise.resolve(null)
  if (!registration) {
    registration = navigator.serviceWorker
      .register(serviceWorkerUrl(), { scope: '/' })
      .then(async (reg) => {
        await cleanupLegacyWorkers()
        return reg
      })
      .catch((err) => {
        console.warn('Service worker registration failed', err)
        registration = null
        return null
      })
  }
  return registration
}

/** Older builds let the FCM SDK register /firebase-messaging-sw.js; drop it. */
async function cleanupLegacyWorkers(): Promise<void> {
  try {
    const regs = await navigator.serviceWorker.getRegistrations()
    await Promise.all(
      regs
        .filter((r) => (r.active?.scriptURL || r.installing?.scriptURL || '').includes('firebase-messaging-sw.js'))
        .map((r) => r.unregister())
    )
  } catch {
    // best effort
  }
}

// ------------------------------------------------------------------ support

let messagingPromise: Promise<Messaging | null> | null = null

function messagingInstance(): Promise<Messaging | null> {
  if (typeof window === 'undefined' || !app) return Promise.resolve(null)
  if (!messagingPromise) {
    messagingPromise = isSupported()
      .then((ok) => (ok ? getMessaging(app!) : null))
      .catch(() => null)
  }
  return messagingPromise
}

export async function getPushState(): Promise<PushState> {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return 'unsupported'
  if (!serviceWorkerEnabled()) return 'unsupported'
  if (!(await messagingInstance())) return 'unsupported'
  if (!VAPID_KEY) return 'unconfigured'
  return Notification.permission as PushState
}

function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeLocal(key: string, value: string | null): void {
  try {
    if (value == null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // storage blocked: push still works, we just won't remember the state
  }
}

/** Push was enabled on this device (and permission is still granted). */
export function isPushEnabledHere(): boolean {
  return (
    typeof Notification !== 'undefined' && Notification.permission === 'granted' && !!readLocal(TOKEN_KEY)
  )
}

// ------------------------------------------------------------------- tokens

function platformLabel(): string {
  if (typeof document !== 'undefined' && document.referrer.startsWith('android-app://')) return 'android-twa'
  if (typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches) return 'pwa'
  return 'web'
}

/** "Chrome on Android" etc. Coarse on purpose: enough to tell devices apart in a list. */
export function shortUserAgent(ua: string): string {
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /SamsungBrowser/.test(ua)
      ? 'Samsung Internet'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : 'Browser'
  const os = /Android/.test(ua)
    ? 'Android'
    : /iPhone|iPad|iPod/.test(ua)
      ? 'iOS'
      : /Windows/.test(ua)
        ? 'Windows'
        : /Mac OS X/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : 'unknown OS'
  return `${browser} on ${os}`
}

function tokenRef(uid: string, token: string) {
  if (!db) throw new Error('Firebase not initialized')
  return doc(db, 'users', uid, 'fcmTokens', token)
}

async function saveToken(uid: string, token: string): Promise<void> {
  const ref = tokenRef(uid, token)
  const existing = await getDoc(ref).catch(() => null)
  const base = {
    token,
    platform: platformLabel(),
    userAgent: shortUserAgent(navigator.userAgent),
    lastSeenAt: serverTimestamp(),
  }
  if (existing?.exists()) await updateDoc(ref, base)
  else await setDoc(ref, { ...base, createdAt: serverTimestamp() })
  writeLocal(TOKEN_KEY, token)
  writeLocal(SEEN_KEY, new Date().toISOString().slice(0, 10))
}

async function currentToken(): Promise<string> {
  const messaging = await messagingInstance()
  if (!messaging) throw new Error('Push notifications aren’t supported in this browser')
  if (!VAPID_KEY) throw new Error('Push isn’t configured (NEXT_PUBLIC_FIREBASE_VAPID_KEY)')
  const reg = await registerServiceWorker()
  if (!reg) throw new Error('The app’s service worker isn’t available')
  await navigator.serviceWorker.ready
  return getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg })
}

/** Ask for permission (must be called from a click) and register this device. */
export async function enablePush(uid: string): Promise<string> {
  if (typeof Notification === 'undefined') throw new Error('Push notifications aren’t supported in this browser')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error(
      permission === 'denied'
        ? 'Notifications are blocked. Allow them in your browser or phone settings, then try again.'
        : 'Notification permission wasn’t granted'
    )
  }
  const token = await currentToken()
  const previous = readLocal(TOKEN_KEY)
  if (previous && previous !== token) await deleteDoc(tokenRef(uid, previous)).catch(() => {})
  await saveToken(uid, token)
  return token
}

/** Unregister this device: FCM token deleted, Firestore doc removed. */
export async function disablePush(uid: string): Promise<void> {
  const token = readLocal(TOKEN_KEY)
  writeLocal(TOKEN_KEY, null)
  writeLocal(SEEN_KEY, null)
  const messaging = await messagingInstance()
  if (messaging) await deleteToken(messaging).catch(() => false)
  if (token) await deleteDoc(tokenRef(uid, token)).catch(() => {})
}

/**
 * Called on app start for a signed-in user: picks up FCM token rotation and
 * bumps lastSeenAt (at most daily) so the server can prune dead devices.
 * Silent; does nothing unless push was enabled here.
 */
export async function refreshPushToken(uid: string): Promise<void> {
  if (!isPushEnabledHere()) return
  try {
    const stored = readLocal(TOKEN_KEY)
    const token = await currentToken()
    const today = new Date().toISOString().slice(0, 10)
    if (token !== stored) {
      if (stored) await deleteDoc(tokenRef(uid, stored)).catch(() => {})
      await saveToken(uid, token)
    } else if (readLocal(SEEN_KEY) !== today) {
      await saveToken(uid, token)
    }
  } catch (err) {
    console.warn('Push token refresh failed', err)
  }
}

/** Best-effort cleanup before sign-out (needs the user still signed in for the Firestore delete). */
export async function disablePushForSignOut(uid: string, timeoutMs = 3000): Promise<void> {
  if (!readLocal(TOKEN_KEY)) return
  await Promise.race([disablePush(uid).catch(() => {}), new Promise((r) => setTimeout(r, timeoutMs))])
}

/** Messages that arrive while the app is open and focused (the SW handles the rest). */
export async function onForegroundMessage(cb: (n: ForegroundNotification) => void): Promise<() => void> {
  const messaging = await messagingInstance()
  if (!messaging) return () => {}
  return onMessage(messaging, (payload) => {
    const data = (payload.data ?? {}) as Record<string, string>
    cb({
      title: data.title || payload.notification?.title || 'CKD Tracker',
      body: data.body || payload.notification?.body || '',
      url: data.url || '/dashboard',
    })
  })
}

export async function sendTestNotification(): Promise<void> {
  const res = await apiFetch('/api/notifications/test', { method: 'POST' })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || 'Couldn’t send a test notification')
  }
}

/**
 * Tell the care circle a lab record was added (and push any new critical
 * alert now). Fire-and-forget: call after the record is saved; never throws,
 * never blocks the UI.
 */
export function notifyRecordAdded(pid: string, recordId: string): void {
  if (typeof window === 'undefined' || !pid || !recordId) return
  apiFetch('/api/notifications/record-added', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pid, recordId }),
    keepalive: true,
  }).catch(() => {
    // offline or signed out: the hourly cron still sends alerts
  })
}
