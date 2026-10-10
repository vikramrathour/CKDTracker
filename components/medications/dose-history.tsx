'use client'

import { formatDate } from '@/lib/utils'
import { formatPersonName } from '@/lib/phone'
import type { DoseHistoryEntry } from '@/lib/calculations/medications'

/** Vertical timeline of dose changes, newest first. */
export function DoseHistoryTimeline({ history, loading }: { history: DoseHistoryEntry[]; loading?: boolean }) {
  if (loading) return <p className="py-4 text-sm text-ink-3">Loading history…</p>
  if (history.length === 0) {
    return (
      <p className="py-4 text-sm text-ink-3">
        No dose changes recorded yet. Changes you make to the dose or frequency will appear here.
      </p>
    )
  }
  const entries = [...history].reverse()
  return (
    <ol className="relative ml-1.5 border-l border-hair-2">
      {entries.map((e, i) => {
        const prev = [e.previousDose, e.previousFrequency].filter(Boolean).join(' · ')
        const next = [e.dose, e.frequency].filter(Boolean).join(' · ')
        return (
          <li key={e.id} className="relative pb-4 pl-5 last:pb-0">
            <span
              aria-hidden
              className={`absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-vellum ${i === 0 ? 'bg-terra' : 'bg-ink-3'}`}
            />
            <div className="text-[12px] font-semibold text-ink-3 tabular">{formatDate(e.effectiveDate, 'dd MMM yyyy')}</div>
            <div className="text-[15px] text-ink">
              {prev ? (
                <>
                  <span className="text-ink-3 line-through decoration-hair-hot">{prev}</span> → <span className="font-semibold">{next}</span>
                </>
              ) : (
                <span className="font-semibold">{next}</span>
              )}
            </div>
            {(e.reason || e.changedByName) && (
              <div className="text-[13px] text-ink-2">
                {e.reason}
                {e.reason && e.changedByName ? ' · ' : ''}
                {e.changedByName && <span className="text-ink-3">recorded by {formatPersonName(e.changedByName)}</span>}
              </div>
            )}
          </li>
        )
      })}
    </ol>
  )
}
