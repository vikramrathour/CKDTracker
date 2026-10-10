'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronRight, Plus, Target } from 'lucide-react'
import { Header, iconButton, primaryIconButton } from '@/components/layout/header'
import { CardSkeleton } from '@/components/ui/skeleton'
import { Tabs } from '@/components/ui/tabs'
import { interactiveCard } from '@/components/ui/card'
import { useCanEdit } from '@/components/providers/patient-provider'
import { useProfile } from '@/lib/hooks/use-profile'
import { useMedications } from '@/lib/hooks/use-medications'
import { TIME_LABELS } from '@/components/medications/medication-form'
import { CATEGORY_COLORS } from '@/components/medications/category-colors'
import { formatDate, cn } from '@/lib/utils'

export default function MedicationsPage() {
  const router = useRouter()
  const canEdit = useCanEdit()
  const { profile } = useProfile()
  const { medications, loading, error } = useMedications()
  const [tab, setTab] = useState<'active' | 'stopped'>('active')

  const active = medications.filter((m) => m.isActive)
  const stopped = medications.filter((m) => !m.isActive)
  const shown = tab === 'active' ? active : stopped

  return (
    <>
      <Header
        title="Medications"
        actions={
          <>
            <button type="button" className={iconButton} aria-label="Targets" onClick={() => router.push('/targets')}>
              <Target className="h-5 w-5" />
            </button>
            {canEdit && (
              <button type="button" className={primaryIconButton} aria-label="Add medication" onClick={() => router.push('/medications/new')}>
                <Plus className="h-5 w-5" />
              </button>
            )}
          </>
        }
      />
      <main className="px-4 py-4">
        <Tabs
          className="mb-3"
          tabs={[
            { id: 'active', label: `Current · ${active.length}` },
            { id: 'stopped', label: `Stopped · ${stopped.length}` },
          ]}
          activeTab={tab}
          onTabChange={(id) => setTab(id as 'active' | 'stopped')}
        />

        {loading ? (
          <CardSkeleton />
        ) : (
          <section className="rounded-card border border-hair bg-vellum px-4 pb-2 pt-4">
            <h2 className="label mb-2 text-ink-3">
              {tab === 'active' ? 'Current medications' : 'Stopped'}
              {tab === 'active' && profile?.doctorName ? ` · ${profile.doctorName}` : ''}
            </h2>

            {error ? (
              <p role="alert" className="py-6 text-center text-sm text-critical">{error}</p>
            ) : shown.length === 0 ? (
              <div className="py-6 text-center text-sm text-ink-2">
                {tab === 'active' ? 'No medications added yet.' : 'Nothing stopped.'}
                {tab === 'active' && canEdit && (
                  <div className="mt-3">
                    <Link href="/medications/new" className="tlink font-semibold">Add a medication</Link>
                  </div>
                )}
              </div>
            ) : (
              <ul>
                {shown.map((med) => (
                  <li key={med.id} className="border-t border-hair first:border-t-0">
                    <Link
                      href={`/medications/${med.id}`}
                      className={cn('-mx-2 flex items-center gap-3 rounded-btn px-2 py-3.5', interactiveCard, 'hover:shadow-none active:shadow-none')}
                    >
                      <span
                        aria-hidden
                        className={cn('h-9 w-[3px] flex-shrink-0 rounded-full', CATEGORY_COLORS[med.category] || 'bg-ink-3', !med.isActive && 'opacity-40')}
                      />
                      <div className="min-w-0 flex-1">
                        <div className={cn('font-serif text-lg font-medium leading-snug tracking-[-.01em]', med.isActive ? 'text-ink' : 'text-ink-2')}>
                          {med.name} <span className="font-sans text-sm font-semibold text-ink-2 tabular">{med.dose}</span>
                        </div>
                        <div className="truncate text-[13px] text-ink-3">
                          {med.isActive
                            ? [med.category, med.frequency, (med.timeOfDay ?? []).map((t) => TIME_LABELS[t]).join(', ')]
                                .filter(Boolean)
                                .join(' · ')
                            : `Stopped${med.stoppedAt ? ` ${formatDate(med.stoppedAt, 'dd MMM yyyy')}` : ''}${med.stopReason ? ` · ${med.stopReason}` : ''}`}
                        </div>
                      </div>
                      <ChevronRight aria-hidden className="h-4 w-4 flex-shrink-0 text-ink-3" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </main>
    </>
  )
}
