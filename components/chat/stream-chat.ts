import { apiFetch } from '@/lib/api/client'
import type { ChatEvent } from '@/lib/server/chat/events'
import { createSSEParser } from './sse-parser'

export class ChatRequestError extends Error {
  status: number
  code?: string

  constructor(status: number, message: string, code?: string) {
    super(message)
    this.name = 'ChatRequestError'
    this.status = status
    this.code = code
  }
}

const OFFLINE = "You're offline. Connect to the internet to chat; your reports are still available."

/**
 * POST /api/chat and dispatch SSE events as they arrive (fetch + ReadableStream,
 * since EventSource can't send the Authorization header or a POST body).
 */
export async function streamChat(opts: {
  pid: string
  chatId?: string | null
  message: string
  signal?: AbortSignal
  onEvent: (e: ChatEvent) => void
}): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new ChatRequestError(0, OFFLINE, 'offline')

  let res: Response
  try {
    res = await apiFetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({ pid: opts.pid, chatId: opts.chatId || undefined, message: opts.message }),
      signal: opts.signal,
    })
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err
    if ((err as Error)?.message === 'Not signed in') throw new ChatRequestError(401, 'Please sign in again.')
    throw new ChatRequestError(0, OFFLINE, 'offline')
  }

  const type = res.headers.get('content-type') || ''
  if (!res.ok || !type.includes('text/event-stream') || !res.body) {
    const body = await res.json().catch(() => ({}) as { error?: string; code?: string })
    throw new ChatRequestError(res.status, body.error || 'Something went wrong. Please try again.', body.code)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  const parser = createSSEParser()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    for (const e of parser.push(decoder.decode(value, { stream: true }))) opts.onEvent(e)
  }
  for (const e of parser.push(decoder.decode())) opts.onEvent(e)
  for (const e of parser.flush()) opts.onEvent(e)
}
