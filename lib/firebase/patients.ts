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
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
} from 'firebase/firestore'
import { auth } from './config'
import { currentUid, getDb, toIso } from './firestore'
import type { Patient, PatientInput } from '@/lib/types/patient'
import type { Member, PatientMembership, Role } from '@/lib/types/member'
import type { ActivityAction, Target } from '@/lib/types/care'

/**
 * Patients and care-circle membership.
 *
 *   patients/{pid}                 Patient
 *   patients/{pid}/members/{uid}   Member (owner bootstrap from the client;
 *                                  everyone else is added server-side)
 *   users/{uid}.activePatientId    which patient the app is showing
 */

const PID_SUFFIX_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'

/** pid for someone you care for: `${uid}_${12 random [a-z0-9]}` (matches firestore.rules). */
export function newCarePid(uid: string): string {
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  let suffix = ''
  for (const b of Array.from(bytes)) suffix += PID_SUFFIX_ALPHABET[b % PID_SUFFIX_ALPHABET.length]
  return `${uid}_${suffix}`
}

/** Date-only fields: accept 'YYYY-MM-DD', ISO strings or Timestamps; return 'YYYY-MM-DD' or null. */
function toDateOnly(value: unknown): string | null {
  const iso = toIso(value)
  if (!iso) return null
  return /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : null
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

export function patientFromDoc(id: string, data: DocumentData): Patient {
  return {
    id,
    ownerUid: String(data.ownerUid ?? ''),
    displayName: str(data.displayName) || 'Unnamed',
    relationship: data.relationship,
    dateOfBirth: toDateOnly(data.dateOfBirth),
    transplantDate: toDateOnly(data.transplantDate),
    doctorName: str(data.doctorName) ?? '',
    hospital: str(data.hospital) ?? '',
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
    migratedAt: toIso(data.migratedAt),
  }
}

function memberFromDoc(data: DocumentData): Member {
  return {
    uid: String(data.uid),
    role: data.role as Role,
    displayName: str(data.displayName) || 'Member',
    phone: str(data.phone) ?? null,
    addedBy: String(data.addedBy ?? ''),
    addedAt: toIso(data.addedAt),
  }
}

/** Keep only fields the rules allow, trimmed, with empty optional strings dropped to ''/null. */
function cleanPatientInput(input: Partial<PatientInput>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (input.displayName !== undefined) out.displayName = input.displayName.trim().slice(0, 100)
  if (input.relationship !== undefined) out.relationship = input.relationship
  if (input.dateOfBirth !== undefined) out.dateOfBirth = input.dateOfBirth || null
  if (input.transplantDate !== undefined) out.transplantDate = input.transplantDate || null
  if (input.doctorName !== undefined) out.doctorName = input.doctorName.trim().slice(0, 120)
  if (input.hospital !== undefined) out.hospital = input.hospital.trim().slice(0, 160)
  return out
}

function myDisplayName(): string {
  const u = auth?.currentUser
  return (u?.displayName || u?.phoneNumber || u?.email || 'Me').slice(0, 100)
}

// ---- Patients ----

/**
 * Create a patient with the caller as owner, in one batch (the rules require
 * the patient doc and the owner member doc to be written together).
 * `self: true` uses pid = uid (fails if you already have your own profile).
 * Also makes it the active patient. Returns the pid.
 */
export async function createPatient(input: PatientInput, opts: { self: boolean }): Promise<string> {
  const uid = currentUid()
  const db = getDb()
  const pid = opts.self ? uid : newCarePid(uid)

  const batch = writeBatch(db)
  batch.set(doc(db, 'patients', pid), {
    ...cleanPatientInput({ ...input, relationship: opts.self ? 'self' : input.relationship ?? 'family' }),
    ownerUid: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  batch.set(doc(db, 'patients', pid, 'members', uid), {
    uid,
    role: 'owner',
    displayName: myDisplayName(),
    phone: auth?.currentUser?.phoneNumber ?? null,
    addedBy: uid,
    addedAt: serverTimestamp(),
  })
  await batch.commit()

  await setActivePatient(pid)
  await logActivity(pid, 'patient.created', { targetType: 'patient', targetId: pid })
  return pid
}

/**
 * Every patient the user belongs to: collection-group query on `members`
 * (uid == me) → parent patient docs. Own profile first, then by name.
 */
export async function listMyPatients(uid: string): Promise<PatientMembership[]> {
  const db = getDb()
  const snap = await getDocs(query(collectionGroup(db, 'members'), where('uid', '==', uid)))
  const memberships = snap.docs
    .map((d) => ({ pid: d.ref.parent.parent?.id, role: d.data().role as Role }))
    .filter((m): m is { pid: string; role: Role } => Boolean(m.pid))

  const patients = await Promise.all(
    memberships.map(async ({ pid, role }) => {
      try {
        const p = await getDoc(doc(db, 'patients', pid))
        return p.exists() ? { ...patientFromDoc(p.id, p.data()), role } : null
      } catch (err) {
        console.warn('Skipping unreadable patient', err)
        return null
      }
    })
  )

  return patients
    .filter((p): p is PatientMembership => p !== null)
    .sort((a, b) => {
      if (a.id === uid) return -1
      if (b.id === uid) return 1
      return a.displayName.localeCompare(b.displayName)
    })
}

export async function getPatient(pid: string): Promise<Patient | null> {
  const snap = await getDoc(doc(getDb(), 'patients', pid))
  return snap.exists() ? patientFromDoc(snap.id, snap.data()) : null
}

/** Editors and owners can update profile fields; ownerUid/createdAt never change. */
export async function updatePatient(pid: string, input: Partial<PatientInput>): Promise<void> {
  await updateDoc(doc(getDb(), 'patients', pid), {
    ...cleanPatientInput(input),
    updatedAt: serverTimestamp(),
  })
  await logActivity(pid, 'patient.updated', { targetType: 'patient', targetId: pid })
}

// ---- Active patient (users/{uid}.activePatientId) ----

export async function getActivePatientId(uid: string): Promise<string | null> {
  const snap = await getDoc(doc(getDb(), 'users', uid))
  const value = snap.exists() ? snap.data().activePatientId : null
  return typeof value === 'string' && value ? value : null
}

export async function setActivePatient(pid: string): Promise<void> {
  const uid = currentUid()
  await setDoc(doc(getDb(), 'users', uid), { activePatientId: pid }, { merge: true })
}

// ---- Members ----

export async function listMembers(pid: string): Promise<Member[]> {
  const snap = await getDocs(collection(getDb(), 'patients', pid, 'members'))
  const order: Record<Role, number> = { owner: 0, editor: 1, viewer: 2 }
  return snap.docs
    .map((d) => memberFromDoc(d.data()))
    .sort((a, b) => order[a.role] - order[b.role] || a.displayName.localeCompare(b.displayName))
}

/** Owner only; the owner's own role can't change (rules). */
export async function updateMemberRole(pid: string, memberUid: string, role: Exclude<Role, 'owner'>): Promise<void> {
  await updateDoc(doc(getDb(), 'patients', pid, 'members', memberUid), { role })
  await logActivity(pid, 'member.role-changed', { targetType: 'member', targetId: memberUid, summary: `Role set to ${role}` })
}

/** Owner removes someone else. The owner doc can't be removed (rules). */
export async function removeMember(pid: string, memberUid: string): Promise<void> {
  await deleteDoc(doc(getDb(), 'patients', pid, 'members', memberUid))
  await logActivity(pid, 'member.removed', { targetType: 'member', targetId: memberUid })
}

/** Leave a care circle. Logged first (best-effort), since access ends on delete. */
export async function leavePatient(pid: string): Promise<void> {
  const uid = currentUid()
  await logActivity(pid, 'member.left', { targetType: 'member', targetId: uid })
  await deleteDoc(doc(getDb(), 'patients', pid, 'members', uid))
}

// ---- Targets (patients/{pid}/targets/{testName}) ----

export async function setTarget(
  pid: string,
  testName: string,
  target: Pick<Target, 'min' | 'max'> & Partial<Pick<Target, 'unit' | 'setBy' | 'notes'>>
): Promise<void> {
  const ref = doc(getDb(), 'patients', pid, 'targets', testName)
  const existing = await getDoc(ref)
  const fields: Record<string, unknown> = { testName, updatedAt: serverTimestamp() }
  for (const [k, v] of Object.entries(target)) if (v !== undefined) fields[k] = v
  if (existing.exists()) {
    await updateDoc(ref, fields)
  } else {
    await setDoc(ref, { ...fields, createdBy: currentUid(), createdAt: serverTimestamp() })
  }
  await logActivity(pid, 'target.updated', { targetType: 'target', targetId: testName })
}

// ---- Activity (append-only) ----

/**
 * Append an audit entry. Best-effort: never throws (viewers can't write
 * activity, and a failed log shouldn't fail the action it describes).
 */
export async function logActivity(
  pid: string,
  action: ActivityAction,
  extra: { targetType?: string; targetId?: string; summary?: string } = {}
): Promise<void> {
  try {
    const entry: Record<string, unknown> = {
      actorUid: currentUid(),
      actorName: myDisplayName(),
      action,
      createdAt: serverTimestamp(),
    }
    for (const [k, v] of Object.entries(extra)) if (v !== undefined) entry[k] = v
    await addDoc(collection(getDb(), 'patients', pid, 'activity'), entry)
  } catch (err) {
    console.warn(`Activity log skipped (${action})`, err)
  }
}
