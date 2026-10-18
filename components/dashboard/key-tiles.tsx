'use client'

import { ArrowDown, ArrowUp, Minus } from 'lucide-react'
import type { CompareRow } from '@/lib/calculations/compare'
import { formatDelta } from '@/lib/calculations/deltas'
import { useTestSheet } from '@/components/trends/test-sheet'
import { interactiveCard } from '@/components/ui/card'
import { STATUS_STYLES } from '@/components/ui/status'
import { cn, formatShortDate, formatValue } from '@/lib/utils'

const KEY_TESTS = [
  { testName: 'Creatinine', label: 'Creatinine' },
  { testName: 'eGFR', label: 'eGFR' },
  { testName: 'Tacrolimus', label: 'Tac level' },
]

/**
 * Creatinine / eGFR / Tacrolimus at a glance: latest value coloured by status,
 * the previous reading with its date, and an arrow for the change (sage when
 * the change is in the good direction). Tap → the test's chart sheet.
 * Rows come from buildComparison(), so cells carry their own dates.
 */
export function KeyTiles({ rows }: { rows: CompareRow[] }) {
  const sheet = useTestSheet()
  const byName = new Map(rows.map((r) => [r.testName, r]))

  return (
    <div className="grid grid-cols-3 gap-2">
      {KEY_TESTS.map(({ testName, label }) => {
        const row = byName.get(testName)
        const latest = row?.cells[0]
        if (!row || !latest) {
          return (
            <div key={testName} className="min-w-0 rounded-card border border-hair bg-vellum p-2.5">
              <div className="truncate text-[10px] font-bold uppercase tracking-[.08em] text-ink-3">{label}</div>
              <div className="num mt-1.5 text-[26px] leading-none text-ink-3">—</div>
              <div className="mt-1.5 text-[11px] text-ink-3">No reading</div>
            </div>
          )
        }

        const prev = row.cells[1]
        const styles = STATUS_STYLES[row.status]
        const delta = row.delta
        const Arrow = !delta || delta.direction === 'stable' ? Minus : delta.direction === 'up' ? ArrowUp : ArrowDown
        const deltaTone = !delta || delta.direction === 'stable' ? 'text-ink-3' : delta.isGood ? 'text-sage' : 'text-terra-dk'

        return (
          <button
            key={testName}
            type="button"
            onClick={() => sheet?.open(testName)}
            aria-label={`${label}: ${formatValue(latest.value, latest.unit)} ${row.unit}, ${styles.label}${
              prev ? `, previously ${formatValue(prev.value, prev.unit)} on ${formatShortDate(prev.date)}` : ''
            }. Show chart`}
            className={cn(
              'min-h-[44px] min-w-0 rounded-card border bg-vellum p-2.5 text-left',
              row.status === 'good' ? 'border-hair' : 'border-hair-hot',
              interactiveCard
            )}
          >
            <div className="flex items-center gap-1.5">
              {row.status !== 'good' && <span className="pulse-dot" aria-hidden />}
              <span className="truncate text-[10px] font-bold uppercase tracking-[.08em] text-ink-3">{label}</span>
            </div>
            <div className="mt-1.5 flex items-baseline gap-1">
              <span className={cn('num text-[26px] leading-none', row.status === 'good' ? 'text-ink' : styles.text)}>
                {formatValue(latest.value, latest.unit)}
              </span>
              {delta && (
                <span className={cn('inline-flex items-center', deltaTone)} title={formatDelta(delta)}>
                  <Arrow className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                </span>
              )}
            </div>
            <div className="mt-0.5 truncate text-[11px] text-ink-3">{row.unit}</div>
            {/* Two short lines: "was 1.35 · 20 Apr 25" doesn't fit a third of a phone. */}
            <div className="mt-1 truncate text-[11px] text-ink-2 tabular">
              {prev ? `was ${formatValue(prev.value, prev.unit)}` : <span className="text-ink-3">no earlier value</span>}
            </div>
            <div className="truncate text-[11px] text-ink-3 tabular">{formatShortDate((prev ?? latest).date)}</div>
          </button>
        )
      })}
    </div>
  )
}
