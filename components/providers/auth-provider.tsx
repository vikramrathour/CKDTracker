'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import type { User } from 'firebase/auth'
import { onAuthStateChanged, signInWithGoogle, signOut } from '@/lib/firebase/auth'

interface AuthContext {
  user: User | null
  loading: boolean
  signIn: () => Promise<void>
  logOut: () => Promise<void>
}

const AuthContext = createContext<AuthContext>({
  user: null,
  loading: true,
  signIn: async () => {},
  logOut: async () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    console.log('[AuthProvider] Setting up onAuthStateChanged listener')
    const unsubscribe = onAuthStateChanged((u) => {
      console.log('[AuthProvider] Auth state changed:', u ? u.email : 'null')
      setUser(u)
      setLoading(false)
    })
    return unsubscribe
  }, [])

  const signIn = useCallback(async () => {
    await signInWithGoogle()
  }, [])

  const logOut = useCallback(async () => {
    await signOut()
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, signIn, logOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
