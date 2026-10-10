'use client'

import { Header, primaryIconButton } from '@/components/layout/header'
import { HealthScoreRing } from '@/components/dashboard/health-score-ring'
import { SystemScores } from '@/components/dashboard/system-scores'
import { CriticalMetricCard } from '@/components/dashboard/critical-metric-card'
import { QuickStats } from '@/components/dashboard/quick-stats'
import { PanelOverview } from '@/components/dashboard/panel-overview'
import { useLabRecords, getTrendPoints, getValueFromRecord } from '@/lib/hooks/use-lab-records'
import { computeHealthScore } from '@/lib/calculations/health-score'
import { resolveRange, valueStatus } from '@/lib/calculations/targets'
import { useTargets } from '@/lib/hooks/use-targets'
import { AlertsBanner } from '@/components/alerts/alerts-banner'
import { PendingInvitesBanner } from '@/components/care-circle/incoming-invites'
import { UpcomingVisitCard } from '@/components/visits/visit-card'
import { useVisits } from '@/components/visits/hooks'
import { splitVisits } from '@/lib/visits/types'
import { VitalsQuickEntry } from '@/components/vitals/vitals-quick-entry'
import { CardSkeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { interactiveCard } from '@/components/ui/card'
import { cn, formatDate } from '@/lib/utils'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import { usePatient, useCanEdit } from '@/components/providers/patient-provider'
import { addLabRecord } from '@/lib/firebase/firestore'
// Synthetic demo data only — client code must never import the personal-data alias
import { SEED_RECORDS } from '@/lib/constants/seed-data'

const DEMO_ENABLED = process.env.NEXT_PUBLIC_ENABLE_DEMO === '1'

const CRITICAL_TESTS = [
  { testName: 'Creatinine', label: 'Creatinine' },
  { testName: 'eGFR', label: 'eGFR' },
  { testName: 'Tacrolimus', label: 'Tac Level' },
]

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
          <CardSkeleton />
          <div className="grid grid-cols-3 gap-2.5">
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

  const latestRecord = records[records.length - 1]
  const previousRecord = records.length > 1 ? records[records.length - 2] : undefined
  const healthScore = computeHealthScore(latestRecord.values, targetMap)

  // Determine trajectory from eGFR trend
  const egfrPoints = getTrendPoints(records, 'eGFR')
  let trajectory = 'stable'
  if (egfrPoints.length >= 3) {
    const last = egfrPoints[egfrPoints.length - 1].value
    const first = egfrPoints[0].value
    const change = last - first
    trajectory = change > 3 ? 'improving' : change < -3 ? 'declining' : 'stable'
  }

  // Find alerts from latest record
  const alerts = latestRecord.values
    .filter((v) => valueStatus(v.testName, v.value, v, targetMap) === 'danger')
    .map((v) => ({ v, range: resolveRange(v.testName, v, targetMap) }))

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
        <AlertsBanner />
        {nextVisit && <UpcomingVisitCard visit={nextVisit} />}

        {/* Health Score — tap to view analysis */}
        <div
          onClick={() => router.push('/analysis')}
          className={cn('rounded-card border border-hair bg-vellum p-4 shadow-soft', interactiveCard)}
        >
          <div className="flex items-center gap-4">
            <HealthScoreRing score={healthScore.overall} size={80} label="Overall" />
            <div className="min-w-0 flex-1">
              <h2 className="font-serif text-[1.375rem] font-medium leading-tight tracking-[-.015em] text-ink">
                Health <em className="italic text-terra-dk">score</em>
              </h2>
              <QuickStats records={records} trajectory={trajectory} />
            </div>
          </div>
          <SystemScores scores={healthScore.systems} />
          <div className="mt-4 text-center">
            <span className="tlink text-[13px]">Tap for deep analysis →</span>
          </div>
        </div>

        {/* Critical Metrics */}
        <div className="grid grid-cols-3 gap-2.5">
          {CRITICAL_TESTS.map((test) => (
            <CriticalMetricCard
              key={test.testName}
              testName={test.testName}
              label={test.label}
              current={getValueFromRecord(latestRecord, test.testName)}
              previous={previousRecord ? getValueFromRecord(previousRecord, test.testName) : undefined}
              trendPoints={getTrendPoints(records, test.testName)}
              targetMap={targetMap}
            />
          ))}
        </div>

        {/* Alerts */}
        {alerts.length > 0 && (
          <div className="space-y-2">
            {alerts.map(({ v, range }) => (
              <div
                key={v.testName}
                role="status"
                className="flex gap-3 rounded-card border border-hair-hot bg-terra-pale/70 p-3.5"
              >
                <span className="pulse-dot mt-[7px]" aria-hidden />
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-terra-dk tabular">
                    {v.testName}: {v.value} {v.unit}
                  </div>
                  <div className="mt-0.5 text-[13px] text-ink-2 tabular">
                    {`${range && range.min != null && v.value < range.min ? 'Below' : 'Above'} ${range?.source === 'target' ? 'your target' : 'normal range'} (${range?.min ?? '—'}–${range?.max ?? '—'})`}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Panel Overview */}
        <VitalsQuickEntry />

        <PanelOverview records={records} latestRecord={latestRecord} targetMap={targetMap} />

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
