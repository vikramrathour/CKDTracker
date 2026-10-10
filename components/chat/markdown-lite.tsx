'use client'

import Link from 'next/link'
import { Fragment } from 'react'
import { formatDate } from '@/lib/utils'
import { parseBlocks, type Inline } from './markdown'

interface Props {
  text: string
  /** Record link for a cited date, or null when no report exists on that date. */
  citationHref: (date: string) => string | null
}

function citeLabel(date: string): string {
  try {
    return formatDate(date, 'd MMM yy')
  } catch {
    return date
  }
}

function renderInline(nodes: Inline[], citationHref: Props['citationHref'], keyPrefix = ''): React.ReactNode[] {
  return nodes.map((n, i) => {
    const key = `${keyPrefix}${i}`
    switch (n.type) {
      case 'text':
        return <Fragment key={key}>{n.text}</Fragment>
      case 'bold':
        return (
          <strong key={key} className="font-semibold text-ink">
            {renderInline(n.children, citationHref, `${key}-`)}
          </strong>
        )
      case 'italic':
        return <em key={key}>{n.text}</em>
      case 'cite': {
        const href = citationHref(n.date)
        const cls =
          'mx-0.5 inline-flex items-center rounded-btn px-1.5 py-px align-baseline text-[11px] font-semibold tabular leading-tight'
        return href ? (
          <Link key={key} href={href} className={`${cls} bg-sage-pale text-sage hover:bg-sage hover:text-canvas`} title={`Open the report from ${n.date}`}>
            {citeLabel(n.date)}
          </Link>
        ) : (
          <span key={key} className={`${cls} bg-recess text-ink-3`} title="No report on this date">
            {citeLabel(n.date)}
          </span>
        )
      }
    }
  })
}

/** Safe renderer: React elements only, never dangerouslySetInnerHTML. */
export function MarkdownLite({ text, citationHref }: Props) {
  const blocks = parseBlocks(text)
  return (
    <div className="space-y-2.5">
      {blocks.map((b, i) => {
        if (b.type === 'p') return <p key={i}>{renderInline(b.content, citationHref)}</p>
        const ListTag = b.type === 'ul' ? 'ul' : 'ol'
        return (
          <ListTag key={i} className={`space-y-1 pl-5 ${b.type === 'ul' ? 'list-disc marker:text-terra' : 'list-decimal marker:text-ink-3'}`}>
            {b.items.map((item, j) => (
              <li key={j}>{renderInline(item, citationHref)}</li>
            ))}
          </ListTag>
        )
      })}
    </div>
  )
}
