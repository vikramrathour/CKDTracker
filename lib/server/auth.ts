import 'server-only'
import { NextResponse } from 'next/server'
import type { DecodedIdToken } from 'firebase-admin/auth'
import { getAdminAuth } from './firebase-admin'

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

/** Map an error to a JSON response; non-HttpErrors become a generic 500. */
export function errorResponse(err: unknown): NextResponse {
  if (err instanceof HttpError) {
    return NextResponse.json({ error: err.message }, { status: err.status })
  }
  console.error('Unhandled API error:', err)
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
}
