'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { formatDelta } from '@/lib/calculations/deltas'
import type { CompareCell, CompareGroup, CompareRow, Comparison } from '@/lib/calculations/compare'
import { useTestSheet } from '@/components/trends/test-sheet'
import { STATUS_STYLES } from '@/components/ui/status'
import { cn, formatShortDate, formatValue } from '@/lib/utils'

/**
 * Tests as rows, "Latest · Previous · Before" as columns (lib/calculations/compare.ts).
 * Values that need attention are pinned on top; every panel is a collapsible
 * section with a one-line summary. Tapping a row opens the test's chart sheet.
 */

export interface CompareTableProps {
  comparison: Comparison
  /** Value columns to show (2 or 3, capped by comparison.depth). */
  columns?: 2 | 3
  /** Column headings, newest first. */
  columnLabels?: string[]
  /** Start panels without out-of-range values collapsed. */
  collapseNormal?: boolean
  /** Larger type for the doctor view. */
  size?: 'md' | 'lg'
  /** Sticky offset for the column header (default below the 64px app header). */
  stickyClassName?: string
  /** Override the default (open the test sheet). */
  onRowClick?: (row: CompareRow) => void
  className?: string
}

const DEFAULT_LABELS = ['Latest', 'Previous', 'Before']

export function CompareTable({
  comparison,
  columns = 3,
  columnLabels = DEFAULT_LABELS,
  collapseNormal = false,
  size = 'md',
  stickyClassName = 'top-16',
  onRowClick,
  className,
}: CompareTableProps) {
  const sheet = useTestSheet()
  const n = Math.min(columns, comparison.depth)
  const open = onRowClick ?? ((row: CompareRow) => sheet?.open(row.testName))
  const grid = n === 3 ? 'grid-cols-[minmax(0,1fr)_repeat(3,4.4rem)]' : 'grid-cols-[minmax(0,1fr)_repeat(2,5rem)]'
  const lg = size === 'lg'

  if (comparison.rows.length === 0) {
    return <p className={cn('py-6 text-center text-sm text-ink-3', className)}>No results yet.</p>
  }

  return (
    <div className={className}>
      <div
        className={cn(
          'sticky z-10 grid items-end gap-x-1 border-b border-hair-2 bg-canvas/95 px-1 pb-1.5 pt-2 backdrop-blur-sm',
          grid,
          stickyClassName
        )}
        aria-hidden
      >
        <span className="label text-ink-3">Test</span>
        {columnLabels.slice(0, n).map((l, i) => (
          <span key={i} className={cn('label text-right', i === 0 ? 'text-ink' : 'text-ink-3')}>
            {l}
          </span>
        ))}
      </div>

      {comparison.attention.length > 0 && (
        <Section
          title="Needs attention"
          summary={`${comparison.attention.length} outside range`}
          tone="attention"
          rows={comparison.attention}
          n={n}
          grid={grid}
          lg={lg}
          defaultOpen
          onRow={open}
        />
      )}

      {comparison.groups.map((g) => (
        <Section
          key={g.id}
          title={g.label}
          summary={groupSummary(g)}
          tone={g.id === 'older' ? 'muted' : 'normal'}
          rows={g.rows}
          n={n}
          grid={grid}
          lg={lg}
          defaultOpen={!collapseNormal || g.outCount > 0}
          onRow={open}
        />
      ))}
    </div>
  )
}

function groupSummary(g: CompareGroup): string {
  const tests = `${g.rows.length} test${g.rows.length === 1 ? '' : 's'}`
  if (g.id === 'older') return `${tests} · not in recent reports`
  return `${tests} · all in range`
}

function Section({
  title,
  summary,
  tone,
  rows,
  n,
  grid,
  lg,
  defaultOpen,
  onRow,
}: {
  title: string
  summary: string
  tone: 'attention' | 'normal' | 'muted'
  rows: CompareRow[]
  n: number
  grid: string
  lg: boolean
  defaultOpen: boolean
  onRow: (row: CompareRow) => void
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="border-b border-hair">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-[44px] w-full items-center gap-2 px-1 py-2 text-left"
      >
        {open ? <ChevronDown className="h-4 w-4 flex-shrink-0 text-ink-3" aria-hidden /> : <ChevronRight className="h-4 w-4 flex-shrink-0 text-ink-3" aria-hidden />}
        <span
          className={cn(
            'font-serif font-medium tracking-[-.01em]',
            lg ? 'text-lg' : 'text-[15px]',
            tone === 'attention' ? 'text-terra-dk' : tone === 'muted' ? 'text-ink-2' : 'text-ink'
          )}
        >
          {title}
        </span>
        <span className="ml-auto truncate text-[12px] text-ink-3">{summary}</span>
      </button>
      {open && (
        <ul className="pb-1">
          {rows.map((row) => (
            <li key={row.testName}>
              <Row row={row} n={n} grid={grid} lg={lg} onClick={() => onRow(row)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function Row({ row, n, grid, lg, onClick }: { row: CompareRow; n: number; grid: string; lg: boolean; onClick: () => void }) {
  const d = row.delta
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'grid w-full items-center gap-x-1 rounded-btn px-1 text-left transition-colors hover:bg-wash',
        lg ? 'min-h-[56px] py-2' : 'min-h-[46px] py-1.5',
        grid
      )}
    >
      <span className="min-w-0">
        <span className={cn('block truncate font-medium text-ink', lg ? 'text-[16px]' : 'text-[14px]')}>{row.label}</span>
        <span className="flex items-center gap-1.5 text-[11px] leading-tight text-ink-3">
          {row.unit && <span className="truncate">{row.unit}</span>}
          {d && d.direction !== 'stable' && (
            <span className={cn('flex-shrink-0 font-semibold tabular', d.isGood ? 'text-sage' : 'text-terra-dk')}>
              {d.direction === 'up' ? '↑' : '↓'} {formatDelta(d).replace(/^[+-]/, '')}
            </span>
          )}
          {d && d.direction === 'stable' && <span className="flex-shrink-0 tabular">→ no change</span>}
        </span>
      </span>
      {row.cells.slice(0, n).map((cell, i) => (
        <Cell key={i} cell={cell} latest={i === 0} lg={lg} />
      ))}
    </button>
  )
}

function Cell({ cell, latest, lg }: { cell: CompareCell | null; latest: boolean; lg: boolean }) {
  if (!cell) return <span className="text-right text-[13px] text-ink-3">—</span>
  const s = STATUS_STYLES[cell.status]
  const flagged = cell.status !== 'good'
  return (
    <span className="flex flex-col items-end">
      <span className="flex items-center gap-1">
        {flagged && <span className={cn('h-1.5 w-1.5 rounded-full', s.dot)} aria-hidden />}
        <span
          className={cn(
            'num tabular leading-none',
            lg ? (latest ? 'text-[21px]' : 'text-[17px]') : latest ? 'text-[17px]' : 'text-[15px]',
            flagged ? 'text-terra-dk' : latest ? 'text-ink' : 'text-ink-2',
            latest && 'font-semibold'
          )}
        >
          {formatValue(cell.value, cell.unit)}
        </span>
        <span className="sr-only">{flagged ? ` (${s.label})` : ''}</span>
      </span>
      <span className="mt-0.5 text-[10.5px] leading-none text-ink-3 tabular">{formatShortDate(cell.date)}</span>
    </span>
  )
}
