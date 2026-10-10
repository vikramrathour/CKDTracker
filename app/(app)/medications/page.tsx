'use client'

import { useState, useEffect } from 'react'
import { Header } from '@/components/layout/header'
import { CardSkeleton } from '@/components/ui/skeleton'
import { usePatient } from '@/components/providers/patient-provider'
import { useProfile } from '@/lib/hooks/use-profile'
import { getMedications } from '@/lib/firebase/firestore'
import type { Medication } from '@/lib/types/medication'
import { cn } from '@/lib/utils'

// Category rule colour, drawn from the site palette.
const CATEGORY_COLORS: Record<string, string> = {
  Immunosuppressant: 'bg-sage',
  Corticosteroid: 'bg-sage',
  Antihypertensive: 'bg-ink',
  'SGLT2 Inhibitor': 'bg-sage',
  Cholesterol: 'bg-terra',
  Other: 'bg-ink-3',
}

export default function MedicationsPage() {
  const { pid } = usePatient()
  const { profile } = useProfile()
  const [medications, setMedications] = useState<Medication[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!pid) {
      setMedications([])
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    getMedications(pid)
      .then((meds) => {
        if (cancelled) return
        setMedications(meds.filter((m) => m.isActive !== false))
        setError(null)
      })
      .catch((err) => {
        console.error('Failed to load medications:', err)
        if (!cancelled) setError('Failed to load medications')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [pid])

  const doctorName = profile?.doctorName
  const doctorHospital = profile?.doctorHospital

  return (
    <>
      <Header title="Medications" />
      <main className="px-4 py-4">
        {loading ? (
          <CardSkeleton />
        ) : (
          <section className="rounded-card border border-hair bg-vellum px-4 pb-2 pt-4">
            <h2 className="label mb-2 text-ink-3">
              Current Medications
              {doctorName ? ` — ${doctorName}` : ''}
              {doctorHospital ? `, ${doctorHospital}` : ''}
            </h2>

            {error ? (
              <p role="alert" className="py-6 text-center text-sm text-critical">{error}</p>
            ) : medications.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-2">No medications added yet</p>
            ) : (
              <ul>
                {medications.map((med) => (
                  <li
                    key={med.id}
                    className="flex items-center gap-3 border-t border-hair py-3.5 first:border-t-0"
                  >
                    <span
                      aria-hidden
                      className={cn('h-9 w-[3px] flex-shrink-0 rounded-full', CATEGORY_COLORS[med.category] || 'bg-ink-3')}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="font-serif text-lg font-medium leading-snug tracking-[-.01em] text-ink">
                        {med.name} <span className="font-sans text-sm font-semibold text-ink-2 tabular">{med.dose}</span>
                      </div>
                      <div className="text-[13px] text-ink-3">{med.category} — {med.frequency}</div>
                    </div>
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
