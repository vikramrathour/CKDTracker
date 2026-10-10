/** Pure request validation and small text helpers for /api/chat. */

export const MAX_MESSAGE_CHARS = 2000
export const MAX_TITLE_CHARS = 60
const ID_RE = /^[A-Za-z0-9_-]{1,128}$/

export interface ChatRequest {
  pid: string
  chatId: string | null
  message: string
}

export type ParseResult = { ok: true; value: ChatRequest } | { ok: false; status: number; error: string }

export function isSafeId(v: unknown): v is string {
  return typeof v === 'string' && ID_RE.test(v)
}

export function parseChatRequest(body: unknown): ParseResult {
  if (!body || typeof body !== 'object') return { ok: false, status: 400, error: 'Invalid request body' }
  const b = body as Record<string, unknown>
  if (!isSafeId(b.pid)) return { ok: false, status: 400, error: 'Invalid patient id' }
  if (b.chatId != null && b.chatId !== '' && !isSafeId(b.chatId)) return { ok: false, status: 400, error: 'Invalid chat id' }
  if (typeof b.message !== 'string') return { ok: false, status: 400, error: 'Message is required' }
  const message = b.message.replace(/\r\n/g, '\n').trim()
  if (!message) return { ok: false, status: 400, error: 'Message is required' }
  if (message.length > MAX_MESSAGE_CHARS) {
    return { ok: false, status: 413, error: `Please keep messages under ${MAX_MESSAGE_CHARS} characters.` }
  }
  return { ok: true, value: { pid: b.pid, chatId: typeof b.chatId === 'string' && b.chatId ? b.chatId : null, message } }
}

/** Thread title from the first message: one line, cut at a word boundary. */
export function titleFromMessage(message: string): string {
  const line = message.replace(/\s+/g, ' ').trim()
  if (line.length <= MAX_TITLE_CHARS) return line || 'New chat'
  const cut = line.slice(0, MAX_TITLE_CHARS - 1)
  const space = cut.lastIndexOf(' ')
  return `${(space > 30 ? cut.slice(0, space) : cut).replace(/[\s,.;:!?-]+$/, '')}…`
}

/** "Today" as YYYY-MM-DD in India time. */
export function todayIst(now: Date = new Date()): string {
  return new Date(now.getTime() + 330 * 60 * 1000).toISOString().slice(0, 10)
}

/** User-facing message for a failed model call (never the raw error). */
export function friendlyModelError(err: unknown): { message: string; code: string } {
  const status = (err as { status?: number })?.status
  if (status === 429) return { message: 'The assistant is busy right now. Please try again in a minute.', code: 'model_busy' }
  if (status === 400) return { message: "The assistant couldn't process that request. Try rephrasing it.", code: 'model_rejected' }
  return { message: 'Something went wrong while answering. Please try again.', code: 'model_error' }
}
