import 'server-only'
import { NextResponse } from 'next/server'
import type { DecodedIdToken } from 'firebase-admin/auth'
import { errorResponse } from '@/lib/server/auth'
import { InviteError, type InviteActor } from '@/lib/server/invites'

/** The verified caller as the invites module sees it. */
export function actorFrom(user: DecodedIdToken): InviteActor {
  return {
    uid: user.uid,
    phone: typeof user.phone_number === 'string' ? user.phone_number : null,
    name: typeof user.name === 'string' ? user.name : null,
  }
}

/** InviteError → its status; everything else through errorResponse (HttpError / 500). */
export function inviteErrorResponse(err: unknown): NextResponse {
  if (err instanceof InviteError) {
    return NextResponse.json({ error: err.message }, { status: err.status })
  }
  return errorResponse(err)
}

/** JSON body or {} (bad JSON is treated as an empty body, then validated). */
export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json()
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/**
 * Public origin for invite links: NEXT_PUBLIC_APP_URL when set (behind a
 * proxy / custom domain), else the request's own origin.
 */
export function appOrigin(req: Request): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, '')
  if (configured) return configured
  return new URL(req.url).origin
}

/** Responses here carry per-user data: never cache. */
export const NO_STORE = { 'Cache-Control': 'no-store' }
