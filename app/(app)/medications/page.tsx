'use client'

import { useState, useEffect } from 'react'
import { Header } from '@/components/layout/header'
import { CardSkeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/components/providers/auth-provider'
import { useProfile } from '@/lib/hooks/use-profile'
import { getMedications } from '@/lib/firebase/firestore'
import type { Medication } from '@/lib/types/medication'

const CATEGORY_COLORS: Record<string, string> = {
  Immunosuppressant: '#2d6a4f',
  Corticosteroid: '#2d6a4f',
  Antihypertensive: '#2563eb',
  'SGLT2 Inhibitor': '#2d6a4f',
  Cholesterol: '#7c3aed',
  Other: '#6b7280',
}

export default function MedicationsPage() {
  const { user } = useAuth()
  const { profile } = useProfile()
  const [medications, setMedications] = useState<Medication[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) {
      setMedications([])
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    getMedications(user.uid)
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
  }, [user])

  const doctorName = profile?.doctorName
  const doctorHospital = profile?.doctorHospital

  return (
    <>
      <Header title="Medications" />
      <main className="px-4 py-4">
        {loading ? (
          <CardSkeleton />
        ) : (
          <div className="bg-white rounded-xl p-4 border border-gray-100">
            <div className="text-[11px] uppercase tracking-wider text-gray-400 mb-4">
              Current Medications
              {doctorName ? ` — ${doctorName}` : ''}
              {doctorHospital ? `, ${doctorHospital}` : ''}
            </div>

            {error ? (
              <div className="text-sm text-red-500 py-6 text-center">{error}</div>
            ) : medications.length === 0 ? (
              <div className="text-sm text-gray-500 py-6 text-center">No medications added yet</div>
            ) : (
              medications.map((med, i) => (
                <div
                  key={med.id}
                  className="flex items-center gap-3 py-3"
                  style={{ borderTop: i > 0 ? '1px solid #f3f4f6' : 'none' }}
                >
                  <div
                    className="w-1 h-8 rounded-sm flex-shrink-0"
                    style={{ backgroundColor: CATEGORY_COLORS[med.category] || '#6b7280' }}
                  />
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-gray-900">{med.name} {med.dose}</div>
                    <div className="text-xs text-gray-500">{med.category} — {med.frequency}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </main>
    </>
  )
}
