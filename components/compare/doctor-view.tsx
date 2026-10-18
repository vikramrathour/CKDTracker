'use client'

import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { usePatient } from '@/components/providers/patient-provider'
import { useTargets } from '@/lib/hooks/use-targets'
import { buildComparison, type CompareRow } from '@/lib/calculations/compare'
import { formatDelta } from '@/lib/calculations/deltas'
import { CRITICAL_METRICS } from '@/lib/constants/test-panels'
import { CompareTable } from '@/components/compare/compare-table'
import { OpenReportButton } from '@/components/records/open-report-button'
import { STATUS_STYLES } from '@/components/ui/status'
import { Skeleton } from '@/components/ui/skeleton'
import { cn, formatDate, formatShortDate, formatValue, formatYmd } from '@/lib/utils'

/** Original reports linked in the footer (newest first). */
const REPORT_LINKS = 3

type WakeLock = { release: () => Promise<void> }
type WakeLockNavigator = Navigator & { wakeLock?: { request: (t: 'screen') => Promise<WakeLock> } }

/**
 * "Hand the phone across the desk": full screen over the app chrome, large
 * type, the latest results next to the previous two. Keeps the screen awake
 * while open (Wake Lock API, best-effort; re-acquired when the page becomes
 * visible again, since the browser drops the lock when it is hidden).
 */
export function DoctorView() {
  const router = useRouter()
  const rootRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const { activePatient, records, recordsLoading } = usePatient()
  const { targetMap } = useTargets()

  const close = useCallback(() => {
    if (window.history.length > 1) router.back()
    else router.replace('/dashboard')
  }, [router])

  useEffect(() => {
    closeRef.current?.focus()
    let lock: WakeLock | null = null
    const nav = navigator as WakeLockNavigator
    const acquire = () => {
      if (document.visibilityState !== 'visible') return
      nav.wakeLock?.request('screen').then((l) => (lock = l)).catch(() => {})
    }
    acquire()
    document.addEventListener('visibilitychange', acquire)

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // A test sheet opened from the table sits on top and closes itself first.
      const other = Array.from(document.querySelectorAll('[role="dialog"]')).some((d) => d !== rootRef.current)
      if (!other) close()
    }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('visibilitychange', acquire)
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      lock?.release().catch(() => {})
    }
  }, [close])

  const comparison = useMemo(() => buildComparison(records, { targets: targetMap }), [records, targetMap])
  const keyRows = CRITICAL_METRICS.map((t) => comparison.rows.find((r) => r.testName === t)).filter(
    (r): r is CompareRow => r != null
  )
  const reports = useMemo(
    () =>
      records
        .filter((r) => r.pdfPath)
        .sort((a, b) => b.recordDate.localeCompare(a.recordDate))
        .slice(0, REPORT_LINKS),
    [records]
  )

  const name = activePatient?.displayName ?? 'Patient'
  const transplant = activePatient?.transplantDate

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label="Results for the doctor"
      className="fixed inset-0 z-[60] overflow-y-auto bg-canvas"
    >
      <div className="mx-auto max-w-4xl pb-[calc(env(safe-area-inset-bottom)+2.5rem)] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[calc(env(safe-area-inset-top)+1rem)] sm:pl-[max(1.5rem,env(safe-area-inset-left))] sm:pr-[max(1.5rem,env(safe-area-inset-right))] md:max-w-5xl">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="eyebrow">For the doctor</p>
            <h1 className="mt-1 truncate font-serif text-[2rem] font-normal leading-tight tracking-[-.02em] text-ink sm:text-[2.25rem]">
              {name}
            </h1>
            <p className="text-[15px] text-ink-2 tabular">
              {comparison.latestDate ? `Results as of ${formatDate(comparison.latestDate, 'd MMM yyyy')}` : 'No results yet'}
              {transplant && <span className="text-ink-3"> · Transplant {formatYmd(transplant.slice(0, 10))}</span>}
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={close}
            aria-label="Close doctor view"
            className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-btn border border-hair-2 text-ink-2 hover:bg-wash"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {recordsLoading ? (
          <div className="mt-6 space-y-3">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : comparison.rows.length === 0 ? (
          <div className="mt-16 text-center">
            <p className="font-serif text-xl text-ink">No lab results yet</p>
            <p className="mt-1 text-sm text-ink-3">Add a report and the latest numbers will show here.</p>
            <button
              type="button"
              onClick={close}
              className="mt-6 min-h-[44px] rounded-btn border border-ink px-5 text-sm text-ink hover:bg-wash"
            >
              Close
            </button>
          </div>
        ) : (
          // Key tiles stay one row at every width: a phone in landscape is only ~390px
          // tall, so a side column of tiles would show one tile at a time.
          <div className="mt-5">
            {keyRows.length > 0 && (
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                {keyRows.map((row) => (
                  <KeyTile key={row.testName} row={row} />
                ))}
              </div>
            )}

            <div className="mt-5">
              <CompareTable
                comparison={comparison}
                columns={3}
                size="lg"
                stickyClassName="top-[env(safe-area-inset-top)]"
              />

              {reports.length > 0 && (
                <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="label text-ink-3">Original reports</span>
                  {reports.map((r) => (
                    <OpenReportButton
                      key={r.id}
                      pdfPath={r.pdfPath}
                      variant="link"
                      label={`${formatShortDate(r.recordDate)} report`}
                      className="min-h-[44px]"
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function KeyTile({ row }: { row: CompareRow }) {
  const latest = row.cells[0]
  const prev = row.cells[1]
  const d = row.delta
  const flagged = row.status !== 'good'
  return (
    <div
      className={cn(
        'min-w-0 rounded-card border bg-vellum px-2.5 py-3 sm:p-4 landscape:py-2.5',
        flagged ? STATUS_STYLES[row.status].border : 'border-hair'
      )}
    >
      <p className="label truncate text-ink-3">{row.testName === 'Tacrolimus' ? 'Tacrolimus' : row.label}</p>
      {latest && (
        <p className="mt-1.5">
          <span className={cn('num block text-[1.75rem] leading-none sm:text-[2.5rem] landscape:text-[2rem]', flagged ? 'text-terra-dk' : 'text-ink')}>
            {formatValue(latest.value, latest.unit)}
          </span>
          <span className="mt-0.5 block truncate text-[11px] text-ink-3 sm:text-sm">{row.unit}</span>
          <span className="sr-only">{flagged ? ` (${STATUS_STYLES[row.status].label})` : ''}</span>
        </p>
      )}
      {d && d.direction !== 'stable' && (
        <p className={cn('mt-1.5 text-[13px] font-semibold tabular sm:text-base', d.isGood ? 'text-sage' : 'text-terra-dk')}>
          {d.direction === 'up' ? '↑' : '↓'} {formatDelta(d).replace(/^[+-]/, '')}
        </p>
      )}
      {d && d.direction === 'stable' && <p className="mt-1.5 text-[13px] text-ink-3 sm:text-base">→ no change</p>}
      <p className="mt-0.5 truncate text-[12px] leading-snug text-ink-2 tabular sm:text-sm">
        {prev ? `was ${formatValue(prev.value, prev.unit)}` : 'no earlier value'}
      </p>
      {prev && <p className="truncate text-[11px] leading-snug text-ink-3 tabular sm:text-[13px]">{formatShortDate(prev.date)}</p>}
    </div>
  )
}
