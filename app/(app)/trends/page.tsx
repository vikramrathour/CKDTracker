'use client'

import { Suspense, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { LineChart } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { TestHistory } from '@/components/trends/test-sheet'
import { useLabRecords } from '@/lib/hooks/use-lab-records'
import { useTargets } from '@/lib/hooks/use-targets'
import { ChartSkeleton } from '@/components/ui/skeleton'
import { STATUS_STYLES } from '@/components/ui/status'
import { buildComparison, type CompareRow } from '@/lib/calculations/compare'
import { PANELS } from '@/lib/constants/test-panels'
import { cn, formatDate } from '@/lib/utils'
import type { Panel } from '@/lib/types/lab-record'

/**
 * /trends?test={testName}: one test at a time. Chips for the key tests, a
 * "More tests" select for everything else with readings (grouped by panel),
 * then the shared TestHistory (chart with normal band, time window, readings).
 * The test sheet links here with ?test= for the full history.
 */

const KEY_TESTS = ['Creatinine', 'eGFR', 'Tacrolimus', 'Potassium', 'Hemoglobin', 'Sodium']
const PANEL_ORDER: Panel[] = [...PANELS.map((p) => p.id), 'other']
const PANEL_LABEL: Record<string, string> = Object.fromEntries(PANELS.map((p) => [p.id, p.label]))

export default function TrendsPage() {
  return (
    <>
      <Header title="Key Trends" emphasis="Trends" />
      <Suspense fallback={<TrendsSkeleton />}>
        <TrendsView />
      </Suspense>
    </>
  )
}

function TrendsSkeleton() {
  return (
    <main className="px-4 py-4 space-y-4">
      <ChartSkeleton />
    </main>
  )
}

function TrendsView() {
  const { records, loading } = useLabRecords()
  const { targetMap, loading: targetsLoading } = useTargets()
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  // One row per test with readings; `status` is the latest reading's.
  const rows = useMemo(() => buildComparison(records, { depth: 1, targets: targetMap }).rows, [records, targetMap])
  const byName = useMemo(() => new Map(rows.map((r) => [r.testName, r])), [rows])

  const groups = useMemo(() => {
    const out: { id: Panel; label: string; rows: CompareRow[] }[] = []
    for (const panel of PANEL_ORDER) {
      const order = PANELS.find((p) => p.id === panel)?.tests ?? []
      const panelRows = rows
        .filter((r) => r.panel === panel)
        .sort((a, b) => {
          const ia = order.indexOf(a.testName)
          const ib = order.indexOf(b.testName)
          return (ia < 0 ? Infinity : ia) - (ib < 0 ? Infinity : ib) || a.label.localeCompare(b.label)
        })
      if (panelRows.length) out.push({ id: panel, label: PANEL_LABEL[panel] ?? 'Other tests', rows: panelRows })
    }
    return out
  }, [rows])

  const requested = params.get('test')
  const fallback = byName.has('Creatinine') ? 'Creatinine' : (groups[0]?.rows[0]?.testName ?? null)
  const selected = requested && byName.has(requested) ? requested : fallback

  const select = useCallback(
    (testName: string) => {
      const next = new URLSearchParams(params.toString())
      next.set('test', testName)
      router.replace(`${pathname}?${next.toString()}`, { scroll: false })
    },
    [params, pathname, router]
  )

  // First and latest date + count for the selected test (records are oldest first,
  // but sort anyway so the summary never depends on it).
  const summary = useMemo(() => {
    if (!selected) return null
    const dates = records
      .filter((r) => r.values.some((v) => v.testName === selected && Number.isFinite(v.value)))
      .map((r) => r.recordDate)
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
    return dates.length ? { count: dates.length, first: dates[0], last: dates[dates.length - 1] } : null
  }, [records, selected])

  if (loading || targetsLoading) return <TrendsSkeleton />

  if (!selected) {
    return (
      <main className="px-4 py-4">
        <div className="rounded-card border border-hair bg-vellum px-5 py-10 text-center">
          <LineChart className="mx-auto h-8 w-8 text-ink-3" aria-hidden />
          <h2 className="mt-3 font-serif text-[1.25rem] text-ink">No trends yet</h2>
          <p className="mt-1 text-[13px] text-ink-3">Add a lab report and its values will show here over time.</p>
          <Link href="/upload" className="tlink mt-4 inline-block text-[13px] font-semibold">
            Add a report
          </Link>
        </div>
      </main>
    )
  }

  const keyRows = KEY_TESTS.map((t) => byName.get(t)).filter((r): r is CompareRow => !!r)
  const isKey = KEY_TESTS.includes(selected) && byName.has(selected)

  return (
    <main className="px-4 py-4">
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Key tests">
        {keyRows.map((r) => {
          const active = r.testName === selected
          return (
            <button
              key={r.testName}
              type="button"
              aria-pressed={active}
              onClick={() => select(r.testName)}
              className={cn(
                'flex min-h-[44px] flex-shrink-0 items-center gap-2 rounded-btn border px-3 text-[13px] font-semibold transition-colors',
                active ? 'border-ink bg-ink text-canvas' : 'border-hair bg-vellum text-ink-2 hover:border-hair-2 hover:text-ink'
              )}
            >
              <span className={cn('h-2 w-2 flex-shrink-0 rounded-full', STATUS_STYLES[r.status].dot)} aria-hidden />
              {r.label}
              {r.status !== 'good' && <span className="sr-only">({STATUS_STYLES[r.status].label})</span>}
            </button>
          )
        })}
      </div>

      <label className="mt-3 block">
        <span className="sr-only">More tests</span>
        <select
          value={isKey ? '' : selected}
          onChange={(e) => e.target.value && select(e.target.value)}
          className={cn('field min-h-[44px]', isKey ? 'text-ink-3' : 'border-ink')}
        >
          <option value="">More tests…</option>
          {groups.map((g) => (
            <optgroup key={g.id} label={g.label}>
              {g.rows.map((r) => (
                <option key={r.testName} value={r.testName}>
                  {r.label}
                  {r.status !== 'good' ? ` · ${STATUS_STYLES[r.status].label}` : ''}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      <section className="mt-4 rounded-card border border-hair bg-vellum p-4 shadow-soft">
        <TestHistory key={selected} testName={selected} records={records} targets={targetMap} readingsLimit={12} />
      </section>

      {summary && (
        <p className="mt-3 text-[13px] text-ink-3 tabular">
          <span className="label mr-1.5 text-ink-3">Summary</span>
          {summary.count} {summary.count === 1 ? 'reading' : 'readings'}
          {' · '}
          {summary.count > 1
            ? `${formatDate(summary.first, 'd MMM yyyy')} → ${formatDate(summary.last, 'd MMM yyyy')}`
            : formatDate(summary.last, 'd MMM yyyy')}
          {' · '}
          <Link href="/targets" className="tlink font-semibold">
            {Object.keys(targetMap).length > 0 ? 'Edit targets' : 'Set targets'}
          </Link>
        </p>
      )}
    </main>
  )
}
