'use client'

import { Header } from '@/components/layout/header'
import { TrendChart } from '@/components/trends/trend-chart'
import { useLabRecords, getTrendPoints } from '@/lib/hooks/use-lab-records'
import { ChartSkeleton } from '@/components/ui/skeleton'
import { formatDate } from '@/lib/utils'

const KEY_METRICS = [
  {
    testName: 'Creatinine',
    label: 'Creatinine',
    color: '#ef4444',
    refLow: 0.9,
    refHigh: 1.3,
    insight: 'Kidney filtration marker — lower is better within range',
    higherIsBetter: false,
  },
  {
    testName: 'eGFR',
    label: 'eGFR',
    color: '#2d6a4f',
    refLow: 60,
    refHigh: null,
    insight: 'Kidney function rate — higher is better, age-expected ~99',
    higherIsBetter: true,
  },
  {
    testName: 'Tacrolimus',
    label: 'Tacrolimus',
    color: '#7c3aed',
    refLow: 4,
    refHigh: 10,
    insight: 'Immunosuppressant level — target 4–10 for stable graft',
    higherIsBetter: false,
  },
  {
    testName: 'Potassium',
    label: 'Potassium',
    color: '#e67e22',
    refLow: 3.5,
    refHigh: 5.1,
    insight: 'Electrolyte — elevated by Tacrolimus + Enalapril',
    higherIsBetter: false,
  },
  {
    testName: 'Hemoglobin',
    label: 'Haemoglobin',
    color: '#2563eb',
    refLow: 14,
    refHigh: 18,
    insight: 'Oxygen-carrying capacity — stable is good',
    higherIsBetter: true,
  },
  {
    testName: 'Sodium',
    label: 'Sodium',
    color: '#6b7280',
    refLow: 136,
    refHigh: 145,
    insight: 'Fluid/electrolyte balance indicator',
    higherIsBetter: false,
  },
]

function computeStats(points: { date: string; value: number }[]) {
  if (points.length === 0) return null
  const values = points.map((p) => p.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const avg = values.reduce((s, v) => s + v, 0) / values.length
  const last = values[values.length - 1]
  const prev = values.length > 1 ? values[values.length - 2] : null
  const change = prev != null ? last - prev : null
  const changePct = prev != null && prev !== 0 ? ((change! / prev) * 100) : null

  let slope: number | null = null
  if (values.length >= 3) {
    const n = values.length
    const xs = values.map((_, i) => i)
    const sX = xs.reduce((a, b) => a + b, 0)
    const sY = values.reduce((a, b) => a + b, 0)
    const sXY = xs.reduce((a, x, i) => a + x * values[i], 0)
    const sX2 = xs.reduce((a, x) => a + x * x, 0)
    slope = (n * sXY - sX * sY) / (n * sX2 - sX * sX)
  }

  return { min, max, avg, last, count: values.length, slope, change, changePct }
}

export default function TrendsPage() {
  const { records, loading } = useLabRecords()

  if (loading) {
    return (
      <>
        <Header title="Key Trends" />
        <main className="px-4 py-4 space-y-4">
          {[1, 2, 3].map((i) => <ChartSkeleton key={i} />)}
        </main>
      </>
    )
  }

  const first = records.length > 0 ? records[0] : null
  const last = records.length > 0 ? records[records.length - 1] : null

  return (
    <>
      <Header title="Key Trends" />
      <main className="px-4 py-4">
        <div className="text-xs text-gray-400 mb-4">
          {records.length} readings · {first ? formatDate(first.recordDate, 'MMM yy') : ''} → {last ? formatDate(last.recordDate, 'MMM yy') : ''}
        </div>
        {KEY_METRICS.map((metric) => {
          const points = getTrendPoints(records, metric.testName)
          const stats = computeStats(points)
          return (
            <TrendChart
              key={metric.testName}
              label={metric.label}
              insight={metric.insight}
              color={metric.color}
              points={points}
              refLow={metric.refLow}
              refHigh={metric.refHigh}
              stats={stats}
              higherIsBetter={metric.higherIsBetter}
            />
          )
        })}
      </main>
    </>
  )
}
