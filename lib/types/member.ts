import type { Patient } from './patient'

/**
 * Care-circle membership. Lives at `patients/{pid}/members/{uid}` (doc id == uid).
 * A user's patients are listed with a collection-group query on `members`
 * where `uid == me`.
 *
 * - owner:  exactly one per patient (created with the patient; immutable, undeletable)
 * - editor: read + write data (records, medications, visits, …)
 * - viewer: read only
 */
export type Role = 'owner' | 'editor' | 'viewer'

export const ROLE_RANK: Record<Role, number> = { viewer: 1, editor: 2, owner: 3 }

export function roleAtLeast(role: Role | null | undefined, min: Role): boolean {
  return role != null && ROLE_RANK[role] >= ROLE_RANK[min]
}

export interface Member {
  uid: string
  role: Role
  displayName: string
  /** E.164, when known (phone sign-in or invite). */
  phone?: string | null
  /** uid of whoever added this member (the owner themselves for the owner doc). */
  addedBy: string
  addedAt?: string
}

/** A patient the signed-in user belongs to, with their role on it. */
export interface PatientMembership extends Patient {
  role: Role
}
