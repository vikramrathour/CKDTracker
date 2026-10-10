import { describe, expect, it } from 'vitest'
import { encodeSSE, type ChatEvent } from '@/lib/server/chat/events'
import { extractCitations, extractCitedDates } from '@/lib/server/chat/citations'
import { parseChatRequest, titleFromMessage, todayIst, friendlyModelError } from '@/lib/server/chat/request'
import { createSSEParser } from '@/components/chat/sse-parser'
import { parseBlocks, parseInline } from '@/components/chat/markdown'

describe('SSE encoder + parser', () => {
  const events: ChatEvent[] = [
    { event: 'meta', data: { chatId: 'c1', userMessageId: 'm1' } },
    { event: 'delta', data: { text: 'Line one\nline "two"\n\n' } },
    { event: 'chart', data: { testName: 'eGFR', unit: 'mL/min', points: [{ date: '2026-01-01', value: 70 }], refMin: 60, refMax: 120 } },
    { event: 'proposal', data: { text: 'Should my dose change?' } },
    { event: 'done', data: { messageId: 'm2', citations: [{ date: '2026-01-01', recordIds: ['r1'] }], usage: { tokensIn: 10, tokensOut: 5, totalTokens: 15 } } },
  ]

  it('encodes one frame per event with JSON on a single data line', () => {
    const f = encodeSSE(events[1])
    expect(f).toBe('event: delta\ndata: {"text":"Line one\\nline \\"two\\"\\n\\n"}\n\n')
    expect(f.split('\n\n')).toHaveLength(2)
  })

  it('round-trips through the parser regardless of chunk boundaries', () => {
    const wire = events.map(encodeSSE).join('')
    for (const size of [1, 3, 7, 64, wire.length]) {
      const p = createSSEParser()
      const got: ChatEvent[] = []
      for (let i = 0; i < wire.length; i += size) got.push(...p.push(wire.slice(i, i + size)))
      got.push(...p.flush())
      expect(got).toEqual(events)
    }
  })

  it('ignores comments, unknown events and bad JSON; handles CRLF and a missing trailing blank line', () => {
    const p = createSSEParser()
    const got = p.push(': ping\r\n\r\nevent: weird\r\ndata: {}\r\n\r\nevent: delta\r\ndata: {bad\r\n\r\nevent: delta\r\ndata: {"text":"ok"}')
    expect(got).toEqual([])
    expect(p.flush()).toEqual([{ event: 'delta', data: { text: 'ok' } }])
  })
})

describe('citations', () => {
  const records = [
    { id: 'a', recordDate: '2026-04-02T00:00:00.000Z' },
    { id: 'b', recordDate: '2026-06-04T00:00:00.000Z' },
    { id: 'b2', recordDate: '2026-06-04T00:00:00.000Z' },
  ]

  it('extracts bracketed dates in order, de-duplicated, including grouped ones', () => {
    expect(extractCitedDates('Up from 1.1 [2026-04-02] to 1.4 [2026-06-04]; see [2026-04-02].')).toEqual(['2026-04-02', '2026-06-04'])
    expect(extractCitedDates('Both [2026-04-02, 2026-06-04] and [2026-07-01; 2026-08-01]')).toEqual(['2026-04-02', '2026-06-04', '2026-07-01', '2026-08-01'])
  })

  it('ignores unbracketed and impossible dates', () => {
    expect(extractCitedDates('On 2026-04-02 and [2026-02-30] and [2026-13-01] and (2026-04-02)')).toEqual([])
  })

  it('maps dates to record ids and drops dates without a report', () => {
    expect(extractCitations('[2026-06-04] [2026-04-02] [2025-01-01]', records)).toEqual([
      { date: '2026-06-04', recordIds: ['b', 'b2'] },
      { date: '2026-04-02', recordIds: ['a'] },
    ])
  })
})

describe('request parsing', () => {
  it('validates pid, chatId and message', () => {
    expect(parseChatRequest(null)).toMatchObject({ ok: false, status: 400 })
    expect(parseChatRequest({ pid: 'a/b', message: 'hi' })).toMatchObject({ ok: false, error: 'Invalid patient id' })
    expect(parseChatRequest({ pid: 'p1', chatId: '../x', message: 'hi' })).toMatchObject({ ok: false, error: 'Invalid chat id' })
    expect(parseChatRequest({ pid: 'p1', message: '   ' })).toMatchObject({ ok: false, error: 'Message is required' })
    expect(parseChatRequest({ pid: 'p1', message: 'x'.repeat(2001) })).toMatchObject({ ok: false, status: 413 })
    expect(parseChatRequest({ pid: 'uid_abc123', chatId: '', message: ' hello \r\n there ' })).toEqual({
      ok: true,
      value: { pid: 'uid_abc123', chatId: null, message: 'hello \n there' },
    })
  })

  it('titles threads from the first message', () => {
    expect(titleFromMessage('Why is my potassium high?')).toBe('Why is my potassium high?')
    const t = titleFromMessage('Help me prepare for my next appointment with the transplant team on Thursday morning please')
    expect(t.length).toBeLessThanOrEqual(60)
    expect(t.endsWith('…')).toBe(true)
    expect(titleFromMessage('   ')).toBe('New chat')
  })

  it('uses India time for "today"', () => {
    expect(todayIst(new Date('2026-10-09T19:00:00Z'))).toBe('2026-10-10')
    expect(todayIst(new Date('2026-10-09T18:00:00Z'))).toBe('2026-10-09')
  })

  it('never leaks raw model errors', () => {
    expect(friendlyModelError(Object.assign(new Error('secret stack'), { status: 429 })).code).toBe('model_busy')
    expect(friendlyModelError(new Error('secret stack')).message).not.toContain('secret')
  })
})

describe('markdown-lite', () => {
  it('parses paragraphs and lists', () => {
    expect(parseBlocks('First para\nstill first.\n\n- one\n- two **bold**\n\n1. a\n2. b').map((b) => b.type)).toEqual(['p', 'ul', 'ol'])
  })

  it('parses bold, italic and citations as tokens (no HTML)', () => {
    expect(parseInline('**K⁺ 5.8** on [2026-09-28] is *high* <script>')).toEqual([
      { type: 'bold', children: [{ type: 'text', text: 'K⁺ 5.8' }] },
      { type: 'text', text: ' on ' },
      { type: 'cite', date: '2026-09-28' },
      { type: 'text', text: ' is ' },
      { type: 'italic', text: 'high' },
      { type: 'text', text: ' <script>' },
    ])
  })

  it('leaves unbalanced ** as text', () => {
    expect(parseInline('a ** b')).toEqual([
      { type: 'text', text: 'a ' },
      { type: 'text', text: '** b' },
    ])
  })
})
