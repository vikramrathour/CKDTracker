'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePatient } from '@/components/providers/patient-provider'
import { usePatientSubscription } from '@/components/records/use-patient-subscription'
import { useMedications } from '@/lib/hooks/use-medications'
import { subscribeVisits } from '@/lib/firebase/visits'
import { subscribeQuestions } from '@/lib/firebase/questions'
import { subscribeAlertInputs } from '@/lib/firebase/chat'
import { toTargetMap } from '@/lib/calculations/targets'
import { buildVisitPrep, visitAlerts, type VisitPrepSummary } from '@/lib/visits/prep'
import type { AlertRule, Target } from '@/lib/types/care'

export function useVisits() {
  const { items, loading, error } = usePatientSubscription(subscribeVisits, 'visits')
  return { visits: items, loading, error }
}

export function useQuestions() {
  const { items, loading, error } = usePatientSubscription(subscribeQuestions, 'questions')
  return { questions: items, loading, error }
}

/** Targets + alert rules (realtime). Missing/denied → empty, never blocks the page. */
function useAlertInputs() {
  const { pid } = usePatient()
  const [inputs, setInputs] = useState<{ targets: Target[]; alertRules: AlertRule[] }>({ targets: [], alertRules: [] })
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    setInputs({ targets: [], alertRules: [] })
    if (!pid) return
    setLoading(true)
    try {
      return subscribeAlertInputs(
        pid,
        (next) => {
          setInputs(next)
          setLoading(false)
        },
        () => setLoading(false)
      )
    } catch {
      setLoading(false)
      return undefined
    }
  }, [pid])
  return { ...inputs, loading }
}

/** Visit-prep summary for one visit, from live data. */
export function useVisitPrep(visitId: string | undefined): {
  summary: VisitPrepSummary | null
  loading: boolean
  notFound: boolean
} {
  const { records, recordsLoading } = usePatient()
  const { visits, loading: visitsLoading } = useVisits()
  const { questions, loading: questionsLoading } = useQuestions()
  const { medications, loading: medsLoading } = useMedications()
  const { targets, alertRules, loading: alertsLoading } = useAlertInputs()

  const loading = recordsLoading || visitsLoading || questionsLoading || medsLoading || alertsLoading
  const visit = visits.find((v) => v.id === visitId)

  const summary = useMemo(() => {
    if (!visit) return null
    return buildVisitPrep({
      visit,
      visits,
      records,
      medications,
      questions,
      targets: toTargetMap(targets),
      alerts: visitAlerts(records, visit.visitDate, targets, alertRules),
    })
  }, [visit, visits, records, medications, questions, targets, alertRules])

  return { summary, loading, notFound: !loading && !visit }
}
