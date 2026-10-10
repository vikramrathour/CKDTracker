'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, MessageCircleQuestion, History } from 'lucide-react'
import { Header, primaryIconButton } from '@/components/layout/header'
import { useCanEdit } from '@/components/providers/patient-provider'
import { ListSkeleton } from '@/components/ui/skeleton'
import { useQuestions, useVisits } from '@/components/visits/hooks'
import { PastVisitRow, UpcomingVisitCard } from '@/components/visits/visit-card'
import { splitVisits } from '@/lib/visits/types'

export default function VisitsPage() {
  const router = useRouter()
  const canEdit = useCanEdit()
  const { visits, loading, error } = useVisits()
  const { questions } = useQuestions()
  const { upcoming, past } = splitVisits(visits)
  const openCount = questions.filter((q) => q.status === 'open').length

  return (
    <>
      <Header
        title="Doctor Visits"
        emphasis="Visits"
        actions={
          canEdit ? (
            <button type="button" onClick={() => router.push('/visits/new')} aria-label="Add visit" className={primaryIconButton}>
              <Plus className="h-5 w-5" />
            </button>
          ) : undefined
        }
      />
      <main className="px-4 py-5">
        <nav className="mb-5 flex gap-4 text-[13px]" aria-label="Related">
          <Link href="/questions" className="tlink">
            <MessageCircleQuestion className="h-4 w-4" aria-hidden />
            Questions{openCount ? ` (${openCount} open)` : ''}
          </Link>
          <Link href="/timeline" className="tlink">
            <History className="h-4 w-4" aria-hidden /> Timeline
          </Link>
        </nav>

        {loading ? (
          <ListSkeleton rows={4} />
        ) : error ? (
          <p role="alert" className="pt-16 text-center text-[15px] text-critical">{error}</p>
        ) : visits.length === 0 ? (
          <div className="pt-16 text-center">
            <p className="font-serif text-xl text-ink">No visits yet</p>
            <p className="mx-auto mt-2 max-w-[32ch] text-[15px] text-ink-2">
              {canEdit
                ? 'Add your next appointment to prepare a summary for the doctor.'
                : 'Visits added by the care circle will appear here.'}
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {upcoming.length > 0 && (
              <section aria-labelledby="upcoming-h">
                <h2 id="upcoming-h" className="label mb-2 text-ink-3">Upcoming</h2>
                <div className="space-y-3">
                  {upcoming.map((v) => <UpcomingVisitCard key={v.id} visit={v} showEyebrow={false} />)}
                </div>
              </section>
            )}
            {past.length > 0 && (
              <section aria-labelledby="past-h">
                <h2 id="past-h" className="label mb-2 text-ink-3">Past</h2>
                <ul className="border-t border-hair-2">
                  {past.map((v) => <PastVisitRow key={v.id} visit={v} />)}
                </ul>
              </section>
            )}
          </div>
        )}
      </main>
    </>
  )
}
