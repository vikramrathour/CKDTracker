'use client'

import { usePatient } from '@/components/providers/patient-provider'
import {
  subscribeDoseHistory,
  subscribeMedication,
  subscribeMedications,
  type DoseHistoryEntry,
  type MedicationDoc,
} from '@/lib/firebase/medications'
import { useSubscription } from './use-subscription'

const NO_MEDS: MedicationDoc[] = []
const NO_HISTORY: DoseHistoryEntry[] = []

/** All of the active patient's medications (active first), realtime. */
export function useMedications() {
  const { pid } = usePatient()
  const { data, loading, error } = useSubscription<MedicationDoc[]>(
    pid,
    (next, fail) => subscribeMedications(pid as string, next, fail),
    NO_MEDS,
    'Failed to load medications'
  )
  return { medications: data, loading, error }
}

/** One medication, realtime (null when missing). */
export function useMedication(mid: string | null) {
  const { pid } = usePatient()
  const key = pid && mid ? `${pid}/${mid}` : null
  const { data, loading, error } = useSubscription<MedicationDoc | null>(
    key,
    (next, fail) => subscribeMedication(pid as string, mid as string, next, fail),
    null,
    'Failed to load medication'
  )
  return { medication: data, loading, error }
}

/** A medication's dose history, oldest first, realtime. */
export function useDoseHistory(mid: string | null) {
  const { pid } = usePatient()
  const key = pid && mid ? `${pid}/${mid}` : null
  const { data, loading, error } = useSubscription<DoseHistoryEntry[]>(
    key,
    (next, fail) => subscribeDoseHistory(pid as string, mid as string, next, fail),
    NO_HISTORY,
    'Failed to load dose history'
  )
  return { history: data, loading, error }
}
