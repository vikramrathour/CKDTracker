import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import { getAuth, connectAuthEmulator, type Auth } from 'firebase/auth'
import { getFirestore, connectFirestoreEmulator, type Firestore } from 'firebase/firestore'

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
export const db: Firestore | undefined = app ? getFirestore(app) : undefined

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
