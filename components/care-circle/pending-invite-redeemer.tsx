'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { useAuth } from '@/components/providers/auth-provider'
import { clearPendingInviteId, peekPendingInviteId } from '@/lib/firebase/invites'
import { useAcceptInvite } from './incoming-invites'

/**
 * Finishes the "Sign in to accept" flow from /invite/{id}: the landing page
 * stores the invite id in sessionStorage and sends the user to /login; once
 * they're signed in and inside the app shell, this redeems it, switches to
 * that patient and routes to /dashboard.
 *
 * Mount once inside <PatientProvider> (it uses usePatient), next to the
 * PatientGate so it also runs while the gate shows its spinner or onboarding.
 */
export function PendingInviteRedeemer() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const accept = useAcceptInvite()
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const started = useRef<string | null>(null)

  useEffect(() => {
    if (loading || !user) return
    const inviteId = peekPendingInviteId()
    if (!inviteId || started.current === inviteId) return
    started.current = inviteId
    setWorking(true)
    accept(inviteId)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not accept the invite.'))
      .finally(() => {
        // One attempt per stored id: a failure (wrong number, expired) shouldn't loop.
        clearPendingInviteId()
        setWorking(false)
      })
  }, [loading, user, accept])

  return (
    <>
      {working && (
        <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-3 bg-canvas" role="status" aria-live="polite">
          <Loader2 className="h-7 w-7 animate-spin text-terra" aria-hidden />
          <p className="text-[15px] text-ink-2">Joining the care circle…</p>
        </div>
      )}
      <Modal open={error !== null} onClose={() => setError(null)} title="Couldn’t accept the invite">
        <p className="text-[15px] text-ink-2">{error}</p>
        <div className="mt-5 flex gap-2">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => {
              setError(null)
              router.replace('/dashboard')
            }}
          >
            OK
          </Button>
        </div>
      </Modal>
    </>
  )
}
