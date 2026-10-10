'use client'

import { usePatient } from '@/components/providers/patient-provider'
import type { LabRecord } from '@/lib/types/lab-record'

// Records arrive through PatientProvider's realtime subscription, so there is
// nothing to refetch; kept so callers can still `await refetch()`.
const refetch = async () => {}

/**
 * The active patient's lab records, sorted ascending by recordDate.
 * Backed by one onSnapshot subscription in PatientProvider (shared by all pages).
 */
export function useLabRecords(): {
  records: LabRecord[]
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
} {
  const { records, recordsLoading, recordsError } = usePatient()
  return { records, loading: recordsLoading, error: recordsError, refetch }
}

/**
 * Extract trend points for a specific test across all records.
 */
export function getTrendPoints(records: LabRecord[], testName: string) {
  return records
    .map((r) => {
      const val = r.values.find((v) => v.testName === testName)
      return val ? { date: r.recordDate, value: val.value } : null
    })
    .filter(Boolean) as { date: string; value: number }[]
}

/**
 * Get the value for a specific test from a record.
 */
export function getValueFromRecord(record: LabRecord, testName: string) {
  return record.values.find((v) => v.testName === testName)
}
