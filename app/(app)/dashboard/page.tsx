'use client'

import { Header, primaryIconButton } from '@/components/layout/header'
import { HealthScoreRing } from '@/components/dashboard/health-score-ring'
import { SystemScores } from '@/components/dashboard/system-scores'
import { CriticalMetricCard } from '@/components/dashboard/critical-metric-card'
import { QuickStats } from '@/components/dashboard/quick-stats'
import { PanelOverview } from '@/components/dashboard/panel-overview'
import { useLabRecords, getTrendPoints, getValueFromRecord } from '@/lib/hooks/use-lab-records'
import { computeHealthScore } from '@/lib/calculations/health-score'
import { CardSkeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { interactiveCard } from '@/components/ui/card'
import { cn, formatDate } from '@/lib/utils'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import { useAuth } from '@/components/providers/auth-provider'
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
  const { user } = useAuth()
  const { records, loading, refetch } = useLabRecords()
  const [demoLoading, setDemoLoading] = useState(false)
  const [demoError, setDemoError] = useState<string | null>(null)
  const demoInFlight = useRef(false)

  async function loadDemoData() {
    if (!user || demoInFlight.current) return
    demoInFlight.current = true
    setDemoLoading(true)
    setDemoError(null)
    try {
      for (const record of SEED_RECORDS) {
        await addLabRecord(user.uid, {
          recordDate: new Date(record.recordDate),
          labName: record.labName,
          values: record.values,
        })
      }
      await refetch()
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
          <p className="mx-auto mt-3 max-w-[34ch] text-[15px] text-ink-2">Add your first lab report to see your health dashboard.</p>
          {DEMO_ENABLED && (
            <div className="mt-8">
              <Button
                onClick={loadDemoData}
                disabled={!user}
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
  const healthScore = computeHealthScore(latestRecord.values)

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
  const alerts = latestRecord.values.filter((v) => {
    if (v.referenceMin === undefined || v.referenceMax === undefined) return false
    return v.value < v.referenceMin || v.value > v.referenceMax
  })

  return (
    <>
      <Header
        title="CKD Tracker"
        emphasis="Tracker"
        subtitle={`Last: ${formatDate(latestRecord.recordDate, 'dd MMM yy')}`}
        actions={
          <button
            type="button"
            onClick={() => router.push('/upload')}
            aria-label="Upload report"
            className={primaryIconButton}
          >
            <Upload className="h-[18px] w-[18px]" />
          </button>
        }
      />
      <main className="space-y-4 px-4 py-4">
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
            />
          ))}
        </div>

        {/* Alerts */}
        {alerts.length > 0 && (
          <div className="space-y-2">
            {alerts.map((v) => (
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
                    {v.value < (v.referenceMin ?? 0)
                      ? `Below normal range (${v.referenceMin}–${v.referenceMax})`
                      : `Above normal range (${v.referenceMin}–${v.referenceMax})`}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Panel Overview */}
        <PanelOverview records={records} latestRecord={latestRecord} />
      </main>
    </>
  )
}
