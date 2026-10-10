'use client'

import { useAuth } from '@/components/providers/auth-provider'
import { BottomNav } from './bottom-nav'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { Loader2 } from 'lucide-react'

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login')
    }
  }, [user, loading, router])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <Loader2 className="h-7 w-7 animate-spin text-terra" aria-label="Loading" />
      </div>
    )
  }

  if (!user) return null

  return (
    <div className="relative mx-auto min-h-screen max-w-lg bg-canvas">
      {children}
      <BottomNav />
      {/* Spacer for bottom nav + home indicator */}
      <div className="h-[calc(5.5rem+env(safe-area-inset-bottom))]" />
    </div>
  )
}
