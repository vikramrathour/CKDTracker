import { NextResponse } from 'next/server'
import { getStorage } from 'firebase-admin/storage'
import { getAdminAuth, getAdminDb } from '@/lib/server/firebase-admin'
import { HttpError, errorResponse, requireUser } from '@/lib/server/auth'
import { leaveCircle } from '@/lib/server/invites'
import {
  DELETE_CONFIRMATION,
  blockedMessage,
  planAccountDeletion,
  type MembershipInfo,
} from '@/lib/server/account-deletion'
import type { Role } from '@/lib/types/member'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const NO_STORE = { 'Cache-Control': 'no-store' }

function bucketName(): string | null {
  return process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || null
}

/**
 * POST /api/account/delete {confirm: "DELETE"}
 *
 * Leaves every care circle the caller doesn't own, deletes the patients they
 * own alone (Firestore subtree + Storage files + invites), their chats in
 * other circles, usage counters, users/{uid} (push tokens, legacy data) and
 * finally the Firebase Auth user. Refuses with 409 when they own a profile
 * other members still use.
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser(req)
    const body = (await req.json().catch(() => ({}))) as { confirm?: unknown }
    if (body.confirm !== DELETE_CONFIRMATION) throw new HttpError(400, `Type ${DELETE_CONFIRMATION} to confirm`)

    const db = getAdminDb()
    const uid = user.uid

    const memberSnaps = await db.collectionGroup('members').where('uid', '==', uid).get()
    const memberships: MembershipInfo[] = await Promise.all(
      memberSnaps.docs.map(async (d) => {
        const patientRef = d.ref.parent.parent!
        const [patient, count] = await Promise.all([
          patientRef.get(),
          patientRef.collection('members').count().get(),
        ])
        return {
          pid: patientRef.id,
          role: d.get('role') as Role,
          displayName: (patient.get('displayName') as string | undefined) ?? undefined,
          memberCount: count.data().count,
        }
      })
    )

    const plan = planAccountDeletion(memberships)
    if (!plan.ok) {
      return NextResponse.json(
        { error: blockedMessage(plan), blocked: plan.blocked.map((b) => ({ displayName: b.displayName, otherMembers: b.otherMembers })) },
        { status: 409, headers: NO_STORE }
      )
    }

    // Storage first: if it fails nothing in Firestore/Auth is gone yet.
    const bucketId = bucketName()
    if (bucketId) {
      const bucket = getStorage(getAdminAuth().app).bucket(bucketId)
      for (const pid of plan.deletePatients) await bucket.deleteFiles({ prefix: `patients/${pid}/` })
      await bucket.deleteFiles({ prefix: `lab-pdfs/${uid}/` })
    }

    const actor = { uid, name: user.name ?? null, phone: user.phone_number ?? null }
    for (const pid of plan.leave) {
      const chats = await db.collection(`patients/${pid}/chats`).where('createdBy', '==', uid).get()
      for (const c of chats.docs) await db.recursiveDelete(c.ref)
      await leaveCircle(db, actor, pid)
    }

    for (const pid of plan.deletePatients) {
      const invites = await db.collection('invites').where('pid', '==', pid).get()
      for (const i of invites.docs) await i.ref.delete()
      await db.recursiveDelete(db.doc(`patients/${pid}`))
    }

    const [sentInvites, usage] = await Promise.all([
      db.collection('invites').where('invitedBy', '==', uid).get(),
      db.collection('usage').where('uid', '==', uid).get(),
    ])
    for (const d of [...sentInvites.docs, ...usage.docs]) await d.ref.delete()

    await db.recursiveDelete(db.doc(`users/${uid}`))
    await getAdminAuth().deleteUser(uid)

    return NextResponse.json(
      { ok: true, left: plan.leave.length, deletedProfiles: plan.deletePatients.length },
      { headers: NO_STORE }
    )
  } catch (err) {
    return errorResponse(err)
  }
}
