import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import {
  addDoc,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
} from 'firebase/firestore'
import { ALICE, BOB, CAROL, MALLORY, PID, createEnv, seedCircle } from './setup'

let env: RulesTestEnvironment

beforeAll(async () => {
  env = await createEnv()
})

afterAll(async () => {
  await env?.cleanup()
})

beforeEach(async () => {
  await env.clearFirestore()
})

const as = (uid: string) => env.authenticatedContext(uid).firestore() as unknown as Firestore
const anon = () => env.unauthenticatedContext().firestore() as unknown as Firestore

function bootstrap(db: Firestore, pid: string, uid: string, patientOverrides: Record<string, unknown> = {}, memberOverrides: Record<string, unknown> = {}) {
  const batch = writeBatch(db)
  batch.set(doc(db, 'patients', pid), {
    ownerUid: uid,
    displayName: 'Synthetic Person',
    relationship: 'self',
    createdAt: serverTimestamp(),
    ...patientOverrides,
  })
  batch.set(doc(db, 'patients', pid, 'members', uid), {
    uid,
    role: 'owner',
    displayName: 'Synthetic Person',
    addedBy: uid,
    addedAt: serverTimestamp(),
    ...memberOverrides,
  })
  return batch.commit()
}

const record = (createdBy: string) => ({
  recordDate: Timestamp.now(),
  labName: 'Synthetic Lab',
  values: [],
  createdBy,
  createdAt: serverTimestamp(),
})

// --------------------------------------------------------------------------

describe('patient creation (owner bootstrap)', () => {
  it('lets a user create their own profile (pid == uid) with an owner member in one batch', async () => {
    await assertSucceeds(bootstrap(as(ALICE), ALICE, ALICE))
  })

  it('lets a user create a care profile with pid `${uid}_suffix`', async () => {
    await assertSucceeds(bootstrap(as(ALICE), `${ALICE}_k3j9x2ab`, ALICE, { relationship: 'family' }))
  })

  it('rejects a patient doc without the owner member doc in the same batch', async () => {
    const db = as(ALICE)
    await assertFails(setDoc(doc(db, 'patients', ALICE), { ownerUid: ALICE, displayName: 'X', createdAt: serverTimestamp() }))
  })

  it('rejects an owner member doc without the patient doc in the same batch', async () => {
    const db = as(ALICE)
    await assertFails(setDoc(doc(db, 'patients', ALICE, 'members', ALICE), { uid: ALICE, role: 'owner', displayName: 'X', addedBy: ALICE }))
  })

  it('blocks pid squatting on another user\'s uid', async () => {
    await assertFails(bootstrap(as(MALLORY), BOB, MALLORY))
  })

  it('blocks pid squatting on another user\'s care-profile namespace', async () => {
    await assertFails(bootstrap(as(MALLORY), `${BOB}_k3j9x2ab`, MALLORY))
  })

  it('rejects arbitrary pids and too-short suffixes', async () => {
    await assertFails(bootstrap(as(ALICE), 'shared-family-profile', ALICE))
    await assertFails(bootstrap(as(ALICE), `${ALICE}_x`, ALICE))
  })

  it('rejects ownerUid that is not the caller', async () => {
    await assertFails(bootstrap(as(ALICE), ALICE, ALICE, { ownerUid: BOB }))
  })

  it('rejects unknown patient fields and invalid relationship', async () => {
    await assertFails(bootstrap(as(ALICE), ALICE, ALICE, { isAdmin: true }))
    await assertFails(bootstrap(as(ALICE), ALICE, ALICE, { relationship: 'boss' }))
  })

  it('rejects a bootstrap whose member doc is not role owner', async () => {
    await assertFails(bootstrap(as(ALICE), ALICE, ALICE, {}, { role: 'editor' }))
  })

  it('nobody can create an owner on an existing pid', async () => {
    await seedCircle(env)
    // Mallory tries to make herself owner of Alice's existing patient
    const db = as(MALLORY)
    await assertFails(
      setDoc(doc(db, 'patients', PID, 'members', MALLORY), { uid: MALLORY, role: 'owner', displayName: 'M', addedBy: MALLORY })
    )
    // …or re-bootstrap it in a batch
    await assertFails(bootstrap(db, PID, MALLORY))
    // Alice (the real owner) can't add a second owner doc either
    await assertFails(bootstrap(as(ALICE), PID, ALICE))
  })

  it('nobody can create a member doc for someone else or self-join as editor/viewer', async () => {
    await seedCircle(env)
    await assertFails(
      setDoc(doc(as(ALICE), 'patients', PID, 'members', MALLORY), { uid: MALLORY, role: 'viewer', displayName: 'M', addedBy: ALICE })
    )
    await assertFails(
      setDoc(doc(as(MALLORY), 'patients', PID, 'members', MALLORY), { uid: MALLORY, role: 'viewer', displayName: 'M', addedBy: MALLORY })
    )
  })
})

describe('patient doc access', () => {
  beforeEach(() => seedCircle(env))

  it('members can read; strangers and anonymous users cannot', async () => {
    for (const uid of [ALICE, BOB, CAROL]) await assertSucceeds(getDoc(doc(as(uid), 'patients', PID)))
    await assertFails(getDoc(doc(as(MALLORY), 'patients', PID)))
    await assertFails(getDoc(doc(anon(), 'patients', PID)))
  })

  it('nobody can list the patients collection', async () => {
    await assertFails(getDocs(collection(as(ALICE), 'patients')))
  })

  it('editors can update profile fields; viewers cannot', async () => {
    await assertSucceeds(updateDoc(doc(as(BOB), 'patients', PID), { doctorName: 'Dr Synthetic', updatedAt: serverTimestamp() }))
    await assertFails(updateDoc(doc(as(CAROL), 'patients', PID), { doctorName: 'Dr Nope' }))
  })

  it('ownerUid and createdAt are immutable, even for the owner', async () => {
    await assertFails(updateDoc(doc(as(ALICE), 'patients', PID), { ownerUid: BOB }))
    await assertFails(updateDoc(doc(as(ALICE), 'patients', PID), { createdAt: Timestamp.now() }))
  })

  it('patients cannot be deleted from the client', async () => {
    await assertFails(deleteDoc(doc(as(ALICE), 'patients', PID)))
  })
})

describe('roles on clinical data', () => {
  beforeEach(() => seedCircle(env))

  it('viewer can read records but cannot create, update or delete', async () => {
    const db = as(CAROL)
    await assertSucceeds(getDocs(collection(db, 'patients', PID, 'labRecords')))
    await assertFails(addDoc(collection(db, 'patients', PID, 'labRecords'), record(CAROL)))
    await assertFails(updateDoc(doc(db, 'patients', PID, 'labRecords', 'rec1'), { notes: 'x' }))
    await assertFails(deleteDoc(doc(db, 'patients', PID, 'labRecords', 'rec1')))
  })

  it('editor can create (createdBy = self), update and delete records', async () => {
    const db = as(BOB)
    await assertSucceeds(addDoc(collection(db, 'patients', PID, 'labRecords'), record(BOB)))
    await assertSucceeds(updateDoc(doc(db, 'patients', PID, 'labRecords', 'rec1'), { notes: 'reviewed' }))
    await assertSucceeds(deleteDoc(doc(db, 'patients', PID, 'labRecords', 'rec1')))
  })

  it('createdBy must be the caller on create and cannot be rewritten', async () => {
    const db = as(BOB)
    await assertFails(addDoc(collection(db, 'patients', PID, 'labRecords'), record(ALICE)))
    const { createdBy: _omit, ...noAuthor } = record(BOB)
    await assertFails(addDoc(collection(db, 'patients', PID, 'labRecords'), noAuthor))
    await assertFails(updateDoc(doc(db, 'patients', PID, 'labRecords', 'rec1'), { createdBy: BOB }))
  })

  it('strangers cannot read or write any data subcollection', async () => {
    const db = as(MALLORY)
    for (const coll of ['labRecords', 'medications', 'visits', 'vitals', 'documents', 'questions', 'targets', 'alertRules']) {
      await assertFails(getDocs(collection(db, 'patients', PID, coll)))
      await assertFails(setDoc(doc(db, 'patients', PID, coll, 'x'), { createdBy: MALLORY }))
    }
  })

  it('editor can write every data subcollection, viewer none', async () => {
    for (const coll of ['medications', 'visits', 'vitals', 'documents', 'questions', 'targets', 'alertRules']) {
      await assertSucceeds(setDoc(doc(as(BOB), 'patients', PID, coll, 'Tacrolimus'), { createdBy: BOB }))
      await assertSucceeds(getDoc(doc(as(CAROL), 'patients', PID, coll, 'Tacrolimus')))
      await assertFails(setDoc(doc(as(CAROL), 'patients', PID, coll, 'other'), { createdBy: CAROL }))
    }
  })

  it('medication dose history follows the same roles', async () => {
    await assertSucceeds(setDoc(doc(as(BOB), 'patients', PID, 'medications', 'tac', 'doseHistory', 'h1'), { dose: '2 mg', createdBy: BOB }))
    await assertSucceeds(getDoc(doc(as(CAROL), 'patients', PID, 'medications', 'tac', 'doseHistory', 'h1')))
    await assertFails(setDoc(doc(as(CAROL), 'patients', PID, 'medications', 'tac', 'doseHistory', 'h2'), { dose: '3 mg', createdBy: CAROL }))
    await assertFails(getDoc(doc(as(MALLORY), 'patients', PID, 'medications', 'tac', 'doseHistory', 'h1')))
  })

  it('unknown subcollections are closed, even to the owner', async () => {
    await assertFails(setDoc(doc(as(ALICE), 'patients', PID, 'secrets', 'x'), { createdBy: ALICE }))
    await assertFails(getDoc(doc(as(ALICE), 'patients', PID, 'secrets', 'x')))
  })
})

describe('care circle membership', () => {
  beforeEach(() => seedCircle(env))

  it('members can list the circle; strangers cannot', async () => {
    await assertSucceeds(getDocs(collection(as(CAROL), 'patients', PID, 'members')))
    await assertFails(getDocs(collection(as(MALLORY), 'patients', PID, 'members')))
  })

  it('editor cannot change roles', async () => {
    await assertFails(updateDoc(doc(as(BOB), 'patients', PID, 'members', CAROL), { role: 'editor' }))
    await assertFails(updateDoc(doc(as(BOB), 'patients', PID, 'members', BOB), { role: 'owner' }))
  })

  it('viewer cannot promote themselves', async () => {
    await assertFails(updateDoc(doc(as(CAROL), 'patients', PID, 'members', CAROL), { role: 'editor' }))
  })

  it('owner can switch editor <-> viewer, but not grant owner or edit other fields', async () => {
    const db = as(ALICE)
    await assertSucceeds(updateDoc(doc(db, 'patients', PID, 'members', CAROL), { role: 'editor' }))
    await assertSucceeds(updateDoc(doc(db, 'patients', PID, 'members', BOB), { role: 'viewer' }))
    await assertFails(updateDoc(doc(db, 'patients', PID, 'members', BOB), { role: 'owner' }))
    await assertFails(updateDoc(doc(db, 'patients', PID, 'members', BOB), { role: 'admin' }))
    await assertFails(updateDoc(doc(db, 'patients', PID, 'members', BOB), { uid: MALLORY }))
  })

  it('the owner member doc cannot be changed or deleted', async () => {
    await assertFails(updateDoc(doc(as(ALICE), 'patients', PID, 'members', ALICE), { role: 'editor' }))
    await assertFails(updateDoc(doc(as(ALICE), 'patients', PID, 'members', ALICE), { displayName: 'Renamed' }))
    await assertFails(deleteDoc(doc(as(ALICE), 'patients', PID, 'members', ALICE)))
    await assertFails(deleteDoc(doc(as(BOB), 'patients', PID, 'members', ALICE)))
  })

  it('a member can leave (delete their own member doc)', async () => {
    await assertSucceeds(deleteDoc(doc(as(CAROL), 'patients', PID, 'members', CAROL)))
    // …and loses access immediately
    await assertFails(getDoc(doc(as(CAROL), 'patients', PID)))
  })

  it('only the owner can remove other members', async () => {
    await assertFails(deleteDoc(doc(as(BOB), 'patients', PID, 'members', CAROL)))
    await assertFails(deleteDoc(doc(as(CAROL), 'patients', PID, 'members', BOB)))
    await assertSucceeds(deleteDoc(doc(as(ALICE), 'patients', PID, 'members', BOB)))
  })
})

describe('collection-group membership query', () => {
  beforeEach(async () => {
    await seedCircle(env)
    // A second patient Bob owns, where Alice is not a member
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore()
      const pid2 = `${BOB}_q8w7e6r5`
      await setDoc(doc(db, 'patients', pid2), { ownerUid: BOB, displayName: 'Other', createdAt: Timestamp.now() })
      await setDoc(doc(db, 'patients', pid2, 'members', BOB), { uid: BOB, role: 'owner', displayName: 'bob', addedBy: BOB })
    })
  })

  it('returns only the caller\'s own memberships', async () => {
    const aliceSnap = await assertSucceeds(getDocs(query(collectionGroup(as(ALICE), 'members'), where('uid', '==', ALICE))))
    expect(aliceSnap.docs.map((d) => d.ref.parent.parent?.id)).toEqual([PID])
    const bobSnap = await assertSucceeds(getDocs(query(collectionGroup(as(BOB), 'members'), where('uid', '==', BOB))))
    expect(bobSnap.size).toBe(2)
  })

  it('rejects unfiltered or foreign collection-group queries', async () => {
    await assertFails(getDocs(collectionGroup(as(ALICE), 'members')))
    await assertFails(getDocs(query(collectionGroup(as(ALICE), 'members'), where('uid', '==', BOB))))
    await assertFails(getDocs(query(collectionGroup(anon(), 'members'), where('uid', '==', ALICE))))
  })
})

describe('activity log (append-only)', () => {
  beforeEach(() => seedCircle(env))

  const entry = (actorUid: string) => ({ actorUid, action: 'record.added', createdAt: serverTimestamp() })

  it('editors append entries as themselves with a server timestamp', async () => {
    await assertSucceeds(addDoc(collection(as(BOB), 'patients', PID, 'activity'), entry(BOB)))
    await assertSucceeds(addDoc(collection(as(ALICE), 'patients', PID, 'activity'), entry(ALICE)))
  })

  it('rejects spoofed actors, client timestamps and viewer writes', async () => {
    await assertFails(addDoc(collection(as(BOB), 'patients', PID, 'activity'), entry(ALICE)))
    await assertFails(addDoc(collection(as(BOB), 'patients', PID, 'activity'), { ...entry(BOB), createdAt: Timestamp.fromMillis(0) }))
    await assertFails(addDoc(collection(as(CAROL), 'patients', PID, 'activity'), entry(CAROL)))
  })

  it('entries cannot be updated or deleted, even by the owner', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'patients', PID, 'activity', 'a1'), { actorUid: BOB, action: 'record.added', createdAt: Timestamp.now() })
    })
    await assertSucceeds(getDoc(doc(as(CAROL), 'patients', PID, 'activity', 'a1')))
    await assertFails(updateDoc(doc(as(ALICE), 'patients', PID, 'activity', 'a1'), { action: 'record.deleted' }))
    await assertFails(deleteDoc(doc(as(ALICE), 'patients', PID, 'activity', 'a1')))
  })
})

describe('chat threads (server-written, private to the creator)', () => {
  beforeEach(async () => {
    await seedCircle(env)
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore()
      await setDoc(doc(db, 'patients', PID, 'chats', 'c1'), { createdBy: CAROL, title: 't', createdAt: Timestamp.now() })
      await setDoc(doc(db, 'patients', PID, 'chats', 'c1', 'messages', 'm1'), { role: 'user', text: 'hi', createdAt: Timestamp.now() })
    })
  })

  it('the creator can read their thread and its messages', async () => {
    const db = as(CAROL)
    await assertSucceeds(getDoc(doc(db, 'patients', PID, 'chats', 'c1')))
    await assertSucceeds(getDocs(query(collection(db, 'patients', PID, 'chats'), where('createdBy', '==', CAROL))))
    await assertSucceeds(getDocs(collection(db, 'patients', PID, 'chats', 'c1', 'messages')))
  })

  it('other members (even the owner) cannot read someone else\'s thread', async () => {
    const db = as(ALICE)
    await assertFails(getDoc(doc(db, 'patients', PID, 'chats', 'c1')))
    await assertFails(getDocs(collection(db, 'patients', PID, 'chats')))
    await assertFails(getDocs(collection(db, 'patients', PID, 'chats', 'c1', 'messages')))
  })

  it('a former member loses access to their own thread', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await deleteDoc(doc(ctx.firestore(), 'patients', PID, 'members', CAROL))
    })
    await assertFails(getDoc(doc(as(CAROL), 'patients', PID, 'chats', 'c1')))
  })

  it('clients cannot write threads or messages', async () => {
    const db = as(CAROL)
    await assertFails(setDoc(doc(db, 'patients', PID, 'chats', 'c2'), { createdBy: CAROL, title: 't' }))
    await assertFails(updateDoc(doc(db, 'patients', PID, 'chats', 'c1'), { title: 'renamed' }))
    await assertFails(addDoc(collection(db, 'patients', PID, 'chats', 'c1', 'messages'), { role: 'model', text: 'spoof' }))
  })
})

describe('server-only collections', () => {
  beforeEach(() => seedCircle(env))

  it('denies client reads and writes to invites, usage and sharedLinks', async () => {
    const db = as(ALICE)
    for (const coll of ['invites', 'usage', 'sharedLinks']) {
      await assertFails(setDoc(doc(db, coll, 'x'), { pid: PID, phoneE164: '+919999900001', role: 'viewer' }))
      await assertFails(getDoc(doc(db, coll, 'x')))
      await assertFails(getDocs(collection(db, coll)))
    }
  })
})

describe('users/{uid}', () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore()
      await setDoc(doc(db, 'users', ALICE), { fullName: 'Alice' })
      await setDoc(doc(db, 'users', ALICE, 'labRecords', 'old1'), { labName: 'Legacy', values: [] })
      await setDoc(doc(db, 'users', ALICE, 'medications', 'med1'), { name: 'Synthetic', isActive: true })
    })
  })

  it('profile and fcmTokens are owner-only', async () => {
    await assertSucceeds(updateDoc(doc(as(ALICE), 'users', ALICE), { activePatientId: PID }))
    await assertSucceeds(setDoc(doc(as(ALICE), 'users', ALICE, 'fcmTokens', 'tok'), { createdAt: serverTimestamp() }))
    await assertFails(getDoc(doc(as(BOB), 'users', ALICE)))
    await assertFails(setDoc(doc(as(BOB), 'users', ALICE, 'fcmTokens', 'tok2'), {}))
  })

  it('legacy labRecords/medications are readable by the owner only', async () => {
    await assertSucceeds(getDocs(collection(as(ALICE), 'users', ALICE, 'labRecords')))
    await assertSucceeds(getDoc(doc(as(ALICE), 'users', ALICE, 'medications', 'med1')))
    await assertFails(getDocs(collection(as(BOB), 'users', ALICE, 'labRecords')))
  })

  it('legacy paths are read-only, even for the owner', async () => {
    const db = as(ALICE)
    await assertFails(addDoc(collection(db, 'users', ALICE, 'labRecords'), { labName: 'New', values: [] }))
    await assertFails(updateDoc(doc(db, 'users', ALICE, 'labRecords', 'old1'), { labName: 'Edited' }))
    await assertFails(deleteDoc(doc(db, 'users', ALICE, 'labRecords', 'old1')))
    await assertFails(setDoc(doc(db, 'users', ALICE, 'medications', 'med2'), { name: 'New' }))
    await assertFails(deleteDoc(doc(db, 'users', ALICE, 'medications', 'med1')))
  })

  it('other users/{uid} subcollections are closed', async () => {
    await assertFails(setDoc(doc(as(ALICE), 'users', ALICE, 'anything', 'x'), {}))
  })
})
