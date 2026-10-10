'use client'

import { useEffect, useMemo, useState } from 'react'
import { collection, getDocs } from 'firebase/firestore'
import { usePatient } from '@/components/providers/patient-provider'
import { useQuestions, useVisits } from '@/components/visits/hooks'
import { useDocuments } from '@/components/documents/shared'
import { useMedications } from '@/lib/hooks/use-medications'
import { getDb, toIso } from '@/lib/firebase/firestore'
import { buildTimeline, type TimelineItem } from '@/lib/timeline/build'
import { todayYmd } from '@/lib/visits/types'
import type { DoseChange } from '@/lib/types/care'

/**
 * Dose changes across all medications. firestore.rules match doseHistory per
 * medication (no collection-group rule), so read each medication's history.
 */
function useAllDoseChanges(meds: { id: string; name: string }[]) {
  const { pid } = usePatient()
  const [changes, setChanges] = useState<(DoseChange & { medicationName?: string })[]>([])
  const [loading, setLoading] = useState(true)
  const key = meds.map((m) => `${m.id}:${m.name}`).join('|')

  useEffect(() => {
    if (!pid) return
    let cancelled = false
    setLoading(true)
    Promise.all(
      meds.map((m) =>
        getDocs(collection(getDb(), 'patients', pid, 'medications', m.id, 'doseHistory'))
          .then((snap) =>
            snap.docs.map((d) => ({
              ...(d.data() as DoseChange),
              id: d.id,
              medicationId: m.id,
              medicationName: m.name,
              createdAt: toIso(d.data().createdAt),
            }))
          )
          .catch(() => [])
      )
    ).then((lists) => {
      if (cancelled) return
      setChanges(lists.flat())
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on ids+names
  }, [pid, key])

  return { changes, loading }
}

export function useTimeline(): { items: TimelineItem[]; loading: boolean } {
  const { records, recordsLoading } = usePatient()
  const { visits, loading: vl } = useVisits()
  const { questions, loading: ql } = useQuestions()
  const { documents, loading: dl } = useDocuments()
  const { medications, loading: ml } = useMedications()
  const { changes, loading: cl } = useAllDoseChanges(medications)

  const items = useMemo(
    () => buildTimeline({ records, visits, questions, documents, doseChanges: changes, today: todayYmd() }),
    [records, visits, questions, documents, changes]
  )
  return { items, loading: recordsLoading || vl || ql || dl || ml || (medications.length > 0 && cl) }
}
