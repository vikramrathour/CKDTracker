'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/layout/header'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { ListSkeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/components/providers/auth-provider'
import { usePatient } from '@/components/providers/patient-provider'
import { useToast } from '@/components/providers/toast-provider'
import { listMembers } from '@/lib/firebase/patients'
import { leaveCareCircle, listInvites, type OutgoingInvite } from '@/lib/firebase/invites'
import type { Member } from '@/lib/types/member'
import { MembersList } from '@/components/care-circle/members-list'
import { InviteForm } from '@/components/care-circle/invite-form'
import { OutgoingInvites } from '@/components/care-circle/outgoing-invites'
import { RoleExplainer } from '@/components/care-circle/role-explainer'
import { ActivityFeed } from '@/components/care-circle/activity-feed'

/**
 * Care circle for the active patient: members (owner manages roles/removal,
 * others can leave), invites (owner), role explainer, and the activity feed.
 */
export default function CareCirclePage() {
  const router = useRouter()
  const { user } = useAuth()
  const { pid, role, activePatient, refreshPatients } = usePatient()
  const { showToast } = useToast()
  const isOwner = role === 'owner'

  const [members, setMembers] = useState<Member[] | null>(null)
  const [membersError, setMembersError] = useState(false)
  const [invites, setInvites] = useState<OutgoingInvite[]>([])
  const [activityKey, setActivityKey] = useState(0)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [leaving, setLeaving] = useState(false)

  const loadMembers = useCallback(async () => {
    if (!pid) return
    try {
      setMembers(await listMembers(pid))
      setMembersError(false)
    } catch (err) {
      console.error('Members load failed', err)
      setMembersError(true)
    }
  }, [pid])

  const loadInvites = useCallback(async () => {
    if (!pid || !isOwner) {
      setInvites([])
      return
    }
    try {
      setInvites(await listInvites(pid))
    } catch (err) {
      console.warn('Invites unavailable', err)
    }
  }, [pid, isOwner])

  useEffect(() => {
    setMembers(null)
    loadMembers()
    loadInvites()
  }, [loadMembers, loadInvites])

  const afterChange = useCallback(() => {
    loadMembers()
    loadInvites()
    setActivityKey((k) => k + 1)
  }, [loadMembers, loadInvites])

  async function leave() {
    if (!pid) return
    setLeaving(true)
    try {
      await leaveCareCircle(pid)
      showToast('success', `You left ${activePatient?.displayName ?? 'the'} care circle`)
      setConfirmLeave(false)
      await refreshPatients()
      router.replace('/dashboard')
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Could not leave')
      setLeaving(false)
    }
  }

  if (!pid || !activePatient || !user) return null
  const patientName = activePatient.displayName

  return (
    <>
      <Header title="Care circle" emphasis="circle" />
      <main className="space-y-4 px-4 pb-8 pt-6">
        <div>
          <p className="eyebrow mb-2">{patientName}</p>
          <h2 className="font-serif text-[1.75rem] font-normal leading-[1.15] tracking-[-.02em] text-ink">
            The people <em className="italic text-terra-dk">helping</em>
          </h2>
          <p className="mt-2 max-w-[40ch] text-[15px] text-ink-2">
            {isOwner
              ? 'Invite family to follow reports with you. Each person signs in with their own phone number.'
              : 'Everyone here can see this profile’s reports.'}
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Members</CardTitle>
          </CardHeader>
          {membersError ? (
            <p className="text-sm text-ink-3">
              Couldn’t load members. <button type="button" className="tlink" onClick={loadMembers}>Try again</button>
            </p>
          ) : members ? (
            <MembersList
              pid={pid}
              members={members}
              myUid={user.uid}
              isOwner={isOwner}
              onChanged={afterChange}
              onLeave={() => setConfirmLeave(true)}
            />
          ) : (
            <ListSkeleton rows={2} />
          )}
        </Card>

        {isOwner && (
          <Card>
            <CardHeader>
              <CardTitle>Invite someone</CardTitle>
            </CardHeader>
            <InviteForm pid={pid} patientName={patientName} onCreated={afterChange} />
          </Card>
        )}

        {isOwner && invites.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Waiting to join</CardTitle>
            </CardHeader>
            <OutgoingInvites invites={invites} patientName={patientName} onChanged={afterChange} />
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Who can do what</CardTitle>
          </CardHeader>
          <RoleExplainer />
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
          </CardHeader>
          <ActivityFeed pid={pid} refreshKey={activityKey} />
        </Card>
      </main>

      <Modal open={confirmLeave} onClose={() => setConfirmLeave(false)} title="Leave this care circle?">
        <p className="text-[15px] text-ink-2">
          You’ll stop seeing {patientName}’s reports. The owner can invite you again later.
        </p>
        <div className="mt-5 flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => setConfirmLeave(false)}>Cancel</Button>
          <Button variant="danger" className="flex-1" loading={leaving} onClick={leave}>Leave</Button>
        </div>
      </Modal>
    </>
  )
}
