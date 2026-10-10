import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { deleteApp, initializeApp, type App } from 'firebase-admin/app'
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore'
import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { deleteDoc, doc, getDoc, getDocs, collection, updateDoc } from 'firebase/firestore'
import {
  InviteError,
  createInvite,
  getInviteSummary,
  leaveCircle,
  listInvitesForPatient,
  listPendingForActor,
  redeemInvite,
  revokeInvite,
  setMyDisplayName,
  type InviteActor,
} from '@/lib/server/invites'
import { PROJECT_ID, createEnv } from './setup'

/**
 * Invite lifecycle against the Firestore emulator, driving lib/server/invites.ts
 * (what /api/invites/** call after verifying the ID token) with the Admin SDK,
 * then checking the result through the security rules as the new member.
 * Synthetic users and numbers only.
 */

const OWNER: InviteActor = { uid: 'invowner00000000000000000001', phone: '+919999900001', name: 'Olivia Owner' }
const INVITEE: InviteActor = { uid: 'invitee000000000000000000002', phone: '+919999900002', name: null }
const STRANGER: InviteActor = { uid: 'invstranger00000000000000003', phone: '+919999900003', name: 'Sam Stranger' }
const GOOGLE_ONLY: InviteActor = { uid: 'invgoogle0000000000000000004', phone: null, name: 'Gina Google' }
const PID = OWNER.uid

let app: App
let db: Firestore
let env: RulesTestEnvironment

async function expectInviteError(p: Promise<unknown>, status: number, message?: RegExp) {
  const err = await p.then(
    () => null,
    (e) => e
  )
  expect(err, 'expected an InviteError').toBeInstanceOf(InviteError)
  expect((err as InviteError).status).toBe(status)
  if (message) expect((err as InviteError).message).toMatch(message)
}

async function seedOwner() {
  const now = Timestamp.now()
  await db.doc(`patients/${PID}`).set({ ownerUid: OWNER.uid, displayName: 'Test Patient', relationship: 'self', createdAt: now })
  await db.doc(`patients/${PID}/members/${OWNER.uid}`).set({
    uid: OWNER.uid,
    role: 'owner',
    displayName: 'Olivia Owner',
    phone: OWNER.phone,
    addedBy: OWNER.uid,
    addedAt: now,
  })
  await db.doc(`patients/${PID}/labRecords/rec1`).set({
    recordDate: now,
    labName: 'Synthetic Lab',
    values: [],
    createdBy: OWNER.uid,
    createdAt: now,
  })
}

beforeAll(async () => {
  app = initializeApp({ projectId: PROJECT_ID }, 'invites-test')
  db = getFirestore(app)
  env = await createEnv()
})

afterAll(async () => {
  await env?.cleanup()
  if (app) await deleteApp(app)
})

beforeEach(async () => {
  await env.clearFirestore()
  await seedOwner()
})

describe('invite lifecycle', () => {
  it('create → pending → redeem → member, with activity and active patient', async () => {
    const created = await createInvite(db, OWNER, { pid: PID, phone: '99999 00002', role: 'viewer', inviteeName: 'Ian Invitee' })
    expect(created.reused).toBe(false)
    expect(created.phoneE164).toBe(INVITEE.phone)

    const stored = (await db.doc(`invites/${created.inviteId}`).get()).data()!
    expect(stored).toMatchObject({
      pid: PID,
      patientName: 'Test Patient',
      phoneE164: INVITEE.phone,
      role: 'viewer',
      invitedBy: OWNER.uid,
      invitedByName: 'Olivia Owner',
      status: 'pending',
    })
    const ttl = (stored.expiresAt as Timestamp).toMillis() - Date.now()
    expect(ttl).toBeGreaterThan(6.9 * 86400_000)
    expect(ttl).toBeLessThanOrEqual(7 * 86400_000)

    // Owner list and public summary
    const listed = await listInvitesForPatient(db, PID)
    expect(listed.map((i) => i.id)).toEqual([created.inviteId])
    const summary = await getInviteSummary(db, created.inviteId)
    expect(summary).toEqual({
      patientFirstName: 'Test',
      inviterFirstName: 'Olivia',
      role: 'viewer',
      status: 'pending',
      expiresAt: expect.any(String),
    })
    expect(JSON.stringify(summary)).not.toContain('99999')

    // Invitee sees it; others don't
    expect((await listPendingForActor(db, INVITEE)).map((i) => i.id)).toEqual([created.inviteId])
    expect(await listPendingForActor(db, STRANGER)).toEqual([])
    expect(await listPendingForActor(db, GOOGLE_ONLY)).toEqual([])

    // Redeem
    const result = await redeemInvite(db, INVITEE, created.inviteId)
    expect(result).toEqual({ pid: PID, patientName: 'Test Patient', role: 'viewer', alreadyMember: false })

    const member = (await db.doc(`patients/${PID}/members/${INVITEE.uid}`).get()).data()!
    // Member docs are readable by the whole circle: masked phone only.
    expect(member).toMatchObject({ uid: INVITEE.uid, role: 'viewer', displayName: 'Ian Invitee', phone: '+91 ••••• •••02', addedBy: OWNER.uid })
    expect(JSON.stringify(member)).not.toContain('9999900002')
    const inv = (await db.doc(`invites/${created.inviteId}`).get()).data()!
    expect(inv.status).toBe('accepted')
    expect(inv.acceptedBy).toBe(INVITEE.uid)
    expect((await db.doc(`users/${INVITEE.uid}`).get()).get('activePatientId')).toBe(PID)

    const actions = (await db.collection(`patients/${PID}/activity`).get()).docs.map((d) => d.get('action')).sort()
    expect(actions).toEqual(['member.added', 'member.invited'])

    // No longer pending; re-redeem is idempotent
    expect(await listPendingForActor(db, INVITEE)).toEqual([])
    expect(await listInvitesForPatient(db, PID)).toEqual([])
    expect(await redeemInvite(db, INVITEE, created.inviteId)).toMatchObject({ pid: PID, alreadyMember: true })

    // Through the rules: the new viewer can read the patient and its records, not write them
    const viewer = env.authenticatedContext(INVITEE.uid).firestore()
    await assertSucceeds(getDoc(doc(viewer, 'patients', PID)))
    await assertSucceeds(getDocs(collection(viewer, 'patients', PID, 'labRecords')))
    await assertSucceeds(getDocs(collection(viewer, 'patients', PID, 'activity')))
    await assertFails(getDoc(doc(viewer, 'invites', created.inviteId)))
  })

  it('keeps an already-set active patient', async () => {
    await db.doc(`users/${INVITEE.uid}`).set({ activePatientId: 'somethingElse' })
    const { inviteId } = await createInvite(db, OWNER, { pid: PID, phone: INVITEE.phone!, role: 'editor' })
    await redeemInvite(db, INVITEE, inviteId, { displayName: 'Ian I.' })
    expect((await db.doc(`users/${INVITEE.uid}`).get()).get('activePatientId')).toBe('somethingElse')
    expect((await db.doc(`patients/${PID}/members/${INVITEE.uid}`).get()).get('displayName')).toBe('Ian I.')
    expect((await db.doc(`patients/${PID}/members/${INVITEE.uid}`).get()).get('role')).toBe('editor')
  })

  it('re-inviting the same number refreshes the pending invite (same link)', async () => {
    const first = await createInvite(db, OWNER, { pid: PID, phone: INVITEE.phone!, role: 'viewer' })
    const second = await createInvite(db, OWNER, { pid: PID, phone: '+91 99999 00002', role: 'editor' })
    expect(second.inviteId).toBe(first.inviteId)
    expect(second.reused).toBe(true)
    expect((await db.doc(`invites/${first.inviteId}`).get()).get('role')).toBe('editor')
    expect(await listInvitesForPatient(db, PID)).toHaveLength(1)
  })
})

describe('invite validation', () => {
  it('rejects bad roles and numbers, yourself, and existing members', async () => {
    await expectInviteError(createInvite(db, OWNER, { pid: PID, phone: INVITEE.phone!, role: 'owner' }), 400)
    await expectInviteError(createInvite(db, OWNER, { pid: PID, phone: '12345', role: 'viewer' }), 400)
    await expectInviteError(createInvite(db, OWNER, { pid: PID, phone: '011 2345 6789', role: 'viewer' }), 400)
    await expectInviteError(createInvite(db, OWNER, { pid: PID, phone: OWNER.phone!, role: 'viewer' }), 400, /own number/)

    const { inviteId } = await createInvite(db, OWNER, { pid: PID, phone: INVITEE.phone!, role: 'viewer' })
    await redeemInvite(db, INVITEE, inviteId)
    await expectInviteError(createInvite(db, OWNER, { pid: PID, phone: INVITEE.phone!, role: 'editor' }), 409)
  })

  it('404s an unknown patient or invite', async () => {
    await expectInviteError(createInvite(db, OWNER, { pid: 'nope', phone: INVITEE.phone!, role: 'viewer' }), 404)
    await expectInviteError(redeemInvite(db, INVITEE, 'AbCdEfGhIjKlMnOpQrSt'), 404)
    await expectInviteError(getInviteSummary(db, '../../x'), 404)
  })
})

describe('redeem guards', () => {
  it('403s a different phone number with a masked hint, and a phoneless account', async () => {
    const { inviteId } = await createInvite(db, OWNER, { pid: PID, phone: INVITEE.phone!, role: 'viewer' })
    await expectInviteError(redeemInvite(db, STRANGER, inviteId), 403, /\+91 ••••• •••02/)
    await expectInviteError(redeemInvite(db, GOOGLE_ONLY, inviteId), 403, /link it in Settings/)
    expect((await db.doc(`patients/${PID}/members/${STRANGER.uid}`).get()).exists).toBe(false)
    expect((await db.doc(`invites/${inviteId}`).get()).get('status')).toBe('pending')
  })

  it('410s an expired invite', async () => {
    const { inviteId } = await createInvite(db, OWNER, { pid: PID, phone: INVITEE.phone!, role: 'viewer' })
    await db.doc(`invites/${inviteId}`).update({ expiresAt: Timestamp.fromMillis(Date.now() - 1000) })
    await expectInviteError(redeemInvite(db, INVITEE, inviteId), 410, /expired/)
    expect(await listPendingForActor(db, INVITEE)).toEqual([])
    expect((await getInviteSummary(db, inviteId)).status).toBe('expired')
    expect((await listInvitesForPatient(db, PID))[0].status).toBe('expired')
  })

  it('410s a revoked invite', async () => {
    const { inviteId } = await createInvite(db, OWNER, { pid: PID, phone: INVITEE.phone!, role: 'viewer' })
    await revokeInvite(db, OWNER, inviteId)
    await expectInviteError(redeemInvite(db, INVITEE, inviteId), 410, /cancelled/)
    expect(await listInvitesForPatient(db, PID)).toEqual([])
    expect((await getInviteSummary(db, inviteId)).status).toBe('revoked')
  })

  it('410s an invite already used by someone else', async () => {
    const { inviteId } = await createInvite(db, OWNER, { pid: PID, phone: INVITEE.phone!, role: 'viewer' })
    await redeemInvite(db, INVITEE, inviteId)
    // Same number on a second account (e.g. reinstalled, new uid)
    const twin: InviteActor = { uid: 'invtwin000000000000000000005', phone: INVITEE.phone }
    await expectInviteError(redeemInvite(db, twin, inviteId), 410, /already been used/)
  })
})

describe('removal and re-invite', () => {
  it('an old accepted invite cannot bring a removed member back; a fresh invite works', async () => {
    const first = await createInvite(db, OWNER, { pid: PID, phone: INVITEE.phone!, role: 'editor' })
    await redeemInvite(db, INVITEE, first.inviteId)
    // Owner removes them (client delete, allowed by the rules for the owner)
    await assertSucceeds(deleteDoc(doc(env.authenticatedContext(OWNER.uid).firestore(), 'patients', PID, 'members', INVITEE.uid)))

    await expectInviteError(redeemInvite(db, INVITEE, first.inviteId), 410, /already been used/)
    expect((await db.doc(`patients/${PID}/members/${INVITEE.uid}`).get()).exists).toBe(false)

    // Not "already in the circle" any more
    const second = await createInvite(db, OWNER, { pid: PID, phone: INVITEE.phone!, role: 'viewer' })
    expect(second.inviteId).not.toBe(first.inviteId)
    expect(await redeemInvite(db, INVITEE, second.inviteId)).toMatchObject({ pid: PID, role: 'viewer', alreadyMember: false })
    // …and now they are again
    await expectInviteError(createInvite(db, OWNER, { pid: PID, phone: INVITEE.phone!, role: 'viewer' }), 409)
  })
})

describe('revoke authorization (defence in depth)', () => {
  it('only the owner of the invite patient can revoke it', async () => {
    const editorInvite = await createInvite(db, OWNER, { pid: PID, phone: STRANGER.phone!, role: 'editor' })
    await redeemInvite(db, STRANGER, editorInvite.inviteId) // STRANGER is now an editor
    const { inviteId } = await createInvite(db, OWNER, { pid: PID, phone: INVITEE.phone!, role: 'viewer' })

    await expectInviteError(revokeInvite(db, STRANGER, inviteId), 403)
    await expectInviteError(revokeInvite(db, INVITEE, inviteId), 403)
    await expectInviteError(revokeInvite(db, GOOGLE_ONLY, inviteId), 403)
    expect((await db.doc(`invites/${inviteId}`).get()).get('status')).toBe('pending')

    await expectInviteError(revokeInvite(db, OWNER, 'AbCdEfGhIjKlMnOpQrSt'), 404)
    await expectInviteError(revokeInvite(db, OWNER, '../../x'), 404)
    await revokeInvite(db, OWNER, inviteId)
    expect((await db.doc(`invites/${inviteId}`).get()).get('status')).toBe('revoked')
  })
})

describe('leave', () => {
  it('a member leaves, activity is logged, active patient cleared; the owner cannot leave', async () => {
    const { inviteId } = await createInvite(db, OWNER, { pid: PID, phone: INVITEE.phone!, role: 'viewer' })
    await redeemInvite(db, INVITEE, inviteId)
    await leaveCircle(db, INVITEE, PID)
    expect((await db.doc(`patients/${PID}/members/${INVITEE.uid}`).get()).exists).toBe(false)
    expect((await db.doc(`users/${INVITEE.uid}`).get()).get('activePatientId')).toBeUndefined()
    const actions = (await db.collection(`patients/${PID}/activity`).get()).docs.map((d) => d.get('action'))
    expect(actions).toContain('member.left')

    await expectInviteError(leaveCircle(db, OWNER, PID), 400)
    await expectInviteError(leaveCircle(db, STRANGER, PID), 404)

    const viewer = env.authenticatedContext(INVITEE.uid).firestore()
    await assertFails(getDoc(doc(viewer, 'patients', PID)))
  })
})

describe('names (never a phone number)', () => {
  it('a phone-only invitee with no name joins as "Member ••02", not their number', async () => {
    const { inviteId } = await createInvite(db, OWNER, { pid: PID, phone: INVITEE.phone!, role: 'viewer' })
    await redeemInvite(db, INVITEE, inviteId, { displayName: INVITEE.phone })
    const member = (await db.doc(`patients/${PID}/members/${INVITEE.uid}`).get()).data()!
    expect(member.displayName).toBe('Member ••02')
    const activity = (await db.collection(`patients/${PID}/activity`).get()).docs.map((d) => d.data())
    expect(JSON.stringify(activity)).not.toContain('9999900002')
  })

  it('redeem prefers the profile fullName', async () => {
    await db.doc(`users/${INVITEE.uid}`).set({ fullName: 'Ian Profile' })
    const { inviteId } = await createInvite(db, OWNER, { pid: PID, phone: INVITEE.phone!, role: 'viewer' })
    await redeemInvite(db, INVITEE, inviteId)
    expect((await db.doc(`patients/${PID}/members/${INVITEE.uid}`).get()).get('displayName')).toBe('Ian Profile')
  })

  it('setMyDisplayName (POST /api/members/me) renames every membership; members cannot do it directly', async () => {
    const { inviteId } = await createInvite(db, OWNER, { pid: PID, phone: INVITEE.phone!, role: 'editor' })
    await redeemInvite(db, INVITEE, inviteId)

    // The rules keep member docs server-written: a self-rename from the client fails.
    const asInvitee = env.authenticatedContext(INVITEE.uid).firestore()
    await assertFails(updateDoc(doc(asInvitee, 'patients', PID, 'members', INVITEE.uid), { displayName: 'Self Rename' }))

    const result = await setMyDisplayName(db, INVITEE, '  Ian   Renamed ')
    expect(result).toEqual({ displayName: 'Ian Renamed', updated: 1 })
    expect((await db.doc(`patients/${PID}/members/${INVITEE.uid}`).get()).get('displayName')).toBe('Ian Renamed')
    expect((await db.doc(`users/${INVITEE.uid}`).get()).get('fullName')).toBe('Ian Renamed')
    // The owner's doc is untouched.
    expect((await db.doc(`patients/${PID}/members/${OWNER.uid}`).get()).get('displayName')).toBe('Olivia Owner')

    await expectInviteError(setMyDisplayName(db, INVITEE, '   '), 400)
    await expectInviteError(setMyDisplayName(db, INVITEE, '+91 99999 00002'), 400)
  })
})
