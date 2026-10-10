import type { ChatEvent, ChatEventName } from '@/lib/server/chat/events'

/**
 * Incremental parser for the /api/chat text/event-stream. Feed it decoded
 * text chunks as they arrive (frames may be split anywhere); it returns the
 * complete events found so far. Pure, so it is unit tested.
 */
const KNOWN: ReadonlySet<ChatEventName> = new Set<ChatEventName>(['meta', 'delta', 'chart', 'proposal', 'done', 'error'])

export function createSSEParser() {
  let buffer = ''

  function parseFrame(frame: string): ChatEvent | null {
    let event = 'message'
    const data: string[] = []
    for (const line of frame.split('\n')) {
      if (!line || line.startsWith(':')) continue
      const idx = line.indexOf(':')
      const field = idx === -1 ? line : line.slice(0, idx)
      const value = idx === -1 ? '' : line.slice(idx + 1).replace(/^ /, '')
      if (field === 'event') event = value
      else if (field === 'data') data.push(value)
    }
    if (!KNOWN.has(event as ChatEventName) || data.length === 0) return null
    try {
      return { event, data: JSON.parse(data.join('\n')) } as ChatEvent
    } catch {
      return null
    }
  }

  return {
    push(chunk: string): ChatEvent[] {
      buffer += chunk.replace(/\r\n?/g, '\n')
      const out: ChatEvent[] = []
      let idx: number
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 2)
        const e = parseFrame(frame)
        if (e) out.push(e)
      }
      return out
    },
    /** Parse whatever is left when the stream ends without a trailing blank line. */
    flush(): ChatEvent[] {
      const rest = buffer.trim()
      buffer = ''
      const e = rest ? parseFrame(rest) : null
      return e ? [e] : []
    },
  }
}
