'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/tabs'
import { Modal } from '@/components/ui/modal'
import { useToast } from '@/components/providers/toast-provider'
import { formatPersonName, maskPhone } from '@/lib/phone'
import { removeMember, updateMemberRole } from '@/lib/firebase/patients'
import type { Member, Role } from '@/lib/types/member'
import { ROLE_COPY } from './share'

const ROLE_BADGE: Record<Role, 'info' | 'warning' | 'neutral'> = { owner: 'info', editor: 'warning', viewer: 'neutral' }

/** Up to two initials from words that don't start with a digit or symbol ("Member ••01" → "M"; "+91 …" → "·"). */
function initials(name: string): string {
  const parts = formatPersonName(name).trim().split(/\s+/).filter((p) => !/^[\d+().\-•·#*_'"]/.test(p))
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '·'
}

interface MembersListProps {
  pid: string
  members: Member[]
  myUid: string
  isOwner: boolean
  onChanged: () => void
  onLeave: () => void
}

/**
 * Members with role chips. The owner can switch others between editor and
 * viewer and remove them (firestore.rules enforce both); everyone else can leave.
 */
export function MembersList({ pid, members, myUid, isOwner, onChanged, onLeave }: MembersListProps) {
  const { showToast } = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<Member | null>(null)

  async function changeRole(m: Member, role: Exclude<Role, 'owner'>) {
    if (m.role === role) return
    setBusy(m.uid)
    try {
      await updateMemberRole(pid, m.uid, role)
      showToast('success', `${formatPersonName(m.displayName)} is now ${role === 'editor' ? 'an editor' : 'a viewer'}`)
      onChanged()
    } catch (err) {
      console.error('Role change failed', err)
      showToast('error', 'Could not change the role')
    } finally {
      setBusy(null)
    }
  }

  async function remove(m: Member) {
    setBusy(m.uid)
    try {
      await removeMember(pid, m.uid)
      showToast('success', `${formatPersonName(m.displayName)} was removed`)
      setConfirmRemove(null)
      onChanged()
    } catch (err) {
      console.error('Remove failed', err)
      showToast('error', 'Could not remove them')
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <ul className="divide-y divide-hair">
        {members.map((m) => {
          const me = m.uid === myUid
          const manageable = isOwner && !me && m.role !== 'owner'
          return (
            <li key={m.uid} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-center gap-3">
                <span
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-recess text-[13px] font-semibold text-ink-2"
                  aria-hidden
                >
                  {initials(m.displayName)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium text-ink">
                    {formatPersonName(m.displayName)}
                    {me && <span className="font-normal text-ink-3"> (you)</span>}
                  </p>
                  {m.phone && <p className="num text-xs text-ink-3">{m.phone.includes('•') ? m.phone : maskPhone(m.phone, 2)}</p>}
                </div>
                <Badge variant={ROLE_BADGE[m.role]}>{ROLE_COPY[m.role].label}</Badge>
              </div>

              {manageable && (
                <div className="mt-2.5 flex flex-wrap items-center gap-2 pl-[52px]">
                  {(['viewer', 'editor'] as const).map((r) => (
                    <Chip
                      key={r}
                      selected={m.role === r}
                      disabled={busy === m.uid}
                      onClick={() => changeRole(m, r)}
                      aria-label={`Make ${formatPersonName(m.displayName)} ${r === 'editor' ? 'an editor' : 'a viewer'}`}
                    >
                      {ROLE_COPY[r].label}
                    </Chip>
                  ))}
                  <Button variant="ghost" size="sm" className="ml-auto text-critical" onClick={() => setConfirmRemove(m)} disabled={busy === m.uid}>
                    Remove
                  </Button>
                </div>
              )}

              {me && m.role !== 'owner' && (
                <div className="mt-2.5 pl-[52px]">
                  <Button variant="danger" size="sm" onClick={onLeave}>Leave this care circle</Button>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <Modal open={confirmRemove !== null} onClose={() => setConfirmRemove(null)} title="Remove from care circle?">
        <p className="text-[15px] text-ink-2">
          {formatPersonName(confirmRemove?.displayName)} will lose access to all reports and chat for this profile. You can invite them again later.
        </p>
        <div className="mt-5 flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => setConfirmRemove(null)}>Cancel</Button>
          <Button
            variant="danger"
            className="flex-1"
            loading={confirmRemove !== null && busy === confirmRemove.uid}
            onClick={() => confirmRemove && remove(confirmRemove)}
          >
            Remove
          </Button>
        </div>
      </Modal>
    </>
  )
}
