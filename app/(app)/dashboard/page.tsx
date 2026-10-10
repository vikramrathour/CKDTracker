'use client'

import { Header } from '@/components/layout/header'
import { HealthScoreRing } from '@/components/dashboard/health-score-ring'
import { SystemScores } from '@/components/dashboard/system-scores'
import { CriticalMetricCard } from '@/components/dashboard/critical-metric-card'
import { QuickStats } from '@/components/dashboard/quick-stats'
import { PanelOverview } from '@/components/dashboard/panel-overview'
import { useLabRecords, getTrendPoints, getValueFromRecord } from '@/lib/hooks/use-lab-records'
import { computeHealthScore } from '@/lib/calculations/health-score'
import { CardSkeleton } from '@/components/ui/skeleton'
import { formatDate } from '@/lib/utils'
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
        <Header title="CKD Tracker" />
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
        <Header title="CKD Tracker" />
        <main className="px-4 py-4 text-center pt-20">
          <div className="text-5xl mb-4">🫘</div>
          <div className="text-base font-semibold mb-2">No records yet</div>
          <div className="text-sm text-gray-500">Add your first lab report to see your health dashboard.</div>
          {DEMO_ENABLED && (
            <div className="mt-6">
              <button
                onClick={loadDemoData}
                disabled={demoLoading || !user}
                className="px-4 py-2 rounded-xl bg-emerald-700 text-white text-sm font-semibold shadow-sm disabled:opacity-50"
              >
                {demoLoading ? 'Loading demo data…' : 'Load demo data'}
              </button>
              <div className="text-[11px] text-gray-400 mt-2">Synthetic sample records, not real results.</div>
              {demoError && <div className="text-xs text-red-500 mt-2">{demoError}</div>}
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
        subtitle={`Last: ${formatDate(latestRecord.recordDate, 'dd MMM yy')}`}
        actions={
          <button
            onClick={() => router.push('/upload')}
            className="w-9 h-9 rounded-xl bg-emerald-700 text-white flex items-center justify-center shadow-sm"
          >
            <Upload className="w-4 h-4" />
          </button>
        }
      />
      <main className="px-4 py-4 space-y-4">
        {/* Health Score — tap to view analysis */}
        <div
          onClick={() => router.push('/analysis')}
          className="bg-white rounded-xl p-4 border border-gray-100 cursor-pointer hover:shadow-md transition-shadow"
        >
          <div className="flex items-center gap-4">
            <HealthScoreRing score={healthScore.overall} size={72} label="Overall" />
            <div className="flex-1">
              <div className="text-[15px] font-bold text-gray-900">Health Score</div>
              <QuickStats records={records} trajectory={trajectory} />
            </div>
          </div>
          <SystemScores scores={healthScore.systems} />
          <div className="text-[10px] text-gray-400 text-center mt-3">Tap for deep analysis →</div>
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
                className="bg-red-50 rounded-lg p-3 border-l-[3px] border-red-500"
              >
                <div className="text-sm font-semibold text-red-700">
                  {v.testName}: {v.value} {v.unit}
                </div>
                <div className="text-xs text-gray-600 mt-1">
                  {v.value < (v.referenceMin ?? 0)
                    ? `Below normal range (${v.referenceMin}–${v.referenceMax})`
                    : `Above normal range (${v.referenceMin}–${v.referenceMax})`}
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
