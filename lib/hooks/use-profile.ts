'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/components/providers/auth-provider'
import { getUserProfile } from '@/lib/firebase/firestore'

export interface UserProfile {
  fullName: string
  /** ISO date string, or null when not set */
  dateOfBirth: string | null
  doctorName: string
  doctorHospital: string
  /** ISO date string, or null when not set */
  transplantDate: string | null
}

/** Profile date fields may be stored as Firestore Timestamps or strings. */
function toIsoDate(value: unknown): string | null {
  if (!value) return null
  if (typeof value === 'string') return value
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return (value.toDate() as Date).toISOString()
  }
  return null
}

function toStr(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function useProfile() {
  const { user } = useAuth()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) {
      setProfile(null)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    getUserProfile(user.uid)
      .then((data) => {
        if (cancelled) return
        if (!data) {
          setProfile(null)
          return
        }
        const raw = data as Record<string, unknown>
        setProfile({
          fullName: toStr(raw.fullName),
          dateOfBirth: toIsoDate(raw.dateOfBirth),
          doctorName: toStr(raw.doctorName),
          doctorHospital: toStr(raw.doctorHospital),
          transplantDate: toIsoDate(raw.transplantDate),
        })
      })
      .catch((err) => {
        console.error('Failed to load profile:', err)
        if (!cancelled) setProfile(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [user])

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
