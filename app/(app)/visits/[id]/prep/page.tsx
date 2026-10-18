'use client'

import { useParams, useRouter } from 'next/navigation'
import { Stethoscope } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { usePatient } from '@/components/providers/patient-provider'
import { Button } from '@/components/ui/button'
import { ListSkeleton } from '@/components/ui/skeleton'
import { useVisitPrep } from '@/components/visits/hooks'
import { PrepView } from '@/components/visits/prep-view'
import { PrepPdfActions } from '@/components/visits/prep-pdf-actions'
import { visitWhen } from '@/components/visits/visit-card'

export default function VisitPrepPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { pid } = usePatient()
  const { summary, loading, notFound } = useVisitPrep(id)

  return (
    <>
      <Header title="Visit Prep" emphasis="Prep" showBack />
      <main className="px-4 py-5">
        {loading ? (
          <ListSkeleton rows={6} />
        ) : notFound || !summary || !pid ? (
          <p className="pt-16 text-center text-[15px] text-ink-2">This visit no longer exists.</p>
        ) : (
          <>
            <p className="eyebrow">Preparing for</p>
            <h2 className="mt-1 font-serif text-[1.625rem] font-normal leading-tight tracking-[-.02em] text-ink tabular">
              {visitWhen(summary.visit)}
            </h2>
            {(summary.visit.doctorName || summary.visit.hospital) && (
              <p className="text-sm text-ink-2">{[summary.visit.doctorName, summary.visit.hospital].filter(Boolean).join(', ')}</p>
            )}

            <div className="mt-5">
              <PrepView
                summary={summary}
                actions={
                  <div className="space-y-3">
                    <Button size="lg" className="w-full" onClick={() => router.push('/compare')}>
                      <Stethoscope className="h-5 w-5" aria-hidden /> Show doctor
                    </Button>
                    <PrepPdfActions pid={pid} visitId={summary.visit.id} visitDate={summary.visit.visitDate} />
                  </div>
                }
              />
            </div>
          </>
        )}
      </main>
    </>
  )
}
