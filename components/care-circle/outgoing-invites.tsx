'use client'

import { useState } from 'react'
import { ChevronDown, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/providers/toast-provider'
import { maskPhone } from '@/lib/phone'
import { cn } from '@/lib/utils'
import { revokeInvite, type OutgoingInvite } from '@/lib/firebase/invites'
import { ROLE_COPY } from './share'
import { InviteSharePanel } from './invite-share-panel'

function shortDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''
}

/** Owner: invites not yet accepted, each with share-again and revoke. */
export function OutgoingInvites({
  invites,
  patientName,
  onChanged,
}: {
  invites: OutgoingInvite[]
  patientName: string
  onChanged: () => void
}) {
  const { showToast } = useToast()
  const [openId, setOpenId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function revoke(invite: OutgoingInvite) {
    setBusyId(invite.id)
    try {
      await revokeInvite(invite.id)
      showToast('success', 'Invite cancelled')
      onChanged()
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Could not cancel the invite')
    } finally {
      setBusyId(null)
    }
  }

  if (invites.length === 0) return null

  return (
    <ul className="divide-y divide-hair">
      {invites.map((inv) => {
        const expired = inv.status === 'expired'
        const open = openId === inv.id
        return (
          <li key={inv.id} className="py-3 first:pt-0 last:pb-0">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setOpenId(open ? null : inv.id)}
                aria-expanded={open}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                disabled={expired}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium text-ink">
                    {inv.inviteeName || maskPhone(inv.phoneE164)}
                  </span>
                  <span className="block text-xs text-ink-3">
                    {inv.inviteeName ? `${maskPhone(inv.phoneE164)} · ` : ''}
                    {expired ? `Expired ${shortDate(inv.expiresAt)}` : `Expires ${shortDate(inv.expiresAt)}`}
                  </span>
                </span>
                <Badge variant={expired ? 'neutral' : 'warning'}>{expired ? 'Expired' : ROLE_COPY[inv.role].label}</Badge>
                {!expired && (
                  <ChevronDown className={cn('h-4 w-4 flex-shrink-0 text-ink-3 transition-transform', open && 'rotate-180')} aria-hidden />
                )}
              </button>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Cancel invite for ${inv.inviteeName || maskPhone(inv.phoneE164)}`}
                loading={busyId === inv.id}
                onClick={() => revoke(inv)}
                className="px-2"
              >
                {busyId !== inv.id && <X className="h-4 w-4" aria-hidden />}
              </Button>
            </div>
            {open && !expired && (
              <div className="mt-3">
                <InviteSharePanel
                  url={inv.url}
                  patientName={patientName}
                  role={inv.role}
                  phoneE164={inv.phoneE164}
                  inviteeName={inv.inviteeName}
                  expiresAt={inv.expiresAt}
                />
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
