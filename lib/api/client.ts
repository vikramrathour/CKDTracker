import { auth } from '@/lib/firebase/config'

/**
 * fetch() wrapper for our own /api routes that attaches the signed-in user's
 * Firebase ID token as `Authorization: Bearer <token>`.
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await auth?.currentUser?.getIdToken()
  if (!token) throw new Error('Not signed in')

  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${token}`)
  // Let the browser set the multipart boundary for FormData bodies
  if (init.body instanceof FormData) headers.delete('Content-Type')

  return fetch(path, { ...init, headers })
}
