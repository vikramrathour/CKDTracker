'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { HeartHandshake } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/components/providers/auth-provider'
import { usePatient } from '@/components/providers/patient-provider'
import { useToast } from '@/components/providers/toast-provider'
import {
  listMyPendingInvites,
  redeemInvite,
  type IncomingInvite,
  type RedeemedInvite,
} from '@/lib/firebase/invites'
import { roleWithArticle } from './share'
import { formatPersonName } from '@/lib/phone'

/**
 * Invites addressed to the signed-in user's phone number
 * (GET /api/invites/pending). Empty for accounts without a phone number.
 */
export function usePendingInvites() {
  const { user } = useAuth()
  const [invites, setInvites] = useState<IncomingInvite[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    if (!user?.phoneNumber) {
      setInvites([])
      setLoading(false)
      return
    }
    try {
      const res = await listMyPendingInvites()
      setInvites(res.invites)
    } catch (err) {
      console.warn('Pending invites unavailable', err)
      setInvites([])
    } finally {
      setLoading(false)
    }
  }, [user?.phoneNumber])

  useEffect(() => {
    reload()
  }, [reload, user?.uid])

  return { invites, loading, reload }
}

/** Accept an invite, then switch to that patient and go to the dashboard. */
export function useAcceptInvite() {
  const router = useRouter()
  const { user } = useAuth()
  const { refreshPatients, setActivePatient } = usePatient()
  const { showToast } = useToast()

  return useCallback(
    async (inviteId: string): Promise<RedeemedInvite> => {
      const result = await redeemInvite(inviteId, user?.displayName ?? undefined)
      await refreshPatients()
      await setActivePatient(result.pid)
      showToast(
        'success',
        result.alreadyMember
          ? `You’re already in ${result.patientName}’s care circle`
          : `You joined ${result.patientName}’s care circle`
      )
      router.replace('/dashboard')
      return result
    },
    [user?.displayName, refreshPatients, setActivePatient, showToast, router]
  )
}

/** Cards with Accept buttons; renders nothing when there are none. */
export function IncomingInvites({ invites, onError }: { invites: IncomingInvite[]; onError?: () => void }) {
  const accept = useAcceptInvite()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function onAccept(id: string) {
    setBusy(id)
    setError(null)
    try {
      await accept(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not accept the invite.')
      setBusy(null)
      onError?.()
    }
  }

  if (invites.length === 0) return null

  return (
    <div className="space-y-3">
      {invites.map((inv) => (
        <div key={inv.id} className="rounded-card border border-l-2 border-hair border-l-terra bg-vellum p-4">
          <div className="flex gap-3">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-terra-pale text-terra-dk" aria-hidden>
              <HeartHandshake className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-serif text-lg leading-snug text-ink">
                Join {inv.patientName}’s care circle
              </p>
              <p className="mt-0.5 text-sm text-ink-2">
                {inv.invitedByName ? `${formatPersonName(inv.invitedByName)} invited you` : 'You were invited'} as {roleWithArticle(inv.role)}.
              </p>
            </div>
          </div>
          <Button className="mt-3 w-full" loading={busy === inv.id} disabled={busy !== null} onClick={() => onAccept(inv.id)}>
            Accept invite
          </Button>
        </div>
      ))}
      {error && (
        <p role="alert" className="rounded-btn bg-critical-pale px-3 py-2.5 text-sm text-critical">{error}</p>
      )}
    </div>
  )
}

/**
 * Compact banner for pages inside the app shell (e.g. the dashboard): shows
 * invites waiting for the signed-in user. Must be rendered under PatientProvider.
 */
export function PendingInvitesBanner() {
  const { invites, reload } = usePendingInvites()
  if (invites.length === 0) return null
  return (
    <section aria-label="Invites for you" className="px-4 pt-4">
      <IncomingInvites invites={invites} onError={reload} />
    </section>
  )
}
