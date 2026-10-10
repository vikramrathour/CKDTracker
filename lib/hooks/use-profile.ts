'use client'

import { useMemo } from 'react'
import { usePatient } from '@/components/providers/patient-provider'

/**
 * Clinical profile of the ACTIVE PATIENT (not the signed-in account): name,
 * DOB, transplant date, doctor and hospital from patients/{pid}. Account-level
 * data (email, phone, sign-in methods) stays on users/{uid}; read it with
 * getUserProfile() in lib/firebase/firestore.ts.
 */
export interface UserProfile {
  fullName: string
  /** YYYY-MM-DD, or null when not set */
  dateOfBirth: string | null
  doctorName: string
  doctorHospital: string
  /** YYYY-MM-DD, or null when not set */
  transplantDate: string | null
}

export function useProfile(): { profile: UserProfile | null; loading: boolean } {
  const { activePatient, loading } = usePatient()
  const profile = useMemo<UserProfile | null>(
    () =>
      activePatient
        ? {
            fullName: activePatient.displayName,
            dateOfBirth: activePatient.dateOfBirth ?? null,
            doctorName: activePatient.doctorName ?? '',
            doctorHospital: activePatient.hospital ?? '',
            transplantDate: activePatient.transplantDate ?? null,
          }
        : null,
    [activePatient]
  )
  return { profile, loading }
}

/** Whole years between an ISO date of birth and today, or null if unparseable. */
export function ageFromDateOfBirth(dateOfBirth: string | null | undefined): number | null {
  if (!dateOfBirth) return null
  const dob = new Date(dateOfBirth)
  if (isNaN(dob.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - dob.getFullYear()
  const m = now.getMonth() - dob.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--
  return age >= 0 ? age : null
}
