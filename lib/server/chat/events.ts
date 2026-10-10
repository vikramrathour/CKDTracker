/**
 * Wire contract for POST /api/chat (text/event-stream). Pure types + the SSE
 * encoder, so both the route and the browser parser (components/chat) can
 * import it. No server-only code here.
 *
 * Event order: meta → (delta | chart | proposal)* → done   — or → error.
 */

export interface ChartPayload {
  testName: string
  unit: string
  points: { date: string; value: number }[]
  refMin: number | null
  refMax: number | null
}

export interface Citation {
  /** YYYY-MM-DD as written by the model. */
  date: string
  /** labRecords id(s) on that date (usually one). */
  recordIds: string[]
}

export interface ChatUsage {
  tokensIn: number
  tokensOut: number
  totalTokens: number
}

export type ChatEvent =
  | { event: 'meta'; data: { chatId: string; userMessageId: string } }
  | { event: 'delta'; data: { text: string } }
  | { event: 'chart'; data: ChartPayload }
  | { event: 'proposal'; data: { text: string } }
  | { event: 'done'; data: { messageId: string; citations: Citation[]; usage: ChatUsage } }
  | { event: 'error'; data: { message: string; code?: string } }

export type ChatEventName = ChatEvent['event']

/** One SSE frame. JSON payloads never contain raw newlines, so a single data line suffices. */
export function encodeSSE(e: ChatEvent): string {
  return `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`
}

/** Persisted shape of patients/{pid}/chats/{chatId}/messages/{id} (superset of lib/types/care ChatMessage). */
export interface StoredChatMessageExtras {
  /** date → recordIds, for rendering [YYYY-MM-DD] links. */
  citationMap?: Record<string, string[]>
  /** Doctor-question proposals (not yet saved as questions). */
  proposals?: string[]
  /** compute_trend results shown as inline charts. */
  charts?: ChartPayload[]
}
