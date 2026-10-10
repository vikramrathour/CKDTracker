import type { LabRecord } from '@/lib/types/lab-record'
import type { MedicationCategory } from '@/lib/types/medication'

export interface DefaultMedication {
  name: string
  dose: string
  frequency: string
  category: MedicationCategory
  timeOfDay: ('morning' | 'evening')[]
  prescribedBy: string
}

/**
 * Patient-specific data, imported via the `@personal-data` alias.
 * Resolves to `lib/personal/local.ts` (gitignored, real data) when present,
 * otherwise to `lib/personal/sample.ts` (synthetic, committed).
 */
export interface PersonalData {
  doctorName: string
  doctorHospital: string
  /** Written to Firestore on first login when the user has no records. */
  seedRecords: Omit<LabRecord, 'id' | 'createdAt' | 'updatedAt'>[]
  medications: DefaultMedication[]
}
