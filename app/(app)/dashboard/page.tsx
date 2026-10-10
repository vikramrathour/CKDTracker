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
import { Upload } from 'lucide-react'

const CRITICAL_TESTS = [
  { testName: 'Creatinine', label: 'Creatinine' },
  { testName: 'eGFR', label: 'eGFR' },
  { testName: 'Tacrolimus', label: 'Tac Level' },
]

export default function DashboardPage() {
  const router = useRouter()
  const { records, loading } = useLabRecords()

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
