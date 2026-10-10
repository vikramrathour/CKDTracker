'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/components/providers/auth-provider'
import { useToast } from '@/components/providers/toast-provider'
import { getMyFullName, saveMyFullName } from '@/lib/firebase/auth'
import { setMyName } from '@/lib/firebase/invites'
import { isPhoneLike, pickPersonName } from '@/lib/phone'

/**
 * Settings → Account: your name (users/{uid}.fullName), shown to the care
 * circle. Saving also updates your member docs (server-side), so activity and
 * the members list stop showing a phone number.
 */
export function AccountName() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [fullName, setFullName] = useState('')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    getMyFullName()
      .then((n) => live && setFullName(n))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [user?.uid])

  const shown = pickPersonName({ fullName, displayName: user?.displayName })
  const hasName = shown !== 'Someone'

  const start = () => {
    setDraft(hasName ? shown : '')
    setError('')
    setEditing(true)
  }

  const save = async () => {
    const name = draft.trim().replace(/\s+/g, ' ')
    if (!name) return setError('Enter a name.')
    if (isPhoneLike(name)) return setError('Use a name, not a phone number.')
    setBusy(true)
    setError('')
    try {
      await saveMyFullName(name)
      await setMyName(name)
      setFullName(name)
      setEditing(false)
      showToast('success', 'Name updated')
    } catch (err) {
      console.error('Name update failed:', err)
      setError('Could not save your name. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  if (editing) {
    return (
      <div>
        <label htmlFor="acct-name" className="label mb-1.5 block text-ink-3">Your name</label>
        <input
          id="acct-name"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={100}
          autoComplete="name"
          autoFocus
          className="field"
        />
        <p className="mt-1.5 text-xs text-ink-3">Shown to family in your care circles.</p>
        {error && <p role="alert" className="mt-1.5 text-sm text-critical">{error}</p>}
        <div className="mt-3 flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setEditing(false)} disabled={busy}>Cancel</Button>
          <Button size="sm" loading={busy} onClick={save}>Save</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-baseline justify-between gap-3">
      <p className="min-w-0 truncate font-serif text-xl font-medium tracking-[-.015em] text-ink">
        {hasName ? shown : <span className="text-ink-3">Add your name</span>}
      </p>
      <button type="button" onClick={start} className="tlink shrink-0 text-[13px]">
        {hasName ? 'Edit' : 'Add'}
      </button>
    </div>
  )
}
