/// <reference lib="webworker" />
/**
 * The app's single service worker (built by @serwist/next into public/sw.js).
 *
 * 1. Offline: precaches the build's static assets + the offline page, caches
 *    visited pages NetworkFirst, Google Fonts CacheFirst. /api/**, Firebase
 *    auth helpers and /.well-known are never cached.
 * 2. Push: Firebase Cloud Messaging background messages. FCM needs the
 *    Firebase web config; it arrives as query parameters on the worker URL
 *    (public values, see serviceWorkerUrl() in lib/firebase/messaging.ts), so
 *    no config is baked into the build or patched onto `self`.
 *
 * One worker (scope "/") instead of a separate firebase-messaging-sw.js keeps
 * the Android TWA simple: a single registration controls the app.
 */
import { defaultCache } from '@serwist/next/worker'
import { NetworkOnly, Serwist, type PrecacheEntry, type SerwistGlobalConfig } from 'serwist'
import { initializeApp } from 'firebase/app'
import { getMessaging, onBackgroundMessage } from 'firebase/messaging/sw'

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope

const NEVER_CACHE = /^\/(?:api\/|__\/|\.well-known\/)/

/**
 * Serwist's Next.js defaults minus the rules that must not apply to a medical
 * app: the `apis` cache (would keep /api responses), the `cross-origin` cache
 * (would keep Firestore / Storage responses, i.e. lab data, in Cache Storage)
 * and the final catch-all, so cross-origin requests (Firebase) bypass the
 * worker entirely. Firestore has its own offline cache (IndexedDB).
 */
const appCache = defaultCache.filter((entry) => {
  const cacheName = (entry.handler as { cacheName?: string }).cacheName
  if (cacheName === 'apis' || cacheName === 'cross-origin') return false
  if (entry.matcher instanceof RegExp && entry.matcher.source === '.*') return false
  return true
})

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      matcher: ({ sameOrigin, url }) => sameOrigin && NEVER_CACHE.test(url.pathname),
      handler: new NetworkOnly(),
    },
    ...appCache,
  ],
  fallbacks: {
    entries: [
      {
        url: '/~offline',
        matcher: ({ request }) => request.destination === 'document',
      },
    ],
  },
})

serwist.addEventListeners()

// ------------------------------------------------------------------- push

const params = new URL(self.location.href).searchParams
const firebaseConfig = {
  apiKey: params.get('apiKey') || undefined,
  projectId: params.get('projectId') || undefined,
  messagingSenderId: params.get('messagingSenderId') || undefined,
  appId: params.get('appId') || undefined,
}

if (firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.messagingSenderId && firebaseConfig.appId) {
  try {
    const messaging = getMessaging(initializeApp(firebaseConfig))
    // Server messages are data-only (lib/server/notifications/send.ts), so the
    // SDK doesn't auto-display anything; we render here.
    onBackgroundMessage(messaging, (payload) => {
      const data = (payload.data ?? {}) as Record<string, string>
      return self.registration.showNotification(data.title || 'CKD Tracker', {
        body: data.body || 'Open CKD Tracker',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: data.tag || undefined,
        data: { url: safePath(data.url) },
      })
    })
  } catch (err) {
    console.warn('FCM init failed in service worker', err)
  }
}

/** Only same-origin paths are opened from a notification. */
function safePath(url: string | undefined): string {
  return typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') ? url : '/dashboard'
}

self.addEventListener('notificationclick', (event) => {
  const data = event.notification.data as { url?: string; FCM_MSG?: unknown } | null
  // Notifications shown by the Firebase SDK itself carry FCM_MSG; it handles those.
  if (data?.FCM_MSG) return
  event.notification.close()
  const target = new URL(safePath(data?.url), self.location.origin).href
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin) {
          await client.focus()
          if ('navigate' in client) await (client as WindowClient).navigate(target).catch(() => undefined)
          return
        }
      }
      await self.clients.openWindow(target)
    })()
  )
})
