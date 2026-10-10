import 'server-only'
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app'
import { getAuth, type Auth } from 'firebase-admin/auth'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'

/**
 * Lazily initialise the Firebase Admin app.
 *
 * - With FIREBASE_SERVICE_ACCOUNT_B64 (base64 of the service-account JSON) the
 *   app has full credentials: ID-token verification AND Admin Firestore.
 *   It is REQUIRED in production: invites, chat, document extraction, export,
 *   the visit-prep PDF, notifications, cron reminders and account deletion
 *   all use Admin Firestore/Storage/Messaging.
 * - Without it, the app is initialised with just the project id. That is
 *   enough for `verifyIdToken` (it validates against Google's public certs)
 *   and for the local emulators (the *_EMULATOR_HOST env vars). Against real
 *   Firebase, Admin Firestore/Storage calls fail in this mode.
 */
function getAdminApp(): App {
  const existing = getApps()
  if (existing.length > 0) return existing[0]

  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64
  if (b64) {
    const json = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'))
    return initializeApp({ credential: cert(json) })
  }

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  if (!projectId) {
    throw new Error('Firebase Admin: set NEXT_PUBLIC_FIREBASE_PROJECT_ID or FIREBASE_SERVICE_ACCOUNT_B64')
  }
  return initializeApp({ projectId })
}

export function getAdminAuth(): Auth {
  return getAuth(getAdminApp())
}

/** Requires FIREBASE_SERVICE_ACCOUNT_B64 (or GOOGLE_APPLICATION_CREDENTIALS) to be set. */
export function getAdminDb(): Firestore {
  return getFirestore(getAdminApp())
}
