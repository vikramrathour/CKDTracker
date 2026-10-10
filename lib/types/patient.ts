/**
 * A person whose health is tracked. Lives at `patients/{pid}`.
 *
 * pid naming (enforced by firestore.rules):
 *   - your own profile:        pid = uid
 *   - someone you care for:    pid = `${uid}_${random}`
 *
 * Dates are strings in app code: date-only fields are `YYYY-MM-DD`;
 * `createdAt`/`updatedAt`/`migratedAt` are ISO timestamps converted from
 * Firestore Timestamps by the data layer.
 */
export type PatientRelationship = 'self' | 'family' | 'other'

export interface Patient {
  id: string
  ownerUid: string
  displayName: string
  relationship?: PatientRelationship
  /** YYYY-MM-DD */
  dateOfBirth?: string | null
  /** YYYY-MM-DD */
  transplantDate?: string | null
  doctorName?: string
  hospital?: string
  /** YYYY-MM-DD; drives the "lab test tomorrow" reminder (lib/server/notifications). */
  nextLabDate?: string | null
  createdAt?: string
  updatedAt?: string
  /** Set when the doc was created by scripts/migrate-to-patients.ts. */
  migratedAt?: string
}

/** Fields a client may set on create/update (mirrors `patientEditable()` in firestore.rules). */
export type PatientInput = Pick<
  Patient,
  'displayName' | 'relationship' | 'dateOfBirth' | 'transplantDate' | 'doctorName' | 'hospital' | 'nextLabDate'
>
