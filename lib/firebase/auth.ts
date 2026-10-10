import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged as firebaseOnAuthStateChanged,
  type User,
} from 'firebase/auth'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db } from './config'
import { DOCTOR_NAME, DOCTOR_HOSPITAL } from '@/lib/constants/medications'

const googleProvider = new GoogleAuthProvider()

export async function signInWithGoogle(): Promise<User> {
  if (!auth || !db) throw new Error('Firebase not initialized')
  const result = await signInWithPopup(auth, googleProvider)
  const user = result.user

  // Create profile document if it doesn't exist
  const profileRef = doc(db, 'users', user.uid)
  const profileSnap = await getDoc(profileRef)

  if (!profileSnap.exists()) {
    await setDoc(profileRef, {
      fullName: user.displayName || '',
      email: user.email || '',
      dateOfBirth: null,
      bloodGroup: '',
      transplantDate: null,
      doctorName: DOCTOR_NAME,
      doctorHospital: DOCTOR_HOSPITAL,
      nextLabDate: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  }

  return user
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
