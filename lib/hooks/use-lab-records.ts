'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/components/providers/auth-provider'
import { getLabRecords } from '@/lib/firebase/firestore'
import type { LabRecord } from '@/lib/types/lab-record'

export function useLabRecords() {
  const { user } = useAuth()
  const [records, setRecords] = useState<LabRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchRecords = useCallback(async () => {
    if (!user) {
      setRecords([])
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      const fetched = await getLabRecords(user.uid)
      setRecords(fetched.sort((a, b) => a.recordDate.localeCompare(b.recordDate)))
      setError(null)
    } catch (err) {
      console.error('Failed to fetch lab records:', err)
      setError('Failed to load records')
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    fetchRecords()
  }, [fetchRecords])

  return { records, loading, error, refetch: fetchRecords }
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
