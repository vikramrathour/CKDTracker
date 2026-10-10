'use client'

import { useEffect } from 'react'
import { useAuth } from '@/components/providers/auth-provider'
import { useToast } from '@/components/providers/toast-provider'
import { onForegroundMessage, refreshPushToken, registerServiceWorker } from '@/lib/firebase/messaging'

/**
 * App-wide, renders nothing:
 *  - registers the service worker (offline cache + push),
 *  - refreshes this device's push token for the signed-in user,
 *  - shows pushes that arrive while the app is in the foreground as toasts.
 * Mounted once in app/layout.tsx inside AuthProvider + ToastProvider.
 */
export function PwaBridge() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const uid = user?.uid ?? null

  useEffect(() => {
    void registerServiceWorker()
  }, [])

  useEffect(() => {
    if (!uid) return
    void refreshPushToken(uid)
  }, [uid])

  useEffect(() => {
    if (!uid) return
    let unsubscribe: () => void = () => {}
    let cancelled = false
    onForegroundMessage((n) => showToast('info', n.body ? `${n.title}: ${n.body}` : n.title)).then((u) => {
      if (cancelled) u()
      else unsubscribe = u
    })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [uid, showToast])

  return null
}
