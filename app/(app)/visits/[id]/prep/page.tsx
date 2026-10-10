'use client'

import { useCallback, useState } from 'react'
import { useParams } from 'next/navigation'
import { Maximize2 } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { usePatient } from '@/components/providers/patient-provider'
import { Button } from '@/components/ui/button'
import { ListSkeleton } from '@/components/ui/skeleton'
import { useVisitPrep } from '@/components/visits/hooks'
import { PrepView } from '@/components/visits/prep-view'
import { DoctorMode } from '@/components/visits/doctor-mode'
import { PrepPdfActions } from '@/components/visits/prep-pdf-actions'
import { visitWhen } from '@/components/visits/visit-card'

export default function VisitPrepPage() {
  const { id } = useParams<{ id: string }>()
  const { pid, activePatient } = usePatient()
  const { summary, loading, notFound } = useVisitPrep(id)
  const [doctorMode, setDoctorMode] = useState(false)
  const closeDoctorMode = useCallback(() => setDoctorMode(false), [])

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

            <div className="mt-4 flex flex-wrap items-start gap-3">
              <Button onClick={() => setDoctorMode(true)}>
                <Maximize2 className="h-4 w-4" aria-hidden /> Doctor mode
              </Button>
              <PrepPdfActions pid={pid} visitId={summary.visit.id} visitDate={summary.visit.visitDate} />
            </div>

            <div className="mt-7">
              <PrepView summary={summary} />
            </div>

            {doctorMode && (
              <DoctorMode summary={summary} patientName={activePatient?.displayName ?? 'Patient'} onClose={closeDoctorMode} />
            )}
          </>
        )}
      </main>
    </>
  )
}
