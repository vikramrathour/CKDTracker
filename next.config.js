const { randomUUID } = require('node:crypto')

// Service worker (app/sw.ts → public/sw.js): offline app shell + FCM push.
// Off in `next dev` (stale caches get in the way) unless NEXT_PUBLIC_ENABLE_SW_IN_DEV=1;
// lib/firebase/messaging.ts uses the same switch before registering it.
// Revision for precached HTML pages: changes on every deploy.
const swRevision = process.env.VERCEL_GIT_COMMIT_SHA || randomUUID()
const withSerwist = require('@serwist/next').default({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  // Registered by components/notifications/pwa-bridge.tsx with the Firebase
  // config in the query string, so automatic registration is off.
  register: false,
  reloadOnOnline: false,
  cacheOnNavigation: false,
  disable: process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_ENABLE_SW_IN_DEV !== '1',
  additionalPrecacheEntries: [
    { url: '/~offline', revision: swRevision },
    { url: '/icons/icon-192.png', revision: swRevision },
    { url: '/icons/icon-512.png', revision: swRevision },
    { url: '/icons/logo-mark.png', revision: swRevision },
    { url: '/icons/logo-mark-light.png', revision: swRevision },
  ],
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Lets several dev servers run side by side from one checkout (e.g. NEXT_DIST_DIR=.next-a)
  distDir: process.env.NEXT_DIST_DIR || '.next',

  // Server-only packages that must not be bundled by webpack
  serverExternalPackages: ['pdf-parse', 'firebase-admin', '@react-pdf/renderer'],

  // pdfkit (via @react-pdf) loads its fonts through `#standard-fonts/*` subpath
  // imports, which file tracing misses; without them the deployed server
  // function crashes (Netlify: "Cannot find module …/standard-fonts/Helvetica.cjs").
  outputFileTracingIncludes: {
    '/**': ['./node_modules/pdfkit/js/**/*'],
  },

  // Proxy Firebase Auth's helper pages through our own origin. With
  // NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN set to the app's domain, signInWithRedirect
  // stays first-party, which keeps it working under browser storage
  // partitioning (Chrome, Safari) and inside a Trusted Web Activity.
  // https://firebase.google.com/docs/auth/web/redirect-best-practices (option 3)
  async headers() {
    return [
      {
        // Browsers re-check the worker on navigation; never let a CDN pin an old one.
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ]
  },

  async rewrites() {
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
    if (!projectId) return []
    const origin = `https://${projectId}.firebaseapp.com`
    return [
      { source: '/__/auth/:path*', destination: `${origin}/__/auth/:path*` },
      { source: '/__/firebase/:path*', destination: `${origin}/__/firebase/:path*` },
    ]
  },
}

module.exports = withSerwist(nextConfig)
