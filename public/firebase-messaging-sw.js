// Retired. Push now runs in the app's single service worker (app/sw.ts → /sw.js).
// Browsers that registered this worker under an older build pick up this
// version and unregister it; lib/firebase/messaging.ts also removes it.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => {
  event.waitUntil(self.registration.unregister())
})
