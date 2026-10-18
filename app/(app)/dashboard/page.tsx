'use client'

import Link from 'next/link'
import { Header, primaryIconButton } from '@/components/layout/header'
import { KeyTiles } from '@/components/dashboard/key-tiles'
import { HealthScoreRow } from '@/components/dashboard/health-score-row'
import { useLabRecords } from '@/lib/hooks/use-lab-records'
import { computeHealthScore } from '@/lib/calculations/health-score'
import { buildComparison } from '@/lib/calculations/compare'
import { useTargets } from '@/lib/hooks/use-targets'
import { AlertsBanner } from '@/components/alerts/alerts-banner'
import { PendingInvitesBanner } from '@/components/care-circle/incoming-invites'
import { UpcomingVisitCard } from '@/components/visits/visit-card'
import { useVisits } from '@/components/visits/hooks'
import { splitVisits } from '@/lib/visits/types'
import { VitalsQuickEntry } from '@/components/vitals/vitals-quick-entry'
import { CompareTable } from '@/components/compare/compare-table'
import { OpenReportButton } from '@/components/records/open-report-button'
import { CardSkeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/utils'
import { useRouter } from 'next/navigation'
import { useMemo, useRef, useState } from 'react'
import { Stethoscope, Upload } from 'lucide-react'
import { usePatient, useCanEdit } from '@/components/providers/patient-provider'
import { addLabRecord } from '@/lib/firebase/firestore'
// Synthetic demo data only — client code must never import the personal-data alias
import { SEED_RECORDS } from '@/lib/constants/seed-data'

const DEMO_ENABLED = process.env.NEXT_PUBLIC_ENABLE_DEMO === '1'

export default function DashboardPage() {
  const router = useRouter()
  const { pid, activePatient, patients } = usePatient()
  const canEdit = useCanEdit()
  const { records, loading } = useLabRecords()
  const { targetMap } = useTargets()
  const { visits } = useVisits()
  const nextVisit = splitVisits(visits).upcoming[0]
  const [demoLoading, setDemoLoading] = useState(false)
  const [demoError, setDemoError] = useState<string | null>(null)
  const demoInFlight = useRef(false)
  // Latest vs previous per test (columns are per test: reports are often partial)
  const comparison = useMemo(() => buildComparison(records, { targets: targetMap }), [records, targetMap])

  async function loadDemoData() {
    if (!pid || !canEdit || demoInFlight.current) return
    demoInFlight.current = true
    setDemoLoading(true)
    setDemoError(null)
    try {
      for (const record of SEED_RECORDS) {
        await addLabRecord(pid, {
          recordDate: new Date(record.recordDate),
          labName: record.labName,
          values: record.values,
        })
      }
    } catch (err) {
      console.error('Failed to load demo data:', err)
      setDemoError('Failed to load demo data')
    } finally {
      demoInFlight.current = false
      setDemoLoading(false)
    }
  }

  if (loading) {
    return (
      <>
        <Header title="CKD Tracker" emphasis="Tracker" />
        <main className="px-4 py-4 space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
          <CardSkeleton />
          <CardSkeleton />
        </main>
      </>
    )
  }

  if (records.length === 0) {
    return (
      <>
        <Header title="CKD Tracker" emphasis="Tracker" />
        <main className="px-4 pt-16 text-center">
          <p className="eyebrow mb-3">Getting started</p>
          <h2 className="font-serif text-[2rem] font-normal leading-tight tracking-[-.02em] text-ink">
            No records <em className="italic text-terra-dk">yet</em>
          </h2>
          <p className="mx-auto mt-3 max-w-[34ch] text-[15px] text-ink-2">
            {canEdit
              ? 'Add your first lab report to see the health dashboard.'
              : `No reports have been added for ${activePatient?.displayName ?? 'this profile'} yet.`}
          </p>
          {canEdit && (
            <div className="mt-8">
              <Button onClick={() => router.push('/upload')}>
                <Upload className="h-4 w-4" aria-hidden />
                Upload a report
              </Button>
              <p className="mt-3">
                <button type="button" onClick={() => router.push('/records/new')} className="tlink text-[13px]">
                  or enter values by hand
                </button>
              </p>
            </div>
          )}
          {DEMO_ENABLED && canEdit && (
            <div className="mt-8">
              <Button
                onClick={loadDemoData}
                variant="secondary"
                disabled={!pid}
                loading={demoLoading}
              >
                {demoLoading ? 'Loading demo data…' : 'Load demo data'}
              </Button>
              <p className="mt-3 text-xs text-ink-3">Synthetic sample records, not real results.</p>
              {demoError && <p role="alert" className="mt-2 text-sm text-critical">{demoError}</p>}
            </div>
          )}
        </main>
      </>
    )
  }

  // Records are ascending by date: the newest is last
  const latestRecord = records[records.length - 1]
  const healthScore = computeHealthScore(latestRecord.values, targetMap)

  return (
    <>
      <Header
        title="CKD Tracker"
        emphasis="Tracker"
        subtitle={`Last: ${formatDate(latestRecord.recordDate, 'dd MMM yy')}`}
        actions={
          canEdit ? (
            <button
              type="button"
              onClick={() => router.push('/upload')}
              aria-label="Upload report"
              className={primaryIconButton}
            >
              <Upload className="h-[18px] w-[18px]" />
            </button>
          ) : undefined
        }
      />
      <main className="space-y-4 px-4 py-4">
        <PendingInvitesBanner />

        {/* Key numbers: latest vs previous, tap for the chart */}
        <KeyTiles rows={comparison.rows} />

        <AlertsBanner />
        {nextVisit && <UpcomingVisitCard visit={nextVisit} />}

        {/* Latest results: 2-column comparison, normal panels collapsed */}
        <section aria-labelledby="latest-results">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2
                id="latest-results"
                className="font-serif text-[1.375rem] font-medium leading-tight tracking-[-.015em] text-ink"
              >
                Latest <em className="italic text-terra-dk">results</em>
              </h2>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                {comparison.latestDate && (
                  <span className="text-[13px] text-ink-3 tabular">
                    as of {formatDate(comparison.latestDate, 'd MMM yyyy')}
                  </span>
                )}
                <OpenReportButton pdfPath={latestRecord.pdfPath} variant="link" label="Open report" />
              </div>
            </div>
            <Link
              href="/compare"
              className="inline-flex min-h-[44px] flex-shrink-0 items-center gap-1.5 rounded-btn border-[1.5px] border-terra px-3 text-[13px] font-semibold text-terra-dk transition-colors hover:bg-terra-pale"
            >
              <Stethoscope className="h-4 w-4" aria-hidden />
              Show doctor
            </Link>
          </div>
          <CompareTable
            comparison={comparison}
            columns={2}
            columnLabels={['Latest', 'Previous']}
            collapseNormal
            className="mt-2"
          />
        </section>

        <HealthScoreRow score={healthScore} />

        <VitalsQuickEntry />

        {patients.length === 1 && (
          <p className="pt-2 text-center">
            <button type="button" onClick={() => router.push('/onboarding')} className="tlink text-[13px]">
              Track someone else&rsquo;s reports →
            </button>
          </p>
        )}
      </main>
    </>
  )
}
