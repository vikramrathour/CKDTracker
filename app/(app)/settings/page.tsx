'use client'

import { Header } from '@/components/layout/header'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/components/providers/auth-provider'

export default function SettingsPage() {
  const { user, logOut } = useAuth()

  return (
    <>
      <Header title="Settings" showBack />
      <main className="space-y-6 px-4 py-5">
        <section className="rounded-card border border-hair bg-vellum p-5">
          <h3 className="label mb-3 text-ink-3">Account</h3>
          <p className="font-serif text-xl font-medium tracking-[-.015em] text-ink">{user?.displayName}</p>
          <p className="mt-0.5 text-sm text-ink-2">{user?.email}</p>
        </section>

        <Button variant="danger" className="w-full" onClick={logOut}>
          Sign Out
        </Button>
      </main>
    </>
  )
}
