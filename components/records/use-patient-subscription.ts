'use client'

import { useEffect, useState } from 'react'
import type { Unsubscribe } from 'firebase/firestore'
import { usePatient } from '@/components/providers/patient-provider'

/**
 * Realtime listing of one of the active patient's collections. `subscribe`
 * must be a stable module-level function (subscribeVisits, …).
 */
export function usePatientSubscription<T>(
  subscribe: (pid: string, onNext: (items: T[]) => void, onError: (err: Error) => void) => Unsubscribe,
  label: string
): { items: T[]; loading: boolean; error: string | null } {
  const { pid } = usePatient()
  const [items, setItems] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setItems([])
    setError(null)
    if (!pid) {
      setLoading(false)
      return
    }
    setLoading(true)
    return subscribe(
      pid,
      (next) => {
        setItems(next)
        setLoading(false)
      },
      (err) => {
        console.error(`${label} subscription failed:`, err)
        setError(`Could not load ${label}`)
        setLoading(false)
      }
    )
  }, [pid, subscribe, label])

  return { items, loading, error }
}
