'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ClipboardList, Pencil, CalendarPlus } from 'lucide-react'
import { Header, iconButton } from '@/components/layout/header'
import { usePatient, useCanEdit } from '@/components/providers/patient-provider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ListSkeleton } from '@/components/ui/skeleton'
import { useQuestions, useVisits } from '@/components/visits/hooks'
import { visitWhen } from '@/components/visits/visit-card'
import { deleteVisit } from '@/lib/firebase/visits'
import { formatDate } from '@/lib/utils'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-hair-2 py-4">
      <h2 className="label mb-1.5 text-ink-3">{title}</h2>
      {children}
    </section>
  )
}

function Prose({ text }: { text?: string | null }) {
  if (!text) return <p className="text-sm text-ink-3">—</p>
  return <p className="whitespace-pre-wrap text-[15px] text-ink">{text}</p>
}

const STATUS_VARIANT = { open: 'warning', asked: 'info', answered: 'good' } as const

export default function VisitDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { pid, records } = usePatient()
  const canEdit = useCanEdit()
  const { visits, loading } = useVisits()
  const { questions } = useQuestions()
  const [deleting, setDeleting] = useState(false)
  const visit = visits.find((v) => v.id === id)

  const linkedRecords = records
    .filter((r) => visit?.linkedRecordIds?.includes(r.id))
    .sort((a, b) => b.recordDate.localeCompare(a.recordDate))
  const linkedQuestions = questions.filter((q) => q.visitId === id || visit?.questionIds?.includes(q.id))
  const nextScheduled = visit?.nextVisitDate ? visits.some((v) => v.visitDate === visit.nextVisitDate) : true

  const handleDelete = async () => {
    if (!pid || !visit || !confirm('Delete this visit? Linked questions are kept.')) return
    setDeleting(true)
    try {
      await deleteVisit(pid, visit.id)
      router.replace('/visits')
    } catch (err) {
      console.error('Visit delete failed:', err)
      alert('Could not delete the visit. Please try again.')
      setDeleting(false)
    }
  }

  return (
    <>
      <Header
        title="Visit"
        showBack
        actions={
          canEdit && visit ? (
            <Link href={`/visits/${visit.id}/edit`} aria-label="Edit visit" className={iconButton}>
              <Pencil className="h-5 w-5" />
            </Link>
          ) : undefined
        }
      />
      <main className="px-4 py-5">
        {loading ? (
          <ListSkeleton rows={4} />
        ) : !visit ? (
          <p className="pt-16 text-center text-[15px] text-ink-2">This visit no longer exists.</p>
        ) : (
          <>
            <p className="eyebrow">{visit.purpose ? 'Visit' : 'Doctor visit'}</p>
            <h2 className="mt-1 font-serif text-[1.75rem] font-normal leading-tight tracking-[-.02em] text-ink tabular">
              {visitWhen(visit)}
            </h2>
            <p className="mt-1 text-[15px] text-ink-2">
              {[visit.doctorName, visit.hospital].filter(Boolean).join(', ') || 'Doctor not set'}
            </p>
            {visit.purpose && <p className="mt-1 text-sm text-ink-3">{visit.purpose}</p>}

            <div className="mt-5 flex flex-wrap gap-3">
              <Button onClick={() => router.push(`/visits/${visit.id}/prep`)}>
                <ClipboardList className="h-4 w-4" aria-hidden /> Visit prep
              </Button>
              {canEdit && visit.nextVisitDate && !nextScheduled && (
                <Button variant="secondary" onClick={() => router.push(`/visits/new?date=${visit.nextVisitDate}`)}>
                  <CalendarPlus className="h-4 w-4" aria-hidden /> Schedule next visit
                </Button>
              )}
            </div>

            <div className="mt-6">
              <Section title="Doctor’s advice"><Prose text={visit.advice} /></Section>
              <Section title="Dose changes"><Prose text={visit.doseChanges} /></Section>
              <Section title="Notes"><Prose text={visit.notes} /></Section>
              <Section title="Next visit">
                <p className="text-[15px] text-ink tabular">
                  {visit.nextVisitDate ? formatDate(visit.nextVisitDate, 'EEE d MMM yyyy') : '—'}
                </p>
              </Section>
              <Section title={`Reports reviewed (${linkedRecords.length})`}>
                {linkedRecords.length === 0 ? (
                  <p className="text-sm text-ink-3">None linked.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {linkedRecords.map((r) => (
                      <li key={r.id}>
                        <Link href={`/records/${r.id}`} className="tlink text-sm tabular">
                          {formatDate(r.recordDate, 'd MMM yyyy')} · {r.labName || 'Lab'}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
              <Section title={`Questions (${linkedQuestions.length})`}>
                {linkedQuestions.length === 0 ? (
                  <p className="text-sm text-ink-3">None linked.</p>
                ) : (
                  <ul className="space-y-3">
                    {linkedQuestions.map((q) => (
                      <li key={q.id}>
                        <div className="flex items-start gap-2">
                          <p className="flex-1 text-[15px] text-ink">{q.text}</p>
                          <Badge variant={STATUS_VARIANT[q.status]}>{q.status}</Badge>
                        </div>
                        {q.answer && <p className="mt-1 border-l-2 border-sage pl-3 text-sm text-ink-2">{q.answer}</p>}
                      </li>
                    ))}
                  </ul>
                )}
                <Link href="/questions" className="tlink mt-3 text-[13px]">Manage questions</Link>
              </Section>
            </div>

            {canEdit && (
              <div className="mt-6 border-t border-hair-2 pt-5">
                <Button variant="danger" size="sm" loading={deleting} onClick={handleDelete}>Delete visit</Button>
              </div>
            )}
          </>
        )}
      </main>
    </>
  )
}
