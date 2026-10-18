'use client'

import { useMemo, type ReactNode } from 'react'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { CompareTable } from '@/components/compare/compare-table'
import { usePatient } from '@/components/providers/patient-provider'
import { useTargets } from '@/lib/hooks/use-targets'
import { buildComparison } from '@/lib/calculations/compare'
import type { VisitPrepSummary } from '@/lib/visits/prep'
import { formatDate, cn } from '@/lib/utils'

/**
 * Visit prep, in the order it's used at the desk: last visit's advice, the
 * actions (doctor view, PDF), alerts, the latest results next to the previous
 * two, then medications and questions. The comparison is built from the
 * records up to the visit date, so an old visit's prep doesn't show later reports.
 */
export function PrepView({ summary, actions }: { summary: VisitPrepSummary; actions?: ReactNode }) {
  const { records } = usePatient()
  const { targetMap } = useTargets()
  const visitDate = summary.visit.visitDate
  const comparison = useMemo(
    () => buildComparison(records.filter((r) => r.recordDate.slice(0, 10) <= visitDate), { targets: targetMap }),
    [records, visitDate, targetMap]
  )

  return (
    <div className="space-y-7">
      {(summary.previousVisit?.advice || actions) && (
        <div className="space-y-4">
          {summary.previousVisit?.advice && (
            <section className="rounded-card border border-l-2 border-hair border-l-terra bg-vellum p-4">
              <p className="eyebrow">
                Advice last time · {formatDate(summary.previousVisit.visitDate, 'd MMM yyyy')}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{summary.previousVisit.advice}</p>
            </section>
          )}
          {actions}
        </div>
      )}

      <section aria-labelledby="alerts-h">
        <h2 id="alerts-h" className="font-serif text-xl font-medium text-ink">
          Recent <em className="italic text-terra-dk">alerts</em>{' '}
          <span className="font-sans text-sm text-ink-3 tabular">({summary.alerts.length})</span>
        </h2>
        {summary.alerts.length === 0 ? (
          <p className="mt-1 text-sm text-ink-3">No alerts.</p>
        ) : (
          <ul className="mt-2 space-y-2">
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

      <section aria-labelledby="results-h">
        <h2 id="results-h" className="font-serif text-xl font-medium text-ink">
          Latest <em className="italic text-terra-dk">results</em>
        </h2>
        <p className="mt-1 text-sm text-ink-2">
          {summary.previousVisit ? (
            <>
              Since the{' '}
              <Link href={`/visits/${summary.previousVisit.id}`} className="tlink">
                visit on {formatDate(summary.previousVisit.visitDate, 'd MMM yyyy')}
              </Link>
              : {summary.newRecords.length} new report{summary.newRecords.length === 1 ? '' : 's'}.
            </>
          ) : (
            <>No earlier visit recorded.</>
          )}
        </p>
        <CompareTable comparison={comparison} columns={3} collapseNormal className="mt-2" />
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
    </div>
  )
}
