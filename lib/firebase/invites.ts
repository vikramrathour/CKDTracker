import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore'
import { apiFetch } from '@/lib/api/client'
import { getDb, toIso } from './firestore'
import { forgetMemberNames } from './patients'
import type { ActivityEntry, InviteStatus } from '@/lib/types/care'
import type { Role } from '@/lib/types/member'

/**
 * Care-circle client helpers (Phase 4). Invites are server-only in
 * firestore.rules, so everything about them goes through /api/invites/**;
 * the activity feed is read straight from Firestore (viewers can read it).
 */

export type InviteRole = Exclude<Role, 'owner'>

/** Activity actions this feature writes on top of `ActivityAction` (lib/types/care.ts). */
export type CareActivityEntry = Omit<ActivityEntry, 'action'> & { action: string }

/** Owner's view of an outgoing invite (GET /api/invites?pid=). */
export interface OutgoingInvite {
  id: string
  pid: string
  patientName: string
  phoneE164: string
  role: InviteRole
  inviteeName: string | null
  invitedByName: string | null
  status: InviteStatus
  createdAt: string | null
  expiresAt: string | null
  url: string
}

/** An invite addressed to the signed-in user's phone (GET /api/invites/pending). */
export interface IncomingInvite {
  id: string
  pid: string
  patientName: string
  role: InviteRole
  invitedByName: string | null
  expiresAt: string | null
}

/** Public landing-page summary (GET /api/invites/{id}/summary). */
export interface InviteSummary {
  patientFirstName: string
  inviterFirstName: string
  role: InviteRole
  status: InviteStatus
  expiresAt: string | null
}

export interface CreatedInvite {
  inviteId: string
  url: string
  reused: boolean
  role: InviteRole
  expiresAt: string
}

export interface RedeemedInvite {
  pid: string
  patientName: string
  role: Role
  alreadyMember: boolean
}

/** An API error with the HTTP status (403 phone mismatch, 410 expired, …). */
export class InviteApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'InviteApiError'
    this.status = status
  }
}

async function json<T>(res: Response): Promise<T> {
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    // non-JSON (e.g. a proxy error page)
  }
  if (!res.ok) {
    const message =
      body && typeof body === 'object' && 'error' in body && typeof (body as { error: unknown }).error === 'string'
        ? (body as { error: string }).error
        : 'Something went wrong. Please try again.'
    throw new InviteApiError(res.status, message)
  }
  return body as T
}

const JSON_HEADERS = { 'Content-Type': 'application/json' }

// ---- owner

export async function createInvite(input: {
  pid: string
  phone: string
  role: InviteRole
  inviteeName?: string
}): Promise<CreatedInvite> {
  return json(await apiFetch('/api/invites', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(input) }))
}

export async function listInvites(pid: string): Promise<OutgoingInvite[]> {
  const { invites } = await json<{ invites: OutgoingInvite[] }>(await apiFetch(`/api/invites?pid=${encodeURIComponent(pid)}`))
  return invites
}

export async function revokeInvite(inviteId: string): Promise<void> {
  await json(await apiFetch(`/api/invites/${encodeURIComponent(inviteId)}`, { method: 'DELETE' }))
}

// ---- invitee

export async function listMyPendingInvites(): Promise<{ invites: IncomingInvite[]; hasPhone: boolean }> {
  return json(await apiFetch('/api/invites/pending'))
}

export async function redeemInvite(inviteId: string, displayName?: string): Promise<RedeemedInvite> {
  return json(
    await apiFetch('/api/invites/redeem', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ inviteId, ...(displayName ? { displayName } : {}) }),
    })
  )
}

/** No auth: works signed out. */
export async function getInviteSummary(inviteId: string): Promise<InviteSummary> {
  return json(await fetch(`/api/invites/${encodeURIComponent(inviteId)}/summary`, { cache: 'no-store' }))
}

// ---- members

/** Leave a care circle (server-side so the activity entry is written for viewers too). */
export async function leaveCareCircle(pid: string): Promise<void> {
  await json(await apiFetch('/api/members/leave', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ pid }) }))
}

/**
 * Set your own name (users/{uid}.fullName and every care-circle member doc
 * you hold). Server-side: members can't write their own member doc.
 */
export async function setMyName(displayName: string): Promise<{ displayName: string; updated: number }> {
  const result = await json<{ displayName: string; updated: number }>(
    await apiFetch('/api/members/me', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ displayName }) })
  )
  forgetMemberNames()
  return result
}

// ---- activity (patients/{pid}/activity, viewer-readable)

export async function listActivity(pid: string, max = 50): Promise<CareActivityEntry[]> {
  const snap = await getDocs(
    query(collection(getDb(), 'patients', pid, 'activity'), orderBy('createdAt', 'desc'), limit(max))
  )
  return snap.docs.map((d) => {
    const data = d.data()
    return {
      id: d.id,
      actorUid: String(data.actorUid ?? ''),
      actorName: typeof data.actorName === 'string' ? data.actorName : undefined,
      action: String(data.action ?? ''),
      targetType: typeof data.targetType === 'string' ? data.targetType : undefined,
      targetId: typeof data.targetId === 'string' ? data.targetId : undefined,
      summary: typeof data.summary === 'string' ? data.summary : undefined,
      createdAt: toIso(data.createdAt),
    }
  })
}

// ---- invite id carried across sign-in (sessionStorage)

const STORED_INVITE_KEY = 'ckd.pendingInviteId'

export function storePendingInviteId(inviteId: string): void {
  try {
    sessionStorage.setItem(STORED_INVITE_KEY, inviteId)
  } catch {
    // storage blocked: the invitee still sees the invite on onboarding (phone match)
  }
}

export function peekPendingInviteId(): string | null {
  try {
    return sessionStorage.getItem(STORED_INVITE_KEY)
  } catch {
    return null
  }
}

export function clearPendingInviteId(): void {
  try {
    sessionStorage.removeItem(STORED_INVITE_KEY)
  } catch {
    // ignore
  }
}
