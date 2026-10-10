'use client'

import { Header } from '@/components/layout/header'
import { TrendChart, type TrendTone } from '@/components/trends/trend-chart'
import { useLabRecords, getTrendPoints } from '@/lib/hooks/use-lab-records'
import { ChartSkeleton } from '@/components/ui/skeleton'
import { formatDate } from '@/lib/utils'
import { linearRegression } from '@/lib/calculations/trends'
import { REFERENCE_RANGES } from '@/lib/constants/reference-ranges'

const range = (testName: string) => REFERENCE_RANGES[testName]

const KEY_METRICS: {
  testName: string
  label: string
  tone: TrendTone
  refLow: number | undefined
  refHigh: number | null
  insight: string
}[] = [
  {
    testName: 'Creatinine',
    label: 'Creatinine',
    tone: 'terra',
    refLow: range('Creatinine')?.min,
    refHigh: range('Creatinine')?.max ?? null,
    insight: 'Kidney filtration marker — lower is better within range',
  },
  {
    testName: 'eGFR',
    label: 'eGFR',
    tone: 'sage',
    refLow: range('eGFR')?.min,
    refHigh: null, // no upper concern for eGFR
    insight: 'Kidney function rate — higher is better',
  },
  {
    testName: 'Tacrolimus',
    label: 'Tacrolimus',
    tone: 'ink',
    refLow: range('Tacrolimus')?.min,
    refHigh: range('Tacrolimus')?.max ?? null,
    insight: `Immunosuppressant level — target ${range('Tacrolimus')?.min}–${range('Tacrolimus')?.max} ng/mL`,
  },
  {
    testName: 'Potassium',
    label: 'Potassium',
    tone: 'terraDk',
    refLow: range('Potassium')?.min,
    refHigh: range('Potassium')?.max ?? null,
    insight: 'Electrolyte — some transplant medications can raise it',
  },
  {
    testName: 'Hemoglobin',
    label: 'Haemoglobin',
    tone: 'sage',
    refLow: range('Hemoglobin')?.min,
    refHigh: range('Hemoglobin')?.max ?? null,
    insight: 'Oxygen-carrying capacity — stable is good',
  },
  {
    testName: 'Sodium',
    label: 'Sodium',
    tone: 'ink2',
    refLow: range('Sodium')?.min,
    refHigh: range('Sodium')?.max ?? null,
    insight: 'Fluid/electrolyte balance indicator',
  },
]

const DAY_MS = 1000 * 60 * 60 * 24

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

  // Date-based regression (x = days since first reading), expressed per 30 days
  let slope: number | null = null
  if (points.length >= 3) {
    const t0 = new Date(points[0].date).getTime()
    const { slope: perDay } = linearRegression(
      points.map((p) => ({ x: (new Date(p.date).getTime() - t0) / DAY_MS, y: p.value }))
    )
    slope = perDay * 30
  }

  return { min, max, avg, last, count: values.length, slope, change, changePct }
}

export default function TrendsPage() {
  const { records, loading } = useLabRecords()

  if (loading) {
    return (
      <>
        <Header title="Key Trends" emphasis="Trends" />
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
      <Header title="Key Trends" emphasis="Trends" />
      <main className="px-4 py-4">
        <p className="mb-4 text-[13px] text-ink-3 tabular">
          {records.length} readings · {first ? formatDate(first.recordDate, 'MMM yy') : ''} → {last ? formatDate(last.recordDate, 'MMM yy') : ''}
        </p>
        {KEY_METRICS.map((metric) => {
          const points = getTrendPoints(records, metric.testName)
          const stats = computeStats(points)
          return (
            <TrendChart
              key={metric.testName}
              label={metric.label}
              insight={metric.insight}
              tone={metric.tone}
              points={points}
              refLow={metric.refLow}
              refHigh={metric.refHigh}
              stats={stats}
              higherIsBetter={!!range(metric.testName)?.higherIsBetter}
            />
          )
        })}
      </main>
    </>
  )
}
