'use client'

import { Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Header } from '@/components/layout/header'
import { usePatient, useCanEdit } from '@/components/providers/patient-provider'
import { ViewOnlyNotice } from '@/components/shared/view-only-notice'
import { useQuestions } from '@/components/visits/hooks'
import { VisitForm, toVisitInput } from '@/components/visits/visit-form'
import { addVisit } from '@/lib/firebase/visits'
import { syncVisitQuestions } from '@/lib/firebase/questions'

function NewVisit() {
  const router = useRouter()
  const params = useSearchParams()
  const { pid } = usePatient()
  const canEdit = useCanEdit()
  const { questions, loading } = useQuestions()
  const date = params.get('date')

  if (!canEdit) return <ViewOnlyNotice action="add visits" />
  if (loading) return null

  return (
    <VisitForm
      initial={{
        visitDate: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '',
        questionIds: questions.filter((q) => q.status === 'open' && !q.visitId).map((q) => q.id),
      }}
      questions={questions}
      submitLabel="Save visit"
      onCancel={() => router.back()}
      onSubmit={async (values) => {
        if (!pid) return
        const id = await addVisit(pid, toVisitInput(values))
        await syncVisitQuestions(pid, id, values.questionIds, questions)
        router.replace(`/visits/${id}`)
      }}
    />
  )
}

export default function NewVisitPage() {
  return (
    <>
      <Header title="New Visit" emphasis="Visit" showBack />
      <main className="px-4 py-5">
        <Suspense fallback={null}>
          <NewVisit />
        </Suspense>
      </main>
    </>
  )
}
