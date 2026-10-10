'use client'

import Link from 'next/link'
import { ChevronRight, FileText, Printer, Scale, ShieldCheck, Users } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/components/providers/auth-provider'
import { usePatient } from '@/components/providers/patient-provider'
import { LinkedAccounts } from '@/components/settings/linked-accounts'
import { NotificationSettings } from '@/components/settings/notification-settings'
import { DeleteAccount } from '@/components/settings/delete-account'
import { AccountName } from '@/components/settings/account-name'
import { ExportButtons } from '@/components/records/export-buttons'
import { formatPhoneForDisplay } from '@/lib/phone'

function RowLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="-mx-2 flex items-center gap-3 rounded-btn px-2 py-2 transition-colors duration-200 hover:bg-wash"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-btn bg-recess text-ink-2">{icon}</span>
      <span className="flex-1 text-sm font-semibold text-ink">{label}</span>
      <ChevronRight className="h-4 w-4 text-ink-3" aria-hidden />
    </Link>
  )
}

export default function SettingsPage() {
  const { user, logOut } = useAuth()
  const { pid, activePatient } = usePatient()

  return (
    <>
      <Header title="Settings" showBack />
      <main className="space-y-6 px-4 py-5">
        <section className="rounded-card border border-hair bg-vellum p-5" aria-labelledby="account-heading">
          <h3 id="account-heading" className="label mb-3 text-ink-3">Account</h3>
          <AccountName />
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

        <NotificationSettings />

        <section className="rounded-card border border-hair bg-vellum p-5" aria-labelledby="data-heading">
          <h3 id="data-heading" className="label mb-1 text-ink-3">Your data</h3>
          <p className="mb-4 text-[13px] leading-relaxed text-ink-2">
            {activePatient
              ? `Download ${activePatient.displayName}’s lab values (CSV) or everything (JSON).`
              : 'Download lab values (CSV) or everything (JSON).'}
          </p>
          {pid ? <ExportButtons pid={pid} /> : <p className="text-[13px] text-ink-3">Choose a patient profile first.</p>}
          <div className="mt-4 border-t border-hair pt-3">
            <RowLink href="/records/print" icon={<Printer className="h-4 w-4" aria-hidden />} label="Printable report" />
          </div>
        </section>

        <section className="rounded-card border border-hair bg-vellum p-5" aria-labelledby="legal-heading">
          <h3 id="legal-heading" className="label mb-3 text-ink-3">Privacy &amp; terms</h3>
          <RowLink href="/privacy" icon={<ShieldCheck className="h-4 w-4" aria-hidden />} label="Privacy policy" />
          <RowLink href="/terms" icon={<Scale className="h-4 w-4" aria-hidden />} label="Terms of use" />
          <p className="mt-3 flex items-start gap-2 text-[12px] leading-relaxed text-ink-3">
            <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            CKD Tracker helps you organise results. It isn’t medical advice; talk to your doctor about any change.
          </p>
        </section>

        <Button variant="danger" className="w-full" onClick={logOut}>
          Sign Out
        </Button>

        <DeleteAccount />
      </main>
    </>
  )
}
