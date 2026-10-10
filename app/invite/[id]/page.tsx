'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { HeartHandshake, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/components/providers/auth-provider'
import { RoleExplainer } from '@/components/care-circle/role-explainer'
import { roleWithArticle } from '@/components/care-circle/share'
import { formatPhoneForDisplay } from '@/lib/phone'
import { setActivePatient } from '@/lib/firebase/patients'
import {
  getInviteSummary,
  redeemInvite,
  storePendingInviteId,
  type InviteSummary,
} from '@/lib/firebase/invites'

/**
 * /invite/{id}: public landing page for a WhatsApp'd invite link. Shows who
 * invited you to whose care circle (first names and role only), then either
 * accepts directly (signed in) or stores the id and sends you to /login;
 * PendingInviteRedeemer in the app shell finishes the job after sign-in.
 */
export default function InvitePage() {
  const params = useParams<{ id: string }>()
  const inviteId = typeof params?.id === 'string' ? params.id : ''
  const router = useRouter()
  const { user, loading: authLoading, logOut } = useAuth()

  const [summary, setSummary] = useState<InviteSummary | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [accepting, setAccepting] = useState(false)
  const [acceptError, setAcceptError] = useState<{ status: number; message: string } | null>(null)

  useEffect(() => {
    if (!inviteId) return
    getInviteSummary(inviteId)
      .then(setSummary)
      .catch((err) => setLoadError(err?.status === 404 ? 'This invite link isn’t valid.' : 'Couldn’t load this invite. Check your connection and try again.'))
  }, [inviteId])

  function signInToAccept() {
    storePendingInviteId(inviteId)
    router.push('/login')
  }

  async function switchAccount() {
    storePendingInviteId(inviteId)
    await logOut()
    router.push('/login')
  }

  async function accept() {
    setAccepting(true)
    setAcceptError(null)
    try {
      const result = await redeemInvite(inviteId, user?.displayName ?? undefined)
      await setActivePatient(result.pid).catch(() => {})
      router.replace('/dashboard')
    } catch (err) {
      const e = err as { status?: number; message?: string }
      setAcceptError({ status: e.status ?? 0, message: e.message || 'Could not accept the invite.' })
      setAccepting(false)
    }
  }

  const unavailable = summary && summary.status !== 'pending'

  return (
    <div>
      <div className="mb-8 flex items-center gap-2.5">
        <span className="relative block h-6 w-[31px] flex-shrink-0" aria-hidden>
          <Image src="/icons/logo-mark.png" alt="" width={31} height={24} className="dark:hidden" priority />
          <Image src="/icons/logo-mark-light.png" alt="" width={31} height={24} className="hidden dark:block" priority />
        </span>
        <span className="font-serif text-lg text-ink">CKD Tracker</span>
      </div>

      {!summary && !loadError && (
        <div className="flex justify-center py-16">
          <Loader2 className="h-7 w-7 animate-spin text-terra" aria-label="Loading" />
        </div>
      )}

      {loadError && (
        <div>
          <p className="eyebrow mb-3">Invite</p>
          <h1 className="font-serif text-[2rem] font-normal leading-[1.1] tracking-[-.02em] text-ink">
            Link not <em className="italic text-terra-dk">found</em>
          </h1>
          <p className="mt-3 text-[15px] text-ink-2">{loadError} Ask the person who sent it for a new invite.</p>
        </div>
      )}

      {summary && (
        <div>
          <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-terra-pale text-terra-dk" aria-hidden>
            <HeartHandshake className="h-6 w-6" />
          </span>
          <p className="eyebrow mb-3">You’re invited</p>
          <h1 className="font-serif text-[2rem] font-normal leading-[1.1] tracking-[-.02em] text-ink">
            Join {summary.patientFirstName}’s <em className="italic text-terra-dk">care circle</em>
          </h1>
          <p className="mt-3 text-[15px] text-ink-2">
            {summary.inviterFirstName} invited you as {roleWithArticle(summary.role)}, so you can follow{' '}
            {summary.patientFirstName}’s kidney reports together.
          </p>

          {unavailable ? (
            <p role="alert" className="mt-6 rounded-btn bg-critical-pale px-3 py-2.5 text-sm text-critical">
              {summary.status === 'accepted'
                ? 'This invite has already been used.'
                : summary.status === 'revoked'
                  ? 'This invite was cancelled.'
                  : 'This invite has expired.'}{' '}
              Ask {summary.inviterFirstName} to send a new one.
              {summary.status === 'accepted' && user && (
                <>
                  {' '}
                  If it was you, <Link className="tlink" href="/dashboard">open the app</Link>.
                </>
              )}
            </p>
          ) : (
            <div className="mt-7 space-y-3">
              {authLoading ? null : user ? (
                <>
                  <Button size="lg" className="w-full" loading={accepting} onClick={accept}>
                    Accept invite
                  </Button>
                  <p className="text-center text-xs text-ink-3">
                    Signed in as {user.phoneNumber ? formatPhoneForDisplay(user.phoneNumber) : user.email || 'you'}
                  </p>
                </>
              ) : (
                <>
                  <Button size="lg" className="w-full" onClick={signInToAccept}>
                    Sign in to accept
                  </Button>
                  <p className="text-center text-xs text-ink-3">
                    Use the phone number this link was sent to.
                  </p>
                </>
              )}
              {acceptError && (
                <div role="alert" className="rounded-btn bg-critical-pale px-3 py-2.5 text-sm text-critical">
                  <p>{acceptError.message}</p>
                  {acceptError.status === 403 && (
                    <button type="button" className="tlink mt-1.5 text-sm" onClick={switchAccount}>
                      Sign out and use another number
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="mt-8 rounded-card border border-hair bg-vellum p-4">
            <h2 className="label mb-3 text-ink-3">Roles</h2>
            <RoleExplainer />
          </div>
        </div>
      )}
    </div>
  )
}
