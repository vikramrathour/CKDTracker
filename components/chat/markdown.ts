/**
 * Markdown-lite for assistant answers: paragraphs, bullet/numbered lists,
 * **bold**, *italic* and [YYYY-MM-DD] citations. Produces a token tree that
 * the renderer turns into React elements — model text is never injected as HTML.
 */

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'bold'; children: Inline[] }
  | { type: 'italic'; text: string }
  | { type: 'cite'; date: string }

export type Block =
  | { type: 'p'; content: Inline[] }
  | { type: 'ul'; items: Inline[][] }
  | { type: 'ol'; items: Inline[][] }

const BULLET = /^\s*[-*•]\s+(.*)$/
const NUMBERED = /^\s*\d{1,2}[.)]\s+(.*)$/
const CITE_GROUP = /\[(\d{4}-\d{2}-\d{2}(?:\s*[,;]\s*\d{4}-\d{2}-\d{2})*)\]/

function parseCitesAndText(text: string): Inline[] {
  const out: Inline[] = []
  let rest = text
  while (rest) {
    const m = rest.match(CITE_GROUP)
    if (!m || m.index === undefined) {
      out.push({ type: 'text', text: rest })
      break
    }
    if (m.index > 0) out.push({ type: 'text', text: rest.slice(0, m.index) })
    for (const d of m[1].split(/\s*[,;]\s*/)) out.push({ type: 'cite', date: d })
    rest = rest.slice(m.index + m[0].length)
  }
  return out
}

function parseItalic(text: string): Inline[] {
  const out: Inline[] = []
  const re = /(^|[^*\w])\*([^*\s][^*]*?)\*(?![*\w])/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const start = m.index + m[1].length
    if (start > last) out.push(...parseCitesAndText(text.slice(last, start)))
    out.push({ type: 'italic', text: m[2] })
    last = start + m[2].length + 2
  }
  if (last < text.length) out.push(...parseCitesAndText(text.slice(last)))
  return out
}

export function parseInline(text: string): Inline[] {
  const out: Inline[] = []
  const parts = text.split(/\*\*/)
  // Odd segments are bold only when the ** is balanced.
  const balanced = parts.length % 2 === 1
  parts.forEach((seg, i) => {
    if (!seg) return
    if (i % 2 === 1 && balanced) out.push({ type: 'bold', children: parseItalic(seg) })
    else out.push(...parseItalic(i % 2 === 1 ? `**${seg}` : seg))
  })
  return out
}

export function parseBlocks(text: string): Block[] {
  const blocks: Block[] = []
  let para: string[] = []
  let list: { type: 'ul' | 'ol'; items: string[] } | null = null

  const flushPara = () => {
    if (para.length) blocks.push({ type: 'p', content: parseInline(para.join(' ')) })
    para = []
  }
  const flushList = () => {
    if (list) blocks.push({ type: list.type, items: list.items.map(parseInline) })
    list = null
  }

  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.replace(/^#{1,6}\s+/, '') // headings are rendered as plain paragraphs
    const b = line.match(BULLET)
    const n = b ? null : line.match(NUMBERED)
    if (b || n) {
      flushPara()
      const type = b ? 'ul' : 'ol'
      if (!list || list.type !== type) {
        flushList()
        list = { type, items: [] }
      }
      list.items.push((b ?? n)![1].trim())
    } else if (!line.trim()) {
      flushPara()
      flushList()
    } else if (list && /^\s{2,}\S/.test(raw)) {
      // indented continuation of the previous list item
      list.items[list.items.length - 1] += ` ${line.trim()}`
    } else {
      flushList()
      para.push(line.trim())
    }
  }
  flushPara()
  flushList()
  return blocks
}
