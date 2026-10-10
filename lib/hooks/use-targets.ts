'use client'

import { useMemo } from 'react'
import { usePatient } from '@/components/providers/patient-provider'
import { subscribeTargets } from '@/lib/firebase/targets'
import { toTargetMap, type TargetMap } from '@/lib/calculations/targets'
import type { Target } from '@/lib/types/care'
import { useSubscription } from './use-subscription'

const EMPTY: Target[] = []

/** The active patient's targets (realtime), as a list and as a map keyed by testName for resolveRange(). */
export function useTargets(): { targets: Target[]; targetMap: TargetMap; loading: boolean; error: string | null } {
  const { pid } = usePatient()
  const { data, loading, error } = useSubscription<Target[]>(
    pid,
    (next, fail) => subscribeTargets(pid as string, next, fail),
    EMPTY,
    'Failed to load targets'
  )
  const targetMap = useMemo(() => toTargetMap(data), [data])
  return { targets: data, targetMap, loading, error }
}
