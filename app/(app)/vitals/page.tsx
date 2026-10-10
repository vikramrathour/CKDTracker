'use client'

import { useState } from 'react'
import { Header } from '@/components/layout/header'
import { ChartSkeleton, ListSkeleton } from '@/components/ui/skeleton'
import { useCanEdit } from '@/components/providers/patient-provider'
import { VitalForm } from '@/components/vitals/vital-form'
import { VitalFlags } from '@/components/vitals/vital-flags'
import { VitalsChart } from '@/components/vitals/vitals-chart'
import { VitalsList } from '@/components/vitals/vitals-list'
import { useVitals } from '@/lib/hooks/use-vitals'
import type { VitalFlag } from '@/lib/calculations/vitals'

export default function VitalsPage() {
  const canEdit = useCanEdit()
  const { vitals, loading, error } = useVitals()
  const [flags, setFlags] = useState<VitalFlag[]>([])

  return (
    <>
      <Header title="Vitals" emphasis="Vitals" subtitle="BP, weight, temperature and more" />
      <main className="space-y-3.5 px-4 py-4">
        {canEdit && (
          <section className="rounded-card border border-hair bg-vellum p-4">
            <h2 className="label mb-3 text-ink-3">New reading</h2>
            <VitalForm history={vitals} onSaved={setFlags} />
            <VitalFlags flags={flags} className="mt-3" />
          </section>
        )}

        {error && <p role="alert" className="text-center text-sm text-critical">{error}</p>}

        {loading ? (
          <>
            <ChartSkeleton />
            <ListSkeleton rows={3} />
          </>
        ) : (
          <>
            <VitalsChart vitals={vitals} />
            <VitalsList vitals={vitals} canEdit={canEdit} />
          </>
        )}

        <p className="pt-2 text-center font-serif text-sm italic leading-relaxed text-ink-2">
          Flags are simple prompts, not a diagnosis. If you feel unwell, call the transplant team.
        </p>
      </main>
    </>
  )
}
