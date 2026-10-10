'use client'

import { useParams, useRouter } from 'next/navigation'
import { Header } from '@/components/layout/header'
import { usePatient, useCanEdit } from '@/components/providers/patient-provider'
import { ViewOnlyNotice } from '@/components/shared/view-only-notice'
import { ListSkeleton } from '@/components/ui/skeleton'
import { useQuestions, useVisits } from '@/components/visits/hooks'
import { VisitForm, toVisitInput } from '@/components/visits/visit-form'
import { updateVisit } from '@/lib/firebase/visits'
import { syncVisitQuestions } from '@/lib/firebase/questions'

export default function EditVisitPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { pid } = usePatient()
  const canEdit = useCanEdit()
  const { visits, loading } = useVisits()
  const { questions, loading: qLoading } = useQuestions()
  const visit = visits.find((v) => v.id === id)

  return (
    <>
      <Header title="Edit Visit" emphasis="Visit" showBack />
      <main className="px-4 py-5">
        {!canEdit ? (
          <ViewOnlyNotice action="edit visits" />
        ) : loading || qLoading ? (
          <ListSkeleton rows={4} />
        ) : !visit ? (
          <p className="pt-16 text-center text-[15px] text-ink-2">This visit no longer exists.</p>
        ) : (
          <VisitForm
            initial={{
              ...visit,
              questionIds: Array.from(
                new Set([...(visit.questionIds ?? []), ...questions.filter((q) => q.visitId === visit.id).map((q) => q.id)])
              ),
            }}
            questions={questions}
            submitLabel="Save changes"
            onCancel={() => router.back()}
            onSubmit={async (values) => {
              if (!pid) return
              await updateVisit(pid, visit.id, toVisitInput(values))
              await syncVisitQuestions(pid, visit.id, values.questionIds, questions)
              router.replace(`/visits/${visit.id}`)
            }}
          />
        )}
      </main>
    </>
  )
}
