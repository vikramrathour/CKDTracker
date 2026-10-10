'use client'

import { useEffect, useState } from 'react'
import type { Unsubscribe } from 'firebase/firestore'

/**
 * Generic realtime subscription state. `subscribe` is called whenever `key`
 * changes (pass null to idle, e.g. no active patient). Data resets on key change.
 */
export function useSubscription<T>(
  key: string | null,
  subscribe: (onNext: (data: T) => void, onError: (err: Error) => void) => Unsubscribe,
  initial: T,
  errorMessage = 'Failed to load'
): { data: T; loading: boolean; error: string | null } {
  const [state, setState] = useState<{ key: string | null; data: T; loading: boolean; error: string | null }>({
    key,
    data: initial,
    loading: key != null,
    error: null,
  })

  useEffect(() => {
    if (key == null) {
      setState({ key, data: initial, loading: false, error: null })
      return
    }
    setState({ key, data: initial, loading: true, error: null })
    let unsub: Unsubscribe | undefined
    try {
      unsub = subscribe(
        (data) => setState({ key, data, loading: false, error: null }),
        (err) => {
          console.error(errorMessage, err)
          setState((s) => ({ ...s, key, loading: false, error: errorMessage }))
        }
      )
    } catch (err) {
      console.error(errorMessage, err)
      setState({ key, data: initial, loading: false, error: errorMessage })
    }
    return () => unsub?.()
    // `subscribe`/`initial` are expected to be stable for a given key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  // While the effect for a new key hasn't run yet, don't show the old key's data.
  if (state.key !== key) return { data: initial, loading: key != null, error: null }
  return { data: state.data, loading: state.loading, error: state.error }
}
