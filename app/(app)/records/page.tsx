'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Header, iconButton, primaryIconButton } from '@/components/layout/header'
import { useLabRecords } from '@/lib/hooks/use-lab-records'
import { useCanEdit } from '@/components/providers/patient-provider'
import { Badge } from '@/components/ui/badge'
import { ListSkeleton } from '@/components/ui/skeleton'
import { OpenReportButton } from '@/components/records/open-report-button'
import { cn, formatDate, formatValue } from '@/lib/utils'
import { valueStatus, type TargetMap } from '@/lib/calculations/targets'
import { useTargets } from '@/lib/hooks/use-targets'
import type { LabRecord } from '@/lib/types/lab-record'
import { Plus, Printer } from 'lucide-react'

/** The numbers glanced at first, in this order. */
const KEY_TESTS: { testName: string; label: string }[] = [
  { testName: 'Creatinine', label: 'Cr' },
  { testName: 'eGFR', label: 'eGFR' },
  { testName: 'Tacrolimus', label: 'Tac' },
  { testName: 'Potassium', label: 'K⁺' },
  { testName: 'Hemoglobin', label: 'Hb' },
]

/** Out-of-range badges per row; the rest is summarised as "+N". */
const MAX_BADGES = 3

function RecordRow({ record, targetMap }: { record: LabRecord; targetMap: TargetMap }) {
  const statuses = record.values.map((v) => ({ v, status: valueStatus(v.testName, v.value, v, targetMap) }))
  // Out-of-range first, then borderline, so the badges show the worst values.
  const abnormals = statuses
    .filter((s) => s.status !== 'good')
    .sort((a, b) => (a.status === b.status ? 0 : a.status === 'danger' ? -1 : 1))
  const keyValues = KEY_TESTS.flatMap((k) => {
    const s = statuses.find((x) => x.v.testName === k.testName)
    return s ? [{ ...k, ...s }] : []
  })

  return (
    <li id={`rec-${record.id}`} className="relative border-b border-hair-2 py-2.5 transition-colors hover:bg-wash/60">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <h3 className="flex-shrink-0 font-serif text-[1.125rem] font-normal leading-tight tracking-[-.01em] text-ink tabular">
              <Link
                href={`/records/${record.id}`}
                className="after:absolute after:inset-0 after:content-['']"
                aria-label={`Open the ${formatDate(record.recordDate, 'd MMM yyyy')} record`}
              >
                {formatDate(record.recordDate, 'd MMM')}
              </Link>
            </h3>
            <span className="min-w-0 truncate text-[13px] text-ink-3">{record.labName || '—'}</span>
            <span className="ml-auto flex-shrink-0 text-xs text-ink-3 tabular">
              {record.values.length} tests
              {abnormals.length > 0 && <span className="text-terra-dk"> · {abnormals.length} out</span>}
            </span>
          </div>

          {keyValues.length > 0 && (
            <dl className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
              {keyValues.map((kv) => (
                <div key={kv.testName} className="flex items-baseline gap-1">
                  <dt className="text-[11px] text-ink-3">{kv.label}</dt>
                  <dd className={cn('text-[13px] font-semibold tabular', kv.status === 'good' ? 'text-ink' : 'text-terra-dk')}>
                    {formatValue(kv.v.value, kv.v.unit)}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        {/* Above the row link; renders nothing without a file. */}
        <span className="relative z-10 -mr-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          <OpenReportButton pdfPath={record.pdfPath} variant="icon" className="h-11 w-11" />
        </span>
      </div>

      {abnormals.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {abnormals.slice(0, MAX_BADGES).map(({ v, status }) => (
            <Badge key={v.testName} variant={status} uppercase={false}>
              {v.testName}: {formatValue(v.value, v.unit)}
            </Badge>
          ))}
          {abnormals.length > MAX_BADGES && (
            <Badge variant="neutral" uppercase={false}>+{abnormals.length - MAX_BADGES}</Badge>
          )}
        </div>
      )}
    </li>
  )
}

export default function RecordsPage() {
  const router = useRouter()
  const canEdit = useCanEdit()
  const { records, loading, error } = useLabRecords()
  const { targetMap } = useTargets()

  // Newest first, grouped by year (records arrive ascending by recordDate).
  const years = useMemo(() => {
    const groups: { year: string; records: LabRecord[] }[] = []
    for (const record of [...records].reverse()) {
      const year = record.recordDate.slice(0, 4)
      const last = groups[groups.length - 1]
      if (last?.year === year) last.records.push(record)
      else groups.push({ year, records: [record] })
    }
    return groups
  }, [records])

  if (loading) {
    return (
      <>
        <Header title="Test History" emphasis="History" />
        <main className="px-4 py-4"><ListSkeleton rows={5} /></main>
      </>
    )
  }

  return (
    <>
      <Header
        title="Test History"
        emphasis="History"
        actions={
          <>
            <button
              type="button"
              onClick={() => router.push('/records/print')}
              aria-label="Print or export history"
              className={iconButton}
            >
              <Printer className="h-5 w-5" />
            </button>
            {canEdit && (
              <button
                type="button"
                onClick={() => router.push('/records/new')}
                aria-label="Add record"
                className={primaryIconButton}
              >
                <Plus className="h-5 w-5" />
              </button>
            )}
          </>
        }
      />
      <main className="px-4 pb-4">
        {error ? (
          <p role="alert" className="pt-20 text-center text-[15px] text-critical">{error}</p>
        ) : records.length === 0 ? (
          <div className="pt-20 text-center">
            <p className="text-[15px] text-ink-2">
              {canEdit ? 'No records yet. Add your first lab report.' : 'No records have been added yet.'}
            </p>
          </div>
        ) : (
          years.map((g) => (
            <section key={g.year} aria-labelledby={`year-${g.year}`}>
              <h2
                id={`year-${g.year}`}
                className="label sticky top-16 z-20 -mx-4 border-b border-hair-2 bg-canvas/95 px-4 pb-1.5 pt-3 text-ink-3 backdrop-blur-sm tabular"
              >
                {g.year}
              </h2>
              <ul>
                {g.records.map((record) => (
                  <RecordRow key={record.id} record={record} targetMap={targetMap} />
                ))}
              </ul>
            </section>
          ))
        )}
      </main>
    </>
  )
}
