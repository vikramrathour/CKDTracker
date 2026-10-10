'use client'

import { useEffect, useState } from 'react'
import { Contact } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/tabs'
import { FormError, PhoneField } from '@/components/auth/otp'
import { normalizeIndianPhone } from '@/lib/phone'
import { createInvite, type CreatedInvite, type InviteRole } from '@/lib/firebase/invites'
import { ROLE_COPY } from './share'
import { InviteSharePanel } from './invite-share-panel'

// Contact Picker API (Chrome on Android). Not in lib.dom yet.
interface ContactsManager {
  select(props: string[], opts?: { multiple?: boolean }): Promise<{ name?: string[]; tel?: string[] }[]>
}

interface InviteFormProps {
  pid: string
  patientName: string
  /** Called after an invite is created/refreshed (to reload the pending list). */
  onCreated?: () => void
}

/** Owner: phone + role (+ optional name) → invite link with share buttons. */
export function InviteForm({ pid, patientName, onCreated }: InviteFormProps) {
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<InviteRole>('viewer')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<(CreatedInvite & { phoneE164: string; inviteeName: string }) | null>(null)
  const [contacts, setContacts] = useState<ContactsManager | null>(null)

  useEffect(() => {
    const nav = navigator as Navigator & { contacts?: ContactsManager }
    if (nav.contacts && typeof nav.contacts.select === 'function') setContacts(nav.contacts)
  }, [])

  async function pickContact() {
    if (!contacts) return
    try {
      const [picked] = await contacts.select(['name', 'tel'], { multiple: false })
      if (!picked) return
      const tel = picked.tel?.find((t) => normalizeIndianPhone(t)) ?? picked.tel?.[0]
      if (tel) setPhone(tel)
      if (picked.name?.[0] && !name) setName(picked.name[0].slice(0, 60))
      setError(null)
    } catch {
      // picker dismissed
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const phoneE164 = normalizeIndianPhone(phone)
    if (!phoneE164) {
      setError('Enter a 10-digit Indian mobile number.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const result = await createInvite({ pid, phone: phoneE164, role, inviteeName: name.trim() || undefined })
      setCreated({ ...result, phoneE164, inviteeName: name.trim() })
      onCreated?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the invite.')
    } finally {
      setSaving(false)
    }
  }

  function reset() {
    setCreated(null)
    setPhone('')
    setName('')
    setRole('viewer')
  }

  if (created) {
    return (
      <div className="space-y-4">
        <p className="font-serif text-lg leading-snug text-ink">
          {created.reused ? 'Invite refreshed' : 'Invite ready'}
          <span className="text-ink-3"> · {ROLE_COPY[created.role].label}</span>
        </p>
        <InviteSharePanel
          url={created.url}
          patientName={patientName}
          role={created.role}
          phoneE164={created.phoneE164}
          inviteeName={created.inviteeName || null}
          expiresAt={created.expiresAt}
        />
        <Button variant="ghost" size="sm" onClick={reset}>Invite someone else</Button>
      </div>
    )
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label htmlFor="invite-phone" className="block text-xs font-medium text-ink-2">Their mobile number</label>
          {contacts && (
            <button type="button" onClick={pickContact} className="tlink inline-flex items-center gap-1 text-xs">
              <Contact className="h-3.5 w-3.5" aria-hidden /> From contacts
            </button>
          )}
        </div>
        <PhoneField
          id="invite-phone"
          value={phone}
          onChange={(v) => {
            setPhone(v)
            if (error) setError(null)
          }}
          invalid={Boolean(error)}
          describedBy={error ? 'invite-error' : undefined}
          disabled={saving}
        />
      </div>
      <div>
        <label htmlFor="invite-name" className="mb-1.5 block text-xs font-medium text-ink-2">
          Their name <span className="font-normal text-ink-3">(optional)</span>
        </label>
        <input
          id="invite-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          autoComplete="off"
          placeholder="e.g. Rahul (son)"
          className="field"
          disabled={saving}
        />
      </div>
      <fieldset>
        <legend className="mb-1.5 block text-xs font-medium text-ink-2">They can</legend>
        <div className="flex flex-wrap gap-2">
          {(['viewer', 'editor'] as const).map((r) => (
            <Chip key={r} selected={role === r} onClick={() => setRole(r)} disabled={saving}>
              {ROLE_COPY[r].label}: {ROLE_COPY[r].short.toLowerCase()}
            </Chip>
          ))}
        </div>
      </fieldset>
      {error && <FormError id="invite-error">{error}</FormError>}
      <Button type="submit" loading={saving} className="w-full">Create invite link</Button>
    </form>
  )
}
