import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import { getAuth, connectAuthEmulator, type Auth } from 'firebase/auth'
import {
  clearIndexedDbPersistence,
  connectFirestoreEmulator,
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
  terminate,
  type Firestore,
} from 'firebase/firestore'
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check'

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

function getApp(): FirebaseApp | undefined {
  if (!firebaseConfig.apiKey) return undefined
  if (getApps().length > 0) return getApps()[0]
  return initializeApp(firebaseConfig)
}

const app = getApp()

// Local development against `npx firebase-tools emulators:start` (ports in firebase.json).
export const USE_EMULATORS = process.env.NEXT_PUBLIC_USE_EMULATORS === '1'

export const auth: Auth | undefined = app ? getAuth(app) : undefined

/**
 * Firestore with an offline cache in IndexedDB (shared across tabs), so
 * records stay readable at the clinic without signal and writes queue until
 * the connection is back. Falls back to the in-memory cache where IndexedDB
 * isn't available (SSR, some private modes); the SDK itself also falls back
 * if opening IndexedDB fails at runtime.
 */
function createDb(a: FirebaseApp): Firestore {
  const canPersist = typeof window !== 'undefined' && typeof indexedDB !== 'undefined'
  try {
    return initializeFirestore(a, {
      localCache: canPersist
        ? persistentLocalCache({ tabManager: persistentMultipleTabManager() })
        : memoryLocalCache(),
    })
  } catch {
    // Already initialised (hot reload): reuse the existing instance.
    return getFirestore(a)
  }
}

export const db: Firestore | undefined = app ? createDb(app) : undefined

/**
 * Wipe the offline cache (call after sign-out on shared devices). Terminates
 * the Firestore instance, so the page must reload afterwards.
 */
export async function clearOfflineData(): Promise<void> {
  if (!db) return
  try {
    await terminate(db)
    await clearIndexedDbPersistence(db)
  } catch (err) {
    console.warn('Could not clear the offline cache', err)
  }
}

/**
 * Optional App Check (reCAPTCHA Enterprise; the Android TWA runs this same web
 * code in Chrome). Only initialised when NEXT_PUBLIC_APPCHECK_SITE_KEY is set;
 * enforcement is switched on separately in the Firebase console (README).
 * Set NEXT_PUBLIC_APPCHECK_DEBUG=1 locally to print a debug token to register.
 */
const appCheckKey = process.env.NEXT_PUBLIC_APPCHECK_SITE_KEY
if (app && appCheckKey && typeof window !== 'undefined' && !USE_EMULATORS) {
  const g = globalThis as { __ckdAppCheck?: boolean; FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean }
  if (!g.__ckdAppCheck) {
    g.__ckdAppCheck = true
    if (process.env.NEXT_PUBLIC_APPCHECK_DEBUG === '1') g.FIREBASE_APPCHECK_DEBUG_TOKEN = true
    try {
      initializeAppCheck(app, {
        provider: new ReCaptchaEnterpriseProvider(appCheckKey),
        isTokenAutoRefreshEnabled: true,
      })
    } catch (err) {
      console.warn('App Check init failed', err)
    }
  }
}

if (USE_EMULATORS && auth && db && !(globalThis as { __ckdEmulators?: boolean }).__ckdEmulators) {
  ;(globalThis as { __ckdEmulators?: boolean }).__ckdEmulators = true
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
}

// Storage is lazy-loaded via dynamic import
export async function getStorageInstance() {
  if (!app) throw new Error('Firebase not initialized')
  const { getStorage, connectStorageEmulator } = await import('firebase/storage')
  const storage = getStorage(app)
  const g = globalThis as { __ckdStorageEmulator?: boolean }
  if (USE_EMULATORS && !g.__ckdStorageEmulator) {
    g.__ckdStorageEmulator = true
    connectStorageEmulator(storage, '127.0.0.1', 9199)
  }
  return storage
}

export default app
