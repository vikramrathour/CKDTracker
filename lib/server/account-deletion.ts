import type { Role } from '@/lib/types/member'

/**
 * Pure decision for "Delete my account" (Play Store requirement). No
 * server-only import so tests can load it; the Admin I/O lives in
 * app/api/account/delete/route.ts.
 *
 * - Circles where the user is an editor/viewer: they leave.
 * - Patients they own with nobody else in the circle: deleted with all data.
 * - Patients they own that other people still belong to: the whole request is
 *   refused (ownership transfer isn't implemented), so nothing is half-deleted.
 */

export const DELETE_CONFIRMATION = 'DELETE'

export interface MembershipInfo {
  pid: string
  role: Role
  displayName?: string
  /** Members in the circle, including the user. */
  memberCount: number
}

export interface DeletionPlan {
  ok: boolean
  leave: string[]
  deletePatients: string[]
  blocked: { pid: string; displayName: string; otherMembers: number }[]
}

export function planAccountDeletion(memberships: MembershipInfo[]): DeletionPlan {
  const plan: DeletionPlan = { ok: true, leave: [], deletePatients: [], blocked: [] }
  for (const m of memberships) {
    if (m.role !== 'owner') {
      plan.leave.push(m.pid)
    } else if (m.memberCount > 1) {
      plan.blocked.push({ pid: m.pid, displayName: m.displayName || 'A patient profile', otherMembers: m.memberCount - 1 })
    } else {
      plan.deletePatients.push(m.pid)
    }
  }
  plan.ok = plan.blocked.length === 0
  return plan
}

/** User-facing explanation for a refused deletion (no medical data). */
export function blockedMessage(plan: DeletionPlan): string {
  const names = plan.blocked.map((b) => b.displayName).join(', ')
  return (
    `You own ${plan.blocked.length === 1 ? 'a profile' : 'profiles'} other people still use (${names}). ` +
    'Remove the other members in Care circle first, then delete your account. ' +
    'Transferring ownership isn’t supported yet.'
  )
}
