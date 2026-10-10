'use client'

import { useEffect, useState } from 'react'
import { CloudOff } from 'lucide-react'
import { cn } from '@/lib/utils'

/** navigator.onLine with online/offline events (true during SSR). */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true)
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    update()
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])
  return online
}

/**
 * Slim banner shown while the device is offline. Firestore keeps serving
 * cached data and queues writes, so the message is reassurance, not an error.
 * Renders nothing when online. Mount once, e.g. at the top of AppShell.
 */
export function OfflineIndicator({ className }: { className?: string }) {
  const online = useOnline()
  if (online) return null
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex items-center justify-center gap-2 border-b border-hair bg-recess px-4 py-2 text-[13px] font-medium text-ink-2',
        className
      )}
    >
      <CloudOff className="h-4 w-4 shrink-0 text-terra-dk" aria-hidden />
      <span>Offline: showing saved data. Changes sync when you reconnect.</span>
    </div>
  )
}
