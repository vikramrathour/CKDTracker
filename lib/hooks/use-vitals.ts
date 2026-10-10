'use client'

import { usePatient } from '@/components/providers/patient-provider'
import { subscribeVitals } from '@/lib/firebase/vitals'
import type { Vital } from '@/lib/types/care'
import { useSubscription } from './use-subscription'

const EMPTY: Vital[] = []

/** The active patient's vitals, newest first, realtime. */
export function useVitals() {
  const { pid } = usePatient()
  const { data, loading, error } = useSubscription<Vital[]>(
    pid,
    (next, fail) => subscribeVitals(pid as string, next, fail),
    EMPTY,
    'Failed to load vitals'
  )
  return { vitals: data, loading, error }
}
