'use client'

import Link from 'next/link'
import { ChevronRight, Users } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/components/providers/auth-provider'
import { LinkedAccounts } from '@/components/settings/linked-accounts'
import { formatPhoneForDisplay } from '@/lib/phone'

export default function SettingsPage() {
  const { user, logOut } = useAuth()
  const name = user?.displayName || (user?.phoneNumber ? formatPhoneForDisplay(user.phoneNumber) : 'Your account')

  return (
    <>
      <Header title="Settings" showBack />
      <main className="space-y-6 px-4 py-5">
        <section className="rounded-card border border-hair bg-vellum p-5" aria-labelledby="account-heading">
          <h3 id="account-heading" className="label mb-3 text-ink-3">Account</h3>
          <p className="font-serif text-xl font-medium tracking-[-.015em] text-ink">{name}</p>
          <dl className="mt-3 space-y-1.5 text-sm">
            <div className="flex gap-3">
              <dt className="w-14 shrink-0 text-ink-3">Phone</dt>
              <dd className="num text-ink-2">{user?.phoneNumber ? formatPhoneForDisplay(user.phoneNumber) : '—'}</dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-14 shrink-0 text-ink-3">Email</dt>
              <dd className="min-w-0 truncate text-ink-2">{user?.email || '—'}</dd>
            </div>
          </dl>
        </section>

        <LinkedAccounts />

        {/* ── Patients & care circle ────────────────────────────────────────
            Slot for the Phase 2/4 agents: patient switching / management and
            the care-circle (invites, roles) entry points go in this section.
            /care-circle is built in Phase 4. */}
        <section className="rounded-card border border-hair bg-vellum p-5" aria-labelledby="care-heading">
          <h3 id="care-heading" className="label mb-3 text-ink-3">Patients &amp; care circle</h3>
          <Link
            href="/care-circle"
            className="-mx-2 flex items-center gap-3 rounded-btn px-2 py-2 transition-colors duration-200 hover:bg-wash"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-btn bg-recess text-ink-2">
              <Users className="h-4 w-4" aria-hidden />
            </span>
            <span className="flex-1 text-sm font-semibold text-ink">Care circle</span>
            <ChevronRight className="h-4 w-4 text-ink-3" aria-hidden />
          </Link>
        </section>

        <Button variant="danger" className="w-full" onClick={logOut}>
          Sign Out
        </Button>
      </main>
    </>
  )
}
