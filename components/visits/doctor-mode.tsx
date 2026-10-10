'use client'

import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { formatDelta } from '@/lib/calculations/deltas'
import { arrowFor, type VisitPrepSummary } from '@/lib/visits/prep'
import { formatDate, formatValue, cn } from '@/lib/utils'
import { rangeLabel } from './prep-view'

/**
 * "Hand the phone across the desk": one screen, large type, no navigation.
 * Keeps the screen awake while open (Wake Lock API, best-effort).
 */
export function DoctorMode({ summary, patientName, onClose }: { summary: VisitPrepSummary; patientName: string; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeRef.current?.focus()
    let lock: { release: () => Promise<void> } | null = null
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }
    nav.wakeLock?.request('screen').then((l) => (lock = l)).catch(() => {})
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      lock?.release().catch(() => {})
    }
  }, [onClose])

  const key = summary.changes.filter((c) => c.critical)
  const otherOut = summary.outOfRange.filter((c) => !c.critical)

  return (
    <div role="dialog" aria-modal="true" aria-label="Doctor summary" className="fixed inset-0 z-[60] overflow-y-auto bg-canvas">
      <div className="mx-auto max-w-2xl px-5 pb-16 pt-[calc(env(safe-area-inset-top)+1rem)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">For the doctor</p>
            <h1 className="mt-1 font-serif text-[2.25rem] font-normal leading-tight tracking-[-.02em] text-ink">{patientName}</h1>
            <p className="text-lg text-ink-2 tabular">
              Visit {formatDate(summary.visit.visitDate, 'd MMM yyyy')}
              {summary.previousVisit && ` · since ${formatDate(summary.previousVisit.visitDate, 'd MMM yyyy')}`}
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close doctor mode"
            className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-btn border border-hair-2 text-ink-2 hover:bg-wash"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {key.length > 0 && (
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {key.map((c) => (
              <div key={c.testName} className={cn('rounded-card border bg-vellum p-4', c.outOfRange ? 'border-terra' : 'border-hair')}>
                <p className="label text-ink-3">{c.label}</p>
                <p className={cn('num mt-1 text-[2.75rem] leading-none', c.outOfRange ? 'text-terra-dk' : 'text-ink')}>
                  {formatValue(c.latest, c.unit)}
                  <span className="ml-1.5 font-sans text-base text-ink-3">{c.unit}</span>
                </p>
                <p className="mt-2 text-lg tabular">
                  {c.delta ? (
                    <span className={c.delta.isGood ? 'text-sage' : 'text-terra-dk'}>
                      {arrowFor(c.delta.direction)} {formatDelta(c.delta)}
                      <span className="text-ink-3"> from {formatValue(c.baseline!, c.unit)}</span>
                    </span>
                  ) : (
                    <span className="text-ink-3">no earlier value</span>
                  )}
                </p>
                {rangeLabel(c) && <p className="text-sm text-ink-3">range {rangeLabel(c)}</p>}
              </div>
            ))}
          </div>
        )}

        {otherOut.length > 0 && (
          <section className="mt-8">
            <h2 className="font-serif text-2xl text-ink">Out of <em className="italic text-terra-dk">range</em></h2>
            <ul className="mt-2 border-t border-hair-2">
              {otherOut.map((c) => (
                <li key={c.testName} className="flex items-baseline justify-between gap-4 border-b border-hair-2 py-3 text-xl">
                  <span className="text-ink">{c.label}</span>
                  <span className="num text-terra-dk">
                    {formatValue(c.latest, c.unit)} <span className="font-sans text-sm text-ink-3">{c.unit} · {rangeLabel(c)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-8">
          <h2 className="font-serif text-2xl text-ink">Medications</h2>
          {summary.medications.length === 0 ? (
            <p className="mt-2 text-lg text-ink-3">None recorded</p>
          ) : (
            <ul className="mt-2 border-t border-hair-2">
              {summary.medications.map((m) => (
                <li key={m.id} className="flex flex-wrap items-baseline justify-between gap-x-4 border-b border-hair-2 py-3 text-xl">
                  <span className="font-semibold text-ink">{m.name}</span>
                  <span className="text-ink-2">{[m.dose, m.frequency].filter(Boolean).join(' · ')}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {summary.openQuestions.length > 0 && (
          <section className="mt-8">
            <h2 className="font-serif text-2xl text-ink">Questions</h2>
            <ol className="mt-2 space-y-3">
              {summary.openQuestions.map((q, i) => (
                <li key={q.id} className="flex gap-3 text-xl text-ink">
                  <span className="num text-terra-dk">{i + 1}.</span>
                  <span>{q.text}</span>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </div>
  )
}
