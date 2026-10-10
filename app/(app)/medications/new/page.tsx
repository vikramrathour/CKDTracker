'use client'

import { useRouter } from 'next/navigation'
import { Header } from '@/components/layout/header'
import { ViewOnlyNotice } from '@/components/shared/view-only-notice'
import { MedicationForm } from '@/components/medications/medication-form'
import { useCanEdit, usePatient } from '@/components/providers/patient-provider'
import { useToast } from '@/components/providers/toast-provider'
import { addMedication } from '@/lib/firebase/medications'
import type { MedicationFormValues } from '@/components/medications/medication-schema'

export default function NewMedicationPage() {
  const router = useRouter()
  const { pid } = usePatient()
  const canEdit = useCanEdit()
  const { showToast } = useToast()

  const onSubmit = async (v: MedicationFormValues) => {
    if (!pid) return
    try {
      const id = await addMedication(pid, {
        name: v.name,
        dose: v.dose,
        frequency: v.frequency,
        category: v.category,
        timeOfDay: v.timeOfDay,
        prescribedBy: v.prescribedBy,
        notes: v.notes,
        startDate: v.startDate || null,
      })
      showToast('success', `${v.name} added`)
      router.replace(`/medications/${id}`)
    } catch (err) {
      console.error('Add medication failed', err)
      showToast('error', 'Could not add the medication. Check your connection and try again.')
    }
  }

  return (
    <>
      <Header title="Add medication" emphasis="medication" showBack />
      <main className="px-4 py-4">
        {canEdit ? (
          <MedicationForm medication={null} onSubmit={onSubmit} onCancel={() => router.back()} />
        ) : (
          <ViewOnlyNotice action="change medications" />
        )}
      </main>
    </>
  )
}
