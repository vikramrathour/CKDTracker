import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

function getApp(): FirebaseApp | undefined {
  if (!firebaseConfig.apiKey) {
    console.log('[Firebase] No API key found, skipping init')
    return undefined
  }
  if (getApps().length > 0) return getApps()[0]
  console.log('[Firebase] Initializing app with project:', firebaseConfig.projectId)
  return initializeApp(firebaseConfig)
}

const app = getApp()

export const auth: Auth | undefined = app ? getAuth(app) : undefined
export const db: Firestore | undefined = app ? getFirestore(app) : undefined

console.log('[Firebase] App initialized:', !!app, 'Auth:', !!auth, 'DB:', !!db)

// Storage is lazy-loaded via dynamic import
export async function getStorageInstance() {
  if (!app) throw new Error('Firebase not initialized')
  const { getStorage } = await import('firebase/storage')
  return getStorage(app)
}

export default app
