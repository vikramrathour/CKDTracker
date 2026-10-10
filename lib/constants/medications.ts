import { PERSONAL_DATA } from '@personal-data'

export type { DefaultMedication } from '@/lib/personal/types'

/**
 * Current prescription list, from the gitignored lib/personal/local.ts
 * (synthetic fallback in sample.ts).
 */
export const DEFAULT_MEDICATIONS = PERSONAL_DATA.medications

export const DOCTOR_NAME = PERSONAL_DATA.doctorName
export const DOCTOR_HOSPITAL = PERSONAL_DATA.doctorHospital
