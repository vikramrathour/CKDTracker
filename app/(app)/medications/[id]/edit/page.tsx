'use client'

import { useParams, useRouter } from 'next/navigation'
import { Header } from '@/components/layout/header'
import { CardSkeleton } from '@/components/ui/skeleton'
import { ViewOnlyNotice } from '@/components/shared/view-only-notice'
import { MedicationForm } from '@/components/medications/medication-form'
import { todayISODate, type MedicationFormValues } from '@/components/medications/medication-schema'
import { useCanEdit, usePatient } from '@/components/providers/patient-provider'
import { useToast } from '@/components/providers/toast-provider'
import { useMedication } from '@/lib/hooks/use-medications'
import { updateMedication } from '@/lib/firebase/medications'

export default function EditMedicationPage() {
  const params = useParams<{ id: string }>()
  const mid = typeof params?.id === 'string' ? params.id : null
  const router = useRouter()
  const { pid } = usePatient()
  const canEdit = useCanEdit()
  const { showToast } = useToast()
  const { medication, loading, error } = useMedication(mid)

  const onSubmit = async (v: MedicationFormValues) => {
    if (!pid || !medication) return
    try {
      const { doseChanged } = await updateMedication(
        pid,
        medication,
        {
          name: v.name,
          dose: v.dose,
          frequency: v.frequency,
          category: v.category,
          timeOfDay: v.timeOfDay,
          prescribedBy: v.prescribedBy,
          notes: v.notes,
          startDate: v.startDate || null,
        },
        { effectiveDate: v.changeDate || todayISODate(), reason: v.changeReason }
      )
      showToast('success', doseChanged ? 'Dose change saved' : 'Saved')
      router.replace(`/medications/${medication.id}`)
    } catch (err) {
      console.error('Update medication failed', err)
      showToast('error', 'Could not save. Check your connection and try again.')
    }
  }

  return (
    <>
      <Header title="Edit medication" emphasis="medication" showBack />
      <main className="px-4 py-4">
        {!canEdit ? (
          <ViewOnlyNotice action="change medications" />
        ) : loading ? (
          <CardSkeleton />
        ) : error || !medication ? (
          <p role="alert" className="py-6 text-center text-sm text-critical">{error ?? 'Medication not found.'}</p>
        ) : (
          // key: re-mount with fresh defaults if the doc changes underneath.
          <MedicationForm key={medication.id} medication={medication} onSubmit={onSubmit} onCancel={() => router.back()} />
        )}
      </main>
    </>
  )
}
