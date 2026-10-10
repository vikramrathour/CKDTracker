'use client'

import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { apiFetch } from '@/lib/api/client'
import { signOut } from '@/lib/firebase/auth'
import { clearOfflineData } from '@/lib/firebase/config'
import { DELETE_CONFIRMATION } from '@/lib/server/account-deletion'

/**
 * Settings → Delete my account (Google Play account-deletion requirement).
 * Calls POST /api/account/delete; the server refuses (409) while the user
 * owns a profile other members still use.
 */
export function DeleteAccount() {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function close() {
    if (busy) return
    setOpen(false)
    setTyped('')
    setError('')
  }

  async function confirm() {
    setBusy(true)
    setError('')
    try {
      const res = await apiFetch('/api/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: DELETE_CONFIRMATION }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Couldn’t delete your account')
      try {
        localStorage.clear()
      } catch {
        // ignore
      }
      await signOut().catch(() => {})
      await clearOfflineData()
      window.location.assign('/login')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t delete your account')
      setBusy(false)
    }
  }

  return (
    <section className="rounded-card border border-critical/30 bg-vellum p-5" aria-labelledby="delete-heading">
      <h3 id="delete-heading" className="label mb-1 text-critical">
        Delete account
      </h3>
      <p className="mb-4 text-[13px] leading-relaxed text-ink-2">
        Permanently deletes your sign-in, your profile and every patient profile you own alone, with all reports,
        documents, medications, visits, vitals and chats. You’ll be removed from care circles you’ve joined. This
        can’t be undone; export your data first if you want a copy.
      </p>
      <Button variant="danger" size="sm" onClick={() => setOpen(true)}>
        <Trash2 className="h-4 w-4" aria-hidden />
        Delete my account
      </Button>

      <Modal open={open} onClose={close} title="Delete your account?">
        <p className="text-sm leading-relaxed text-ink-2">This deletes, immediately and for good:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-ink-2">
          <li>Your sign-in and your account profile</li>
          <li>
            Every patient profile you own alone, with all its reports, documents, medications, visits, vitals and chats
          </li>
          <li>Your place in care circles you’ve joined</li>
        </ul>
        <p className="mt-3 text-sm leading-relaxed text-ink-2">
          It can’t be recovered; export your data first if you want a copy. Type{' '}
          <strong className="num text-ink">{DELETE_CONFIRMATION}</strong> to confirm.
        </p>
        <label htmlFor="delete-confirm" className="label mb-1.5 mt-4 block text-ink-3">
          Confirmation
        </label>
        <input
          id="delete-confirm"
          className="field"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          disabled={busy}
        />
        {error && (
          <p role="alert" className="mt-3 text-[13px] leading-relaxed text-critical">
            {error}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" onClick={confirm} loading={busy} disabled={typed.trim() !== DELETE_CONFIRMATION}>
            Delete forever
          </Button>
        </div>
      </Modal>
    </section>
  )
}
