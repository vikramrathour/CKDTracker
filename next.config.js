/** @type {import('next').NextConfig} */
const nextConfig = {
  // Lets several dev servers run side by side from one checkout (e.g. NEXT_DIST_DIR=.next-a)
  distDir: process.env.NEXT_DIST_DIR || '.next',

  // Server-only packages that must not be bundled by webpack
  serverExternalPackages: ['pdf-parse', 'firebase-admin'],

  // Proxy Firebase Auth's helper pages through our own origin. With
  // NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN set to the app's domain, signInWithRedirect
  // stays first-party, which keeps it working under browser storage
  // partitioning (Chrome, Safari) and inside a Trusted Web Activity.
  // https://firebase.google.com/docs/auth/web/redirect-best-practices (option 3)
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

module.exports = nextConfig
