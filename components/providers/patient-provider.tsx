'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/components/providers/auth-provider'
import {
  getActivePatientId,
  listMyPatients,
  setActivePatient as persistActivePatient,
} from '@/lib/firebase/patients'
import { subscribeLabRecords } from '@/lib/firebase/firestore'
import { roleAtLeast, type PatientMembership, type Role } from '@/lib/types/member'
import type { LabRecord } from '@/lib/types/lab-record'

/**
 * Which patient the app is showing, the caller's role on it, and that
 * patient's lab records (one realtime subscription shared by every page).
 *
 * Mounted by AppShell for everything under app/(app). With no memberships
 * the user is sent to /onboarding to create a profile.
 */
interface PatientContextValue {
  /** Every patient the user belongs to (own profile first). */
  patients: PatientMembership[]
  activePatient: PatientMembership | null
  pid: string | null
  role: Role | null
  /** Memberships still loading. */
  loading: boolean
  /** Memberships failed to load (e.g. offline or rules not deployed). */
  error: string | null
  setActivePatient: (pid: string) => Promise<void>
  /** Reload memberships (after creating/leaving a patient). */
  refreshPatients: () => Promise<PatientMembership[]>
  records: LabRecord[]
  recordsLoading: boolean
  recordsError: string | null
}

const PatientContext = createContext<PatientContextValue>({
  patients: [],
  activePatient: null,
  pid: null,
  role: null,
  loading: false,
  error: null,
  setActivePatient: async () => {},
  refreshPatients: async () => [],
  records: [],
  recordsLoading: false,
  recordsError: null,
})

export const ONBOARDING_PATH = '/onboarding'

export function PatientProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const uid = user?.uid ?? null
  const router = useRouter()
  const pathname = usePathname()

  const [patients, setPatients] = useState<PatientMembership[]>([])
  const [activePid, setActivePid] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [records, setRecords] = useState<LabRecord[]>([])
  const [recordsLoading, setRecordsLoading] = useState(true)
  const [recordsError, setRecordsError] = useState<string | null>(null)

  // Ignore results from a load started for a previous user.
  const loadSeq = useRef(0)
  // After the first successful load for a uid, refreshes are silent (no
  // full-screen spinner that would unmount the page that asked for them).
  const loadedFor = useRef<string | null>(null)

  const load = useCallback(async (): Promise<PatientMembership[]> => {
    if (!uid) {
      loadedFor.current = null
      setPatients([])
      setActivePid(null)
      setLoading(false)
      return []
    }
    const seq = ++loadSeq.current
    if (loadedFor.current !== uid) setLoading(true)
    try {
      const [list, storedActive] = await Promise.all([
        listMyPatients(uid),
        getActivePatientId(uid).catch(() => null),
      ])
      if (seq !== loadSeq.current) return list
      const chosen = list.find((p) => p.id === storedActive)?.id ?? list[0]?.id ?? null
      loadedFor.current = uid
      setPatients(list)
      setActivePid(chosen)
      setError(null)
      if (chosen && chosen !== storedActive) {
        persistActivePatient(chosen).catch((err) => console.warn('Could not save active patient', err))
      }
      return list
    } catch (err) {
      console.error('Failed to load patients:', err)
      if (seq === loadSeq.current) {
        setPatients([])
        setActivePid(null)
        setError('Could not load your profiles. Check your connection and try again.')
      }
      return []
    } finally {
      if (seq === loadSeq.current) setLoading(false)
    }
  }, [uid])

  useEffect(() => {
    load()
  }, [load])

  // No profiles yet → onboarding. Not on a load error: creating a profile
  // would fail the same way, and the user may already have data.
  useEffect(() => {
    if (!loading && !error && uid && patients.length === 0 && pathname !== ONBOARDING_PATH) {
      router.replace(ONBOARDING_PATH)
    }
  }, [loading, error, uid, patients.length, pathname, router])

  // One realtime subscription for the active patient's records.
  useEffect(() => {
    setRecords([])
    setRecordsError(null)
    if (!activePid) {
      setRecordsLoading(false)
      return
    }
    setRecordsLoading(true)
    const unsubscribe = subscribeLabRecords(
      activePid,
      (next) => {
        setRecords(next)
        setRecordsError(null)
        setRecordsLoading(false)
      },
      (err) => {
        console.error('Lab records subscription failed:', err)
        setRecordsError('Failed to load records')
        setRecordsLoading(false)
      }
    )
    return unsubscribe
  }, [activePid])

  const setActivePatient = useCallback(async (pid: string) => {
    setActivePid(pid)
    try {
      await persistActivePatient(pid)
    } catch (err) {
      console.warn('Could not save active patient', err)
    }
  }, [])

  const value = useMemo<PatientContextValue>(() => {
    const activePatient = patients.find((p) => p.id === activePid) ?? null
    return {
      patients,
      activePatient,
      pid: activePatient?.id ?? null,
      role: activePatient?.role ?? null,
      loading,
      error,
      setActivePatient,
      refreshPatients: load,
      records,
      recordsLoading,
      recordsError,
    }
  }, [patients, activePid, loading, error, setActivePatient, load, records, recordsLoading, recordsError])

  return <PatientContext.Provider value={value}>{children}</PatientContext.Provider>
}

export function usePatient(): PatientContextValue {
  return useContext(PatientContext)
}

/** The caller's role on the active patient (null while loading / none). */
export function useRole(): Role | null {
  return useContext(PatientContext).role
}

/** Owners and editors can add/edit/delete data; viewers are read-only. */
export function useCanEdit(): boolean {
  return roleAtLeast(useContext(PatientContext).role, 'editor')
}
