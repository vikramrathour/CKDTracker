'use client'

import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { formatDelta } from '@/lib/calculations/deltas'
import { formatRange } from '@/lib/calculations/targets'
import { arrowFor, type PrepChange, type VisitPrepSummary } from '@/lib/visits/prep'
import { formatDate, formatValue, cn } from '@/lib/utils'

export function rangeLabel(c: PrepChange): string {
  if (c.rangeMin == null && c.rangeMax == null) return ''
  return `${formatRange({ min: c.rangeMin, max: c.rangeMax })}${c.rangeSource === 'target' ? ' target' : ''}`
}

function ChangeRow({ c }: { c: PrepChange }) {
  return (
    <li className={cn('flex min-h-[52px] items-center gap-3 border-b border-hair-2 py-2', c.outOfRange && 'bg-terra-pale/50')}>
      <span className={cn('ml-1 h-2 w-2 flex-shrink-0 rounded-full', c.outOfRange ? 'bg-terra' : 'bg-sage')} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className={cn('truncate text-sm text-ink', c.critical && 'font-semibold')}>{c.label}</p>
        <p className="truncate text-xs text-ink-3 tabular">
          {c.baseline != null
            ? `was ${formatValue(c.baseline, c.unit)} on ${formatDate(c.baselineDate!, 'd MMM')}`
            : 'first result'}
          {rangeLabel(c) && ` · range ${rangeLabel(c)}`}
        </p>
      </div>
      <div className="text-right">
        <p className={cn('num text-[17px] font-medium', c.outOfRange ? 'text-terra-dk' : 'text-ink')}>
          {formatValue(c.latest, c.unit)} <span className="font-sans text-[11px] text-ink-3">{c.unit}</span>
        </p>
        <p className="text-xs tabular">
          {c.delta && (
            <span className={c.delta.isGood ? 'text-sage' : 'text-terra-dk'}>
              {arrowFor(c.delta.direction)} {formatDelta(c.delta)}
            </span>
          )}
          {c.trend && (
            <span className={cn('ml-2', c.trendGood ? 'text-ink-3' : 'text-terra-dk')} title="Trend over the last 5 results">
              trend {arrowFor(c.trend)}
            </span>
          )}
        </p>
      </div>
    </li>
  )
}

export function PrepView({ summary }: { summary: VisitPrepSummary }) {
  const others = summary.changes.filter((c) => !c.outOfRange)
  return (
    <div className="space-y-7">
      <p className="text-sm text-ink-2">
        {summary.previousVisit ? (
          <>
            Since the{' '}
            <Link href={`/visits/${summary.previousVisit.id}`} className="tlink">
              visit on {formatDate(summary.previousVisit.visitDate, 'd MMM yyyy')}
            </Link>
            : {summary.newRecords.length} new report{summary.newRecords.length === 1 ? '' : 's'}.
          </>
        ) : (
          <>No earlier visit recorded, so this shows the latest report.</>
        )}
      </p>

      <section aria-labelledby="alerts-h">
        <h2 id="alerts-h" className="label mb-2 text-ink-3">Alerts</h2>
        {summary.alerts.length === 0 ? (
          <p className="text-sm text-ink-3">No alerts.</p>
        ) : (
          <ul className="space-y-2">
            {summary.alerts.map((a, i) => (
              <li
                key={i}
                className={cn(
                  'flex items-start gap-2 rounded-card border border-l-2 border-hair bg-vellum p-3 text-sm',
                  a.severity === 'critical' ? 'border-l-critical' : 'border-l-terra'
                )}
              >
                <AlertTriangle className={cn('mt-0.5 h-4 w-4 flex-shrink-0', a.severity === 'critical' ? 'text-critical' : 'text-terra-dk')} aria-hidden />
                <span><strong className="font-semibold text-ink">{a.title}</strong>{a.detail && <span className="text-ink-3"> · {formatDate(a.detail, 'd MMM yyyy')}</span>}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="oor-h">
        <h2 id="oor-h" className="font-serif text-xl font-medium text-ink">
          Out of <em className="italic text-terra-dk">range</em>{' '}
          <span className="font-sans text-sm text-ink-3 tabular">({summary.outOfRange.length})</span>
        </h2>
        {summary.outOfRange.length === 0 ? (
          <p className="mt-1 text-sm text-ink-3">Everything in this period is within range.</p>
        ) : (
          <ul className="mt-2 border-t border-hair-2">
            {summary.outOfRange.map((c) => <ChangeRow key={c.testName} c={c} />)}
          </ul>
        )}
      </section>

      <section aria-labelledby="changes-h">
        <h2 id="changes-h" className="font-serif text-xl font-medium text-ink">
          Changes since <em className="italic text-terra-dk">last visit</em>
        </h2>
        {summary.changes.length === 0 ? (
          <p className="mt-1 text-sm text-ink-3">No lab results in this period.</p>
        ) : others.length === 0 ? (
          <p className="mt-1 text-sm text-ink-3">All results in this period are listed above.</p>
        ) : (
          <ul className="mt-2 border-t border-hair-2">
            {others.map((c) => <ChangeRow key={c.testName} c={c} />)}
          </ul>
        )}
        {summary.newRecords.length > 0 && (
          <p className="mt-3 text-xs text-ink-3">
            Reports:{' '}
            {summary.newRecords.map((r, i) => (
              <span key={r.id}>
                {i > 0 && ', '}
                <Link href={`/records/${r.id}`} className="underline decoration-hair-2 underline-offset-2 hover:text-ink">
                  {formatDate(r.recordDate, 'd MMM')}
                </Link>
              </span>
            ))}
          </p>
        )}
      </section>

      <section aria-labelledby="meds-h">
        <h2 id="meds-h" className="font-serif text-xl font-medium text-ink">
          Current <em className="italic text-terra-dk">medications</em>
        </h2>
        {summary.medications.length === 0 ? (
          <p className="mt-1 text-sm text-ink-3">No active medications recorded.</p>
        ) : (
          <ul className="mt-2 border-t border-hair-2">
            {summary.medications.map((m) => (
              <li key={m.id} className="flex items-baseline justify-between gap-3 border-b border-hair-2 py-2.5 text-sm">
                <span className="font-semibold text-ink">{m.name}</span>
                <span className="text-right text-ink-2">{[m.dose, m.frequency].filter(Boolean).join(' · ')}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="q-h">
        <h2 id="q-h" className="font-serif text-xl font-medium text-ink">
          Questions for the <em className="italic text-terra-dk">doctor</em>
        </h2>
        {summary.openQuestions.length === 0 ? (
          <p className="mt-1 text-sm text-ink-3">No open questions. <Link href="/questions" className="tlink">Add one</Link></p>
        ) : (
          <ol className="mt-2 space-y-2">
            {summary.openQuestions.map((q, i) => (
              <li key={q.id} className="flex items-start gap-2.5 text-[15px] text-ink">
                <span className="num w-5 flex-shrink-0 text-terra-dk">{i + 1}.</span>
                <span className="flex-1">{q.text}</span>
                {q.source === 'chat' && <Badge variant="neutral">AI</Badge>}
                {q.status === 'asked' && <Badge variant="info">asked</Badge>}
              </li>
            ))}
          </ol>
        )}
      </section>

      {summary.previousVisit?.advice && (
        <section className="rounded-card border border-l-2 border-hair border-l-terra bg-vellum p-4">
          <p className="eyebrow">Advice last time</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{summary.previousVisit.advice}</p>
        </section>
      )}
    </div>
  )
}
