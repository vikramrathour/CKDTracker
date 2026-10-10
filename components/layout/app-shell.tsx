'use client'

import { useAuth } from '@/components/providers/auth-provider'
import { ONBOARDING_PATH, PatientProvider, usePatient } from '@/components/providers/patient-provider'
import { Button } from '@/components/ui/button'
import { BottomNav } from './bottom-nav'
import { ScrollToTop } from './scroll-to-top'
import { OfflineIndicator } from '@/components/notifications/offline-indicator'
import { PendingInviteRedeemer } from '@/components/care-circle/pending-invite-redeemer'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { Loader2 } from 'lucide-react'

function FullScreenSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas">
      <Loader2 className="h-7 w-7 animate-spin text-terra" aria-label="Loading" />
    </div>
  )
}

/** Gate on the patient layer: memberships loaded, onboarding when there are none. */
function PatientGate({ children }: { children: React.ReactNode }) {
  const { loading, error, patients, refreshPatients } = usePatient()
  const pathname = usePathname()
  const onOnboarding = pathname === ONBOARDING_PATH

  if (loading) return <FullScreenSpinner />

  if (error) {
    return (
      <div className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center bg-canvas px-6 text-center">
        <p className="eyebrow mb-3">Something went wrong</p>
        <h1 className="font-serif text-[1.75rem] font-normal leading-tight tracking-[-.02em] text-ink">
          Couldn&rsquo;t load your <em className="italic text-terra-dk">profiles</em>
        </h1>
        <p role="alert" className="mt-3 max-w-[34ch] text-[15px] text-ink-2">{error}</p>
        <Button className="mt-6" onClick={() => refreshPatients()}>Try again</Button>
      </div>
    )
  }

  // No profiles: PatientProvider is redirecting to /onboarding.
  if (patients.length === 0 && !onOnboarding) return <FullScreenSpinner />

  const showNav = patients.length > 0

  return (
    <div className="relative mx-auto min-h-screen max-w-lg bg-canvas">
      <ScrollToTop />
      <OfflineIndicator />
      {children}
      {showNav && (
        <>
          <BottomNav />
          {/* Spacer for bottom nav + home indicator */}
          <div className="h-[calc(5.5rem+env(safe-area-inset-bottom))]" />
        </>
      )}
    </div>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login')
    }
  }, [user, loading, router])

  if (loading) return <FullScreenSpinner />

  if (!user) return null

  return (
    <PatientProvider>
      <PendingInviteRedeemer />
      <PatientGate>{children}</PatientGate>
    </PatientProvider>
  )
}
