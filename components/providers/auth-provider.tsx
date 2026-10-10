'use client'

import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react'
import type { User } from 'firebase/auth'
import {
  onAuthStateChanged,
  signInWithGoogle,
  signOut,
  ensureUserProfile,
  completeRedirectSignIn,
  reloadUser,
  friendlyAuthError,
} from '@/lib/firebase/auth'

interface AuthContext {
  user: User | null
  loading: boolean
  /** Google sign-in (popup, falling back to redirect). Phone OTP is driven by the login page. */
  signIn: () => Promise<void>
  logOut: () => Promise<void>
  /** Re-read the user after link/unlink so provider lists re-render. */
  refreshUser: () => Promise<void>
  /** Friendly message from a failed signInWithRedirect/linkWithRedirect, if any. */
  redirectError: string | null
  clearRedirectError: () => void
}

const AuthContext = createContext<AuthContext>({
  user: null,
  loading: true,
  signIn: async () => {},
  logOut: async () => {},
  refreshUser: async () => {},
  redirectError: null,
  clearRedirectError: () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  // Firebase mutates the same User object on link/unlink; bump this to re-render consumers.
  const [version, setVersion] = useState(0)
  const [redirectError, setRedirectError] = useState<string | null>(null)
  const uidRef = useRef<string | null>(null)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged((u) => {
      uidRef.current = u?.uid ?? null
      if (u) {
        ensureUserProfile(u).catch((err) => {
          // A sign-out racing the profile read gets permission-denied; only report
          // failures for the user who is still signed in.
          if (uidRef.current === u.uid) console.error('Failed to create user profile:', err)
        })
      }
      setUser(u)
      setVersion((v) => v + 1)
      setLoading(false)
    })
    return unsubscribe
  }, [])

  // Pick up the result of a Google redirect (popup-blocked / TWA fallback).
  useEffect(() => {
    completeRedirectSignIn()
      .then((u) => {
        if (u) setVersion((v) => v + 1)
      })
      .catch((err) => setRedirectError(friendlyAuthError(err, 'google')))
  }, [])

  const signIn = useCallback(async () => {
    await signInWithGoogle()
  }, [])

  const logOut = useCallback(async () => {
    await signOut()
  }, [])

  const refreshUser = useCallback(async () => {
    const u = await reloadUser()
    setUser(u)
    setVersion((v) => v + 1)
  }, [])

  const clearRedirectError = useCallback(() => setRedirectError(null), [])

  const value = useMemo(
    () => ({ user, loading, signIn, logOut, refreshUser, redirectError, clearRedirectError }),
    // `version` is intentionally a dependency: it forces a new context value
    // when the (mutable) User object changes in place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, loading, signIn, logOut, refreshUser, redirectError, clearRedirectError, version]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
