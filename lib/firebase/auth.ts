import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged as firebaseOnAuthStateChanged,
  type User,
} from 'firebase/auth'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db } from './config'

const googleProvider = new GoogleAuthProvider()

export async function signInWithGoogle(): Promise<User> {
  if (!auth || !db) throw new Error('Firebase not initialized')
  const result = await signInWithPopup(auth, googleProvider)
  const user = result.user
  await ensureUserProfile(user)
  return user
}

/**
 * Create the users/{uid} profile doc if it doesn't exist yet. Idempotent;
 * called on every auth state change so all sign-in paths get a profile.
 */
export async function ensureUserProfile(user: User): Promise<void> {
  if (!db) return
  const profileRef = doc(db, 'users', user.uid)
  const profileSnap = await getDoc(profileRef)
  if (profileSnap.exists()) return

  await setDoc(profileRef, {
    fullName: user.displayName || '',
    email: user.email || '',
    dateOfBirth: null,
    bloodGroup: '',
    transplantDate: null,
    doctorName: '',
    doctorHospital: '',
    nextLabDate: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

export async function signOut(): Promise<void> {
  if (!auth) throw new Error('Firebase not initialized')
  await firebaseSignOut(auth)
}

export function onAuthStateChanged(callback: (user: User | null) => void) {
  if (!auth) {
    // During SSR/build, just call with null immediately
    callback(null)
    return () => {}
  }
  return firebaseOnAuthStateChanged(auth, callback)
}
