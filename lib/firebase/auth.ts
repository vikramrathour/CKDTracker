import {
  GoogleAuthProvider,
  PhoneAuthProvider,
  RecaptchaVerifier,
  getRedirectResult,
  linkWithCredential,
  linkWithPopup,
  linkWithRedirect,
  reload,
  signInWithPhoneNumber,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
  onAuthStateChanged as firebaseOnAuthStateChanged,
  unlink,
  type ConfirmationResult,
  type User,
} from 'firebase/auth'
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db } from './config'

/** Provider IDs as they appear in `user.providerData[].providerId`. */
export const PROVIDER_PHONE = PhoneAuthProvider.PROVIDER_ID // 'phone'
export const PROVIDER_GOOGLE = GoogleAuthProvider.PROVIDER_ID // 'google.com'

const googleProvider = new GoogleAuthProvider()
googleProvider.setCustomParameters({ prompt: 'select_account' })

function requireAuth() {
  if (!auth) throw new Error('Firebase not initialized')
  return auth
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** What the user was doing when an error happened; tunes a few messages. */
export type AuthAction = 'phone' | 'google' | 'link-phone' | 'link-google' | 'unlink'

/** Thrown by our own guards (e.g. refusing to unlink the last provider). */
export class AuthFlowError extends Error {
  constructor(public code: string, message: string) {
    super(message)
    this.name = 'AuthFlowError'
  }
}

function errorCode(err: unknown): string | undefined {
  if (err && typeof err === 'object' && 'code' in err && typeof (err as { code: unknown }).code === 'string') {
    return (err as { code: string }).code
  }
  return undefined
}

/** True for errors the user caused by dismissing a popup; callers usually stay silent. */
export function isUserCancelled(err: unknown): boolean {
  const code = errorCode(err)
  return code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request' || code === 'auth/user-cancelled'
}

/** Map Firebase Auth error codes to short, human messages. Never leaks raw codes to the UI. */
export function friendlyAuthError(err: unknown, action?: AuthAction): string {
  if (err instanceof AuthFlowError) return err.message
  const code = errorCode(err)
  switch (code) {
    case 'auth/invalid-phone-number':
    case 'auth/missing-phone-number':
      return 'That doesn’t look like a valid Indian mobile number.'
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a few minutes and try again.'
    case 'auth/invalid-verification-code':
    case 'auth/missing-verification-code':
      return 'That code is incorrect. Check the SMS and try again.'
    case 'auth/code-expired':
    case 'auth/session-expired':
      return 'That code has expired. Tap “Resend code” to get a new one.'
    case 'auth/credential-already-in-use':
    case 'auth/account-exists-with-different-credential':
    case 'auth/email-already-in-use':
      return action === 'link-google' || action === 'google'
        ? 'This Google account already belongs to a separate account. Sign out and sign in with it instead.'
        : 'This number already belongs to a separate account. Sign out and sign in with it instead.'
    case 'auth/provider-already-linked':
      return 'That sign-in method is already linked to your account.'
    case 'auth/quota-exceeded':
      return 'SMS sign-in is temporarily unavailable. Please use Google or try again later.'
    case 'auth/captcha-check-failed':
    case 'auth/invalid-app-credential':
    case 'auth/missing-app-credential':
      return 'We couldn’t verify this device. Refresh the page and try again.'
    case 'auth/network-request-failed':
      return 'No connection. Check your internet and try again.'
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
    case 'auth/user-cancelled':
      return 'Sign-in was cancelled.'
    case 'auth/requires-recent-login':
      return 'For your security, please sign out and sign in again, then retry.'
    case 'auth/no-such-provider':
      return 'That sign-in method isn’t linked to your account.'
    case 'auth/user-disabled':
      return 'This account has been disabled.'
    case 'auth/operation-not-allowed':
    case 'auth/billing-not-enabled':
      return action === 'google' || action === 'link-google'
        ? 'Google sign-in isn’t enabled for this app yet.'
        : 'Phone sign-in isn’t enabled for this app yet. Please use Google for now.'
    case 'auth/unauthorized-domain':
      return 'Sign-in isn’t allowed from this web address.'
    default:
      return 'Something went wrong. Please try again.'
  }
}

// ---------------------------------------------------------------------------
// reCAPTCHA (one verifier at a time; the container div is mounted once by the page)
// ---------------------------------------------------------------------------

let activeVerifier: RecaptchaVerifier | null = null

/**
 * Tear down the current invisible reCAPTCHA. Call on retry/resend (a used or
 * failed verifier can't be reused) and when the page that owns the container unmounts.
 */
export function clearRecaptcha(): void {
  try {
    activeVerifier?.clear()
  } catch {
    // clear() throws if already destroyed; nothing to do.
  }
  activeVerifier = null
}

function freshVerifier(containerId: string): RecaptchaVerifier {
  clearRecaptcha()
  // With the Auth emulator connected, the SDK swaps in a mock reCAPTCHA automatically.
  activeVerifier = new RecaptchaVerifier(requireAuth(), containerId, { size: 'invisible' })
  return activeVerifier
}

// ---------------------------------------------------------------------------
// Sign-in
// ---------------------------------------------------------------------------

/**
 * Send a one-time code to `phoneE164` (already normalized, e.g. via
 * normalizeIndianPhone). Resolve the returned confirmation with verifyOtp().
 */
export async function sendOtp(phoneE164: string, recaptchaContainerId: string): Promise<ConfirmationResult> {
  const a = requireAuth()
  const verifier = freshVerifier(recaptchaContainerId)
  try {
    return await signInWithPhoneNumber(a, phoneE164, verifier)
  } catch (err) {
    clearRecaptcha()
    throw err
  }
}

/** Confirm the SMS code. onAuthStateChanged then fires and ensures the profile. */
export async function verifyOtp(confirmation: ConfirmationResult, code: string): Promise<User> {
  const result = await confirmation.confirm(code.trim())
  clearRecaptcha()
  return result.user
}

function shouldFallBackToRedirect(err: unknown): boolean {
  const code = errorCode(err)
  return code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment'
}

/**
 * Google sign-in with a popup. Falls back to a full-page redirect where popups
 * are blocked or unsupported (e.g. inside a TWA); in that case this resolves
 * to null and the result is picked up by completeRedirectSignIn() on return.
 */
export async function signInWithGoogle(): Promise<User | null> {
  const a = requireAuth()
  try {
    const result = await signInWithPopup(a, googleProvider)
    return result.user
  } catch (err) {
    if (!shouldFallBackToRedirect(err)) throw err
    await signInWithRedirect(a, googleProvider)
    return null
  }
}

/**
 * Resolve a pending signInWithRedirect / linkWithRedirect. Call once on app
 * load. Returns the user, null when there was no redirect, and throws on a
 * failed redirect (map with friendlyAuthError).
 */
export async function completeRedirectSignIn(): Promise<User | null> {
  if (!auth) return null
  const result = await getRedirectResult(auth)
  if (result?.user) syncProfileInBackground(result.user)
  return result?.user ?? null
}

// ---------------------------------------------------------------------------
// Linking
// ---------------------------------------------------------------------------

function requireUser(): User {
  const user = requireAuth().currentUser
  if (!user) throw new AuthFlowError('ckd/not-signed-in', 'Please sign in first.')
  return user
}

/** Add Google to the signed-in account. Resolves null if it fell back to a redirect. */
export async function linkGoogle(): Promise<User | null> {
  const user = requireUser()
  try {
    const result = await linkWithPopup(user, googleProvider)
    syncProfileInBackground(result.user)
    return result.user
  } catch (err) {
    if (!shouldFallBackToRedirect(err)) throw err
    await linkWithRedirect(user, googleProvider)
    return null
  }
}

/** Step 1 of linking a phone: send the code; returns the verificationId. */
export async function startLinkPhone(phoneE164: string, recaptchaContainerId: string): Promise<string> {
  const a = requireAuth()
  requireUser()
  const verifier = freshVerifier(recaptchaContainerId)
  try {
    return await new PhoneAuthProvider(a).verifyPhoneNumber(phoneE164, verifier)
  } catch (err) {
    clearRecaptcha()
    throw err
  }
}

/**
 * Step 2 of linking a phone. On auth/credential-already-in-use the number is
 * a separate account; we surface that and never auto-merge.
 */
export async function confirmLinkPhone(verificationId: string, code: string): Promise<User> {
  const user = requireUser()
  const credential = PhoneAuthProvider.credential(verificationId, code.trim())
  const result = await linkWithCredential(user, credential)
  clearRecaptcha()
  syncProfileInBackground(result.user)
  return result.user
}

/** Remove a sign-in method. Refuses to remove the last one (the account would be unreachable). */
export async function unlinkProvider(providerId: string): Promise<User> {
  const user = requireUser()
  const linked = user.providerData.map((p) => p.providerId)
  if (!linked.includes(providerId)) {
    throw new AuthFlowError('auth/no-such-provider', 'That sign-in method isn’t linked to your account.')
  }
  if (linked.length <= 1) {
    throw new AuthFlowError(
      'ckd/last-provider',
      'You can’t remove your only sign-in method. Link another one first.'
    )
  }
  const updated = await unlink(user, providerId)
  syncProfileInBackground(updated)
  return updated
}

/** Re-fetch the user from Firebase (provider list, phone, email). */
export async function reloadUser(): Promise<User | null> {
  const user = auth?.currentUser
  if (!user) return null
  await reload(user)
  return auth?.currentUser ?? null
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

/**
 * Create the users/{uid} profile doc if it doesn't exist yet, and keep its
 * contact fields (email, phoneNumber) in sync with the auth account. Called
 * from onAuthStateChanged so every sign-in path (Google popup, redirect,
 * phone OTP) gets a profile.
 */
export async function ensureUserProfile(user: User): Promise<void> {
  if (!db) return
  const profileRef = doc(db, 'users', user.uid)
  const profileSnap = await getDoc(profileRef)
  if (profileSnap.exists()) {
    await syncProfileContact(user, profileSnap.data())
    return
  }

  await setDoc(profileRef, {
    fullName: user.displayName || '',
    email: user.email || '',
    phoneNumber: user.phoneNumber || '',
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

/**
 * Profile sync must never block an auth flow: Firestore writes only resolve on
 * server ack, so an offline/slow connection would leave the UI spinning after
 * Firebase Auth already succeeded. ensureUserProfile re-syncs on next sign-in.
 */
function syncProfileInBackground(user: User): void {
  syncProfileContact(user).catch((err) => console.warn('Profile contact sync failed:', err))
}

/**
 * Mirror auth email/phone onto users/{uid}. Only writes when something changed,
 * and never blanks out an email (a phone-only account linking Google adds one;
 * unlinking Google leaves the last known email in place for display).
 */
async function syncProfileContact(user: User, existing?: Record<string, unknown>): Promise<void> {
  if (!db) return
  const profileRef = doc(db, 'users', user.uid)
  const data = existing ?? (await getDoc(profileRef)).data()
  if (!data) return
  const patch: Record<string, unknown> = {}
  const phone = user.phoneNumber || ''
  if ((data.phoneNumber ?? '') !== phone) patch.phoneNumber = phone
  if (user.email && data.email !== user.email) patch.email = user.email
  if (!data.fullName && user.displayName) patch.fullName = user.displayName
  if (Object.keys(patch).length === 0) return
  patch.updatedAt = serverTimestamp()
  await updateDoc(profileRef, patch)
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

export async function signOut(): Promise<void> {
  clearRecaptcha()
  await firebaseSignOut(requireAuth())
}

export function onAuthStateChanged(callback: (user: User | null) => void) {
  if (!auth) {
    // During SSR/build, just call with null immediately
    callback(null)
    return () => {}
  }
  return firebaseOnAuthStateChanged(auth, callback)
}

export type { ConfirmationResult, User }
