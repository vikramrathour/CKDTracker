import 'server-only'
import { NextResponse } from 'next/server'
import type { DecodedIdToken } from 'firebase-admin/auth'
import { getAdminAuth, getAdminDb } from './firebase-admin'
import { roleAtLeast, type Role } from '@/lib/types/member'

export class HttpError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'HttpError'
    this.status = status
  }
}

/** Verify the `Authorization: Bearer <Firebase ID token>` header. Throws HttpError(401). */
export async function requireUser(req: Request): Promise<DecodedIdToken> {
  const header = req.headers.get('authorization') || ''
  const match = header.match(/^Bearer\s+(.+)$/i)
  if (!match) throw new HttpError(401, 'Not signed in')

  try {
    return await getAdminAuth().verifyIdToken(match[1].trim())
  } catch {
    throw new HttpError(401, 'Invalid or expired session')
  }
}

/**
 * Verify the caller and require at least `minRole` on patients/{pid}
 * (reads patients/{pid}/members/{uid} with the Admin SDK, so it needs
 * FIREBASE_SERVICE_ACCOUNT_B64). Throws 401 / 403 / 400.
 */
export async function requireMember(
  req: Request,
  pid: string,
  minRole: Role = 'viewer'
): Promise<{ user: DecodedIdToken; role: Role }> {
  const user = await requireUser(req)
  const role = await requireRole(user, pid, minRole)
  return { user, role }
}

/** requireMember() for an already-verified user (e.g. auth checked before reading the body). */
export async function requireRole(user: DecodedIdToken, pid: string, minRole: Role = 'viewer'): Promise<Role> {
  if (!pid || typeof pid !== 'string' || pid.includes('/')) throw new HttpError(400, 'Invalid patient id')
  const snap = await getAdminDb().doc(`patients/${pid}/members/${user.uid}`).get()
  const role = snap.exists ? (snap.get('role') as Role) : null
  if (!role || !roleAtLeast(role, minRole)) throw new HttpError(403, 'Not allowed for this patient')
  return role
}

/** Map an error to a JSON response; non-HttpErrors become a generic 500. */
export function errorResponse(err: unknown): NextResponse {
  if (err instanceof HttpError) {
    return NextResponse.json({ error: err.message }, { status: err.status })
  }
  console.error('Unhandled API error:', err)
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
}
