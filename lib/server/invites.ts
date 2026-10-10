/**
 * Care-circle invites (Phase 4): the logic behind /api/invites/**.
 *
 *   invites/{id}  { pid, patientName, phoneE164, role, inviteeName?, invitedBy,
 *                   invitedByName, status, createdAt, expiresAt, acceptedBy?,
 *                   acceptedAt?, revokedBy?, revokedAt? }        server-only (rules deny clients)
 *
 * Every function takes the Admin Firestore instance and an `InviteActor`
 * (the verified caller) so the emulator suite (tests/rules/invites.test.ts)
 * can drive it without Next or `server-only`. Route handlers do the auth
 * (requireUser / requireMember) and pass the decoded token in.
 *
 * Server code only: imports firebase-admin. Never import this from a client
 * component.
 */
import { FieldValue, Timestamp, type Firestore, type DocumentData } from 'firebase-admin/firestore'
import { isPhoneLike, maskPhone, memberLabel, normalizeIndianPhone } from '@/lib/phone'
import type { Role } from '@/lib/types/member'
import type { ActivityAction, InviteStatus } from '@/lib/types/care'

export const INVITE_TTL_DAYS = 7
export const INVITE_TTL_MS = INVITE_TTL_DAYS * 24 * 60 * 60 * 1000

export type InviteRole = Exclude<Role, 'owner'>
export const INVITE_ROLES: readonly InviteRole[] = ['editor', 'viewer']

/**
 * Activity actions written by this module. `member.invited` and
 * `invite.revoked` are not (yet) in `ActivityAction` in lib/types/care.ts.
 */
export type CareActivityAction = ActivityAction | 'member.invited' | 'invite.revoked'

/** The verified caller, from the decoded ID token. */
export interface InviteActor {
  uid: string
  /** `phone_number` claim (E.164), present for phone sign-in / linked phone. */
  phone?: string | null
  /** `name` claim. */
  name?: string | null
}

/** Mirrors lib/server/auth.ts HttpError, kept local so this module has no `server-only` import. */
export class InviteError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'InviteError'
    this.status = status
  }
}

// ------------------------------------------------------------------ pure helpers

export function isInviteRole(value: unknown): value is InviteRole {
  return value === 'editor' || value === 'viewer'
}

/** Firestore auto-ids are 20 [A-Za-z0-9]; accept that shape only. */
export function isValidInviteId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9]{12,40}$/.test(value)
}

/** Both normalized as Indian mobiles and equal. A missing token phone never matches. */
export function phonesMatch(tokenPhone: string | null | undefined, invitePhone: string | null | undefined): boolean {
  if (!tokenPhone || !invitePhone) return false
  const a = normalizeIndianPhone(tokenPhone)
  const b = normalizeIndianPhone(invitePhone)
  return a !== null && a === b
}

export function inviteExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + INVITE_TTL_MS)
}

export function isExpired(expiresAt: Date | null | undefined, now: Date = new Date()): boolean {
  return !expiresAt || expiresAt.getTime() <= now.getTime()
}

/** Stored status, with `pending` past its expiry reported as `expired`. */
export function effectiveStatus(status: InviteStatus, expiresAt: Date | null | undefined, now: Date = new Date()): InviteStatus {
  return status === 'pending' && isExpired(expiresAt, now) ? 'expired' : status
}

/** `+919999900001` → `+91 ••••• •••01` (only the last two digits, for error hints). */
export function phoneHint(e164: string | null | undefined): string {
  const digits = (e164 ?? '').replace(/\D/g, '')
  if (digits.length < 4) return 'another number'
  const last2 = digits.slice(-2)
  if (digits.length === 12 && digits.startsWith('91')) return `+91 ••••• •••${last2}`
  return `a number ending ${last2}`
}

/**
 * First word of a name, for the public invite summary. A phone number is
 * never a name ('' instead); a "Member ••01" label is kept whole.
 */
export function firstName(name: string | null | undefined): string {
  const s = (name ?? '').trim()
  if (isPhoneLike(s)) return ''
  if (/^Member ••\d{2}$/.test(s)) return s
  const word = s.split(/\s+/)[0] ?? ''
  return word.slice(0, 40)
}

function cleanName(value: unknown, max = 100): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : ''
}

/** First candidate that is a real name (not empty, not a phone number), else "Member ••01" / 'Someone'. */
export function personName(candidates: unknown[], phone: string | null | undefined): string {
  for (const c of candidates) {
    const name = cleanName(c)
    if (name && !isPhoneLike(name)) return name
  }
  return memberLabel(phone)
}

function toDate(value: unknown): Date | null {
  if (value instanceof Timestamp) return value.toDate()
  if (value instanceof Date) return value
  if (typeof value === 'string') {
    const d = new Date(value)
    return isNaN(d.getTime()) ? null : d
  }
  return null
}

function iso(value: unknown): string | null {
  return toDate(value)?.toISOString() ?? null
}

// ------------------------------------------------------------------ views

/** What the owner sees in the pending-invites list. */
export interface InviteView {
  id: string
  pid: string
  patientName: string
  phoneE164: string
  role: InviteRole
  inviteeName: string | null
  invitedBy: string
  invitedByName: string | null
  status: InviteStatus
  createdAt: string | null
  expiresAt: string | null
}

/** What an invitee sees (no phone; they already know their own). */
export interface IncomingInviteView {
  id: string
  pid: string
  patientName: string
  role: InviteRole
  invitedByName: string | null
  expiresAt: string | null
}

/** Public, signed-out landing page: first names, role and status only. */
export interface InviteSummary {
  patientFirstName: string
  inviterFirstName: string
  role: InviteRole
  status: InviteStatus
  expiresAt: string | null
}

function inviteView(id: string, d: DocumentData, now: Date): InviteView {
  return {
    id,
    pid: String(d.pid),
    patientName: String(d.patientName ?? ''),
    phoneE164: String(d.phoneE164 ?? ''),
    role: isInviteRole(d.role) ? d.role : 'viewer',
    inviteeName: typeof d.inviteeName === 'string' && d.inviteeName ? d.inviteeName : null,
    invitedBy: String(d.invitedBy ?? ''),
    invitedByName: typeof d.invitedByName === 'string' ? d.invitedByName : null,
    status: effectiveStatus(d.status as InviteStatus, toDate(d.expiresAt), now),
    createdAt: iso(d.createdAt),
    expiresAt: iso(d.expiresAt),
  }
}

// ------------------------------------------------------------------ activity

function activityDoc(actor: InviteActor, actorName: string, action: CareActivityAction, extra: Record<string, unknown>) {
  const entry: Record<string, unknown> = {
    actorUid: actor.uid,
    actorName: actorName.slice(0, 100),
    action,
    createdAt: FieldValue.serverTimestamp(),
  }
  for (const [k, v] of Object.entries(extra)) if (v !== undefined && v !== null) entry[k] = v
  return entry
}

async function memberName(db: Firestore, pid: string, actor: InviteActor): Promise<string> {
  const snap = await db.doc(`patients/${pid}/members/${actor.uid}`).get()
  return personName([snap.exists ? snap.get('displayName') : null, actor.name], actor.phone)
}

// ------------------------------------------------------------------ owner: create / list / revoke

export interface CreateInviteInput {
  pid: string
  phone: string
  role: unknown
  /** Optional name the owner gives the invitee ("Rahul (son)"), used as their display name. */
  inviteeName?: unknown
}

export interface CreateInviteResult {
  inviteId: string
  /** True when an existing pending invite for this number was refreshed instead. */
  reused: boolean
  phoneE164: string
  role: InviteRole
  expiresAt: string
}

/**
 * Create (or refresh) an invite. The caller must already be verified as the
 * owner of `pid` (requireMember(…, 'owner')).
 *
 * - Rejects your own number and numbers already in the circle (409).
 * - A pending invite for the same number on the same patient is reused: same
 *   id (so a link already shared keeps working), role/name updated, expiry
 *   pushed out another 7 days.
 */
export async function createInvite(
  db: Firestore,
  actor: InviteActor,
  input: CreateInviteInput,
  now: Date = new Date()
): Promise<CreateInviteResult> {
  if (!isInviteRole(input.role)) throw new InviteError(400, 'Role must be editor or viewer')
  const phoneE164 = normalizeIndianPhone(input.phone)
  if (!phoneE164) throw new InviteError(400, 'Enter a 10-digit Indian mobile number')
  const role = input.role
  const inviteeName = cleanName(input.inviteeName, 60)

  if (phonesMatch(actor.phone, phoneE164)) throw new InviteError(400, 'That’s your own number')

  const patient = await db.doc(`patients/${input.pid}`).get()
  if (!patient.exists) throw new InviteError(404, 'Profile not found')
  const patientName = cleanName(patient.get('displayName')) || 'Patient'

  // Member docs only hold a masked phone, so "already in the circle" is
  // answered from the (server-only) invites this number accepted whose
  // acceptor is still a member.
  const accepted = await db
    .collection('invites')
    .where('pid', '==', input.pid)
    .where('phoneE164', '==', phoneE164)
    .where('status', '==', 'accepted')
    .get()
  for (const d of accepted.docs) {
    const by = d.get('acceptedBy')
    if (typeof by === 'string' && by && (await db.doc(`patients/${input.pid}/members/${by}`).get()).exists) {
      throw new InviteError(409, 'This number is already in the care circle')
    }
  }

  const invitedByName = await memberName(db, input.pid, actor)
  const expiresAt = inviteExpiry(now)

  const pending = await db
    .collection('invites')
    .where('pid', '==', input.pid)
    .where('phoneE164', '==', phoneE164)
    .where('status', '==', 'pending')
    .get()
  const reusable = pending.docs.find((d) => !isExpired(toDate(d.get('expiresAt')), now))

  const ref = reusable ? reusable.ref : db.collection('invites').doc()
  const batch = db.batch()
  if (reusable) {
    batch.update(ref, {
      role,
      inviteeName: inviteeName || FieldValue.delete(),
      patientName,
      invitedBy: actor.uid,
      invitedByName,
      expiresAt: Timestamp.fromDate(expiresAt),
      updatedAt: FieldValue.serverTimestamp(),
    })
  } else {
    // Expired leftovers for the same number: mark them so lists stay clean.
    for (const d of pending.docs) batch.update(d.ref, { status: 'expired' })
    batch.set(ref, {
      pid: input.pid,
      patientName,
      phoneE164,
      role,
      ...(inviteeName ? { inviteeName } : {}),
      invitedBy: actor.uid,
      invitedByName,
      status: 'pending',
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromDate(expiresAt),
    })
  }
  batch.set(
    db.collection(`patients/${input.pid}/activity`).doc(),
    activityDoc(actor, invitedByName, 'member.invited', {
      targetType: 'invite',
      targetId: ref.id,
      summary: `Invited ${inviteeName || 'someone'} as ${role === 'editor' ? 'an editor' : 'a viewer'}`,
    })
  )
  await batch.commit()

  return { inviteId: ref.id, reused: Boolean(reusable), phoneE164, role, expiresAt: expiresAt.toISOString() }
}

/** Owner: the patient's invites that are still pending (expired ones included, flagged). */
export async function listInvitesForPatient(db: Firestore, pid: string, now: Date = new Date()): Promise<InviteView[]> {
  const snap = await db.collection('invites').where('pid', '==', pid).where('status', '==', 'pending').get()
  return snap.docs
    .map((d) => inviteView(d.id, d.data(), now))
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
}

/** Load an invite (404 when missing). */
export async function getInvite(db: Firestore, inviteId: string): Promise<InviteView> {
  if (!isValidInviteId(inviteId)) throw new InviteError(404, 'Invite not found')
  const snap = await db.doc(`invites/${inviteId}`).get()
  if (!snap.exists) throw new InviteError(404, 'Invite not found')
  return inviteView(snap.id, snap.data()!, new Date())
}

/**
 * Owner revokes a pending invite. The route already checks ownership; this
 * re-checks it (defence in depth): only the current owner of `invite.pid`
 * may revoke, anyone else gets 403 (and 404 for an unknown invite).
 */
export async function revokeInvite(db: Firestore, actor: InviteActor, inviteId: string): Promise<void> {
  if (!isValidInviteId(inviteId)) throw new InviteError(404, 'Invite not found')
  const ref = db.doc(`invites/${inviteId}`)
  const snap = await ref.get()
  if (!snap.exists) throw new InviteError(404, 'Invite not found')
  const pid = String(snap.get('pid') ?? '')
  const me = pid && !pid.includes('/') ? await db.doc(`patients/${pid}/members/${actor.uid}`).get() : null
  if (!me?.exists || me.get('role') !== 'owner') throw new InviteError(403, 'Only the owner can cancel invites')
  const status = snap.get('status') as InviteStatus
  if (status === 'accepted') throw new InviteError(409, 'This invite was already accepted. Remove the member instead.')
  if (status === 'revoked') return
  const name = await memberName(db, pid, actor)
  const batch = db.batch()
  batch.update(ref, { status: 'revoked', revokedBy: actor.uid, revokedAt: FieldValue.serverTimestamp() })
  batch.set(
    db.collection(`patients/${pid}/activity`).doc(),
    activityDoc(actor, name, 'invite.revoked', {
      targetType: 'invite',
      targetId: inviteId,
      summary: snap.get('inviteeName') ? `Cancelled the invite for ${snap.get('inviteeName')}` : 'Cancelled an invite',
    })
  )
  await batch.commit()
}

// ------------------------------------------------------------------ invitee: summary / pending / redeem

/** Public summary for the signed-out landing page. No phone, no medical data. */
export async function getInviteSummary(db: Firestore, inviteId: string, now: Date = new Date()): Promise<InviteSummary> {
  if (!isValidInviteId(inviteId)) throw new InviteError(404, 'Invite not found')
  const snap = await db.doc(`invites/${inviteId}`).get()
  if (!snap.exists) throw new InviteError(404, 'Invite not found')
  const d = snap.data()!
  return {
    patientFirstName: firstName(d.patientName) || 'someone',
    inviterFirstName: firstName(d.invitedByName) || 'Someone',
    role: isInviteRole(d.role) ? d.role : 'viewer',
    status: effectiveStatus(d.status as InviteStatus, toDate(d.expiresAt), now),
    expiresAt: iso(d.expiresAt),
  }
}

/**
 * Invites sent to the caller's verified phone number that are pending,
 * unexpired, and for a patient they don't already belong to.
 */
export async function listPendingForActor(db: Firestore, actor: InviteActor, now: Date = new Date()): Promise<IncomingInviteView[]> {
  const phone = actor.phone ? normalizeIndianPhone(actor.phone) : null
  if (!phone) return []
  const snap = await db.collection('invites').where('phoneE164', '==', phone).where('status', '==', 'pending').get()
  const live = snap.docs.filter((d) => !isExpired(toDate(d.get('expiresAt')), now))

  const results = await Promise.all(
    live.map(async (d) => {
      const pid = String(d.get('pid'))
      const member = await db.doc(`patients/${pid}/members/${actor.uid}`).get()
      if (member.exists) return null
      const v = inviteView(d.id, d.data(), now)
      return { id: v.id, pid: v.pid, patientName: v.patientName, role: v.role, invitedByName: v.invitedByName, expiresAt: v.expiresAt }
    })
  )
  return results
    .filter((r): r is IncomingInviteView => r !== null)
    .sort((a, b) => (a.expiresAt ?? '').localeCompare(b.expiresAt ?? ''))
}

export interface RedeemResult {
  pid: string
  patientName: string
  role: Role
  /** The caller was already in this circle; nothing changed except the invite. */
  alreadyMember: boolean
}

/**
 * Accept an invite in one transaction:
 *   token phone == invite.phoneE164, status pending, not expired →
 *   create patients/{pid}/members/{uid}, mark the invite accepted, log
 *   `member.added`, and set users/{uid}.activePatientId when unset.
 *
 * Re-redeeming an invite you already accepted returns the same result
 * (idempotent, so a double tap or a stale stored invite id is harmless).
 */
export async function redeemInvite(
  db: Firestore,
  actor: InviteActor,
  inviteId: string,
  opts: { displayName?: unknown; now?: Date } = {}
): Promise<RedeemResult> {
  if (!isValidInviteId(inviteId)) throw new InviteError(404, 'Invite not found')
  const now = opts.now ?? new Date()
  const inviteRef = db.doc(`invites/${inviteId}`)

  return db.runTransaction(async (tx) => {
    const inviteSnap = await tx.get(inviteRef)
    if (!inviteSnap.exists) throw new InviteError(404, 'Invite not found')
    const inv = inviteSnap.data()!
    const pid = String(inv.pid)
    const status = inv.status as InviteStatus

    if (status === 'accepted') {
      if (inv.acceptedBy === actor.uid) {
        const m = await tx.get(db.doc(`patients/${pid}/members/${actor.uid}`))
        if (m.exists) {
          return { pid, patientName: String(inv.patientName ?? ''), role: m.get('role') as Role, alreadyMember: true }
        }
      }
      throw new InviteError(410, 'This invite has already been used. Ask for a new one.')
    }
    if (status === 'revoked') throw new InviteError(410, 'This invite was cancelled. Ask for a new one.')
    if (status !== 'pending' || isExpired(toDate(inv.expiresAt), now)) {
      throw new InviteError(410, 'This invite has expired. Ask for a new one.')
    }

    if (!phonesMatch(actor.phone, inv.phoneE164)) {
      const hint = phoneHint(inv.phoneE164)
      throw new InviteError(
        403,
        actor.phone
          ? `This invite was sent to ${hint}. Sign in with that number to accept it.`
          : `This invite was sent to ${hint}. Sign in with that number (or link it in Settings) to accept it.`
      )
    }

    const patientRef = db.doc(`patients/${pid}`)
    const memberRef = db.doc(`patients/${pid}/members/${actor.uid}`)
    const userRef = db.doc(`users/${actor.uid}`)
    const [patientSnap, memberSnap, userSnap] = await Promise.all([tx.get(patientRef), tx.get(memberRef), tx.get(userRef)])
    if (!patientSnap.exists) throw new InviteError(410, 'This profile no longer exists.')
    const patientName = cleanName(patientSnap.get('displayName')) || String(inv.patientName ?? '')

    const acceptance = { status: 'accepted', acceptedBy: actor.uid, acceptedAt: FieldValue.serverTimestamp() }

    if (memberSnap.exists) {
      // Already in the circle (e.g. invited twice): keep the existing role.
      tx.update(inviteRef, acceptance)
      return { pid, patientName, role: memberSnap.get('role') as Role, alreadyMember: true }
    }

    const role: InviteRole = isInviteRole(inv.role) ? inv.role : 'viewer'
    // Profile name → the name the client sent → token name → the name the
    // owner gave the invitee → "Member ••01". Never the raw phone number.
    const displayName = personName(
      [userSnap.exists ? userSnap.get('fullName') : null, opts.displayName, actor.name, inv.inviteeName],
      actor.phone ?? String(inv.phoneE164 ?? '')
    )

    tx.set(memberRef, {
      uid: actor.uid,
      role,
      displayName,
      // Masked: every member can read member docs. The full number stays on
      // the server-only invite doc.
      phone: maskPhone(String(inv.phoneE164 ?? ''), 2) || null,
      addedBy: String(inv.invitedBy ?? ''),
      addedAt: FieldValue.serverTimestamp(),
      inviteId,
    })
    tx.update(inviteRef, acceptance)
    tx.set(
      db.collection(`patients/${pid}/activity`).doc(),
      activityDoc(actor, displayName, 'member.added', {
        targetType: 'member',
        targetId: actor.uid,
        summary: `Joined as ${role === 'editor' ? 'an editor' : 'a viewer'}${firstName(inv.invitedByName) ? `, invited by ${firstName(inv.invitedByName)}` : ''}`,
      })
    )
    const active = userSnap.exists ? userSnap.get('activePatientId') : null
    if (typeof active !== 'string' || !active) {
      tx.set(userRef, { activePatientId: pid }, { merge: true })
    }
    return { pid, patientName, role, alreadyMember: false }
  })
}

// ------------------------------------------------------------------ members: leave

/**
 * Leave a care circle (any non-owner member). Done server-side so the
 * `member.left` entry is written for viewers too (rules only let editors
 * append activity). Clears users/{uid}.activePatientId if it pointed here.
 */
export async function leaveCircle(db: Firestore, actor: InviteActor, pid: string): Promise<void> {
  const memberRef = db.doc(`patients/${pid}/members/${actor.uid}`)
  const userRef = db.doc(`users/${actor.uid}`)
  await db.runTransaction(async (tx) => {
    const [member, user] = await Promise.all([tx.get(memberRef), tx.get(userRef)])
    if (!member.exists) throw new InviteError(404, 'You are not in this care circle')
    if (member.get('role') === 'owner') throw new InviteError(400, 'The owner can’t leave their own care circle')
    const name = personName([member.get('displayName'), actor.name], actor.phone)
    tx.delete(memberRef)
    tx.set(
      db.collection(`patients/${pid}/activity`).doc(),
      activityDoc(actor, name, 'member.left', { targetType: 'member', targetId: actor.uid, summary: 'Left the care circle' })
    )
    if (user.exists && user.get('activePatientId') === pid) {
      tx.update(userRef, { activePatientId: FieldValue.delete() })
    }
  })
}

// ------------------------------------------------------------------ members: rename yourself

/**
 * Set the caller's own name: users/{uid}.fullName plus displayName on every
 * member doc they hold (rules don't let members edit their own member doc,
 * so this runs server-side). Rejects empty names and phone numbers.
 * Returns the stored name and how many member docs were updated.
 */
export async function setMyDisplayName(
  db: Firestore,
  actor: InviteActor,
  rawName: unknown
): Promise<{ displayName: string; updated: number }> {
  const displayName = cleanName(rawName)
  if (!displayName) throw new InviteError(400, 'Enter a name')
  if (isPhoneLike(displayName)) throw new InviteError(400, 'Use a name, not a phone number')

  const memberships = await db.collectionGroup('members').where('uid', '==', actor.uid).get()
  const batch = db.batch()
  batch.set(db.doc(`users/${actor.uid}`), { fullName: displayName, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
  for (const m of memberships.docs) batch.update(m.ref, { displayName })
  await batch.commit()
  return { displayName, updated: memberships.size }
}
