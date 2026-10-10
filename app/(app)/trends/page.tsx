'use client'

import Link from 'next/link'
import { Header } from '@/components/layout/header'
import { TrendChart, type TrendTone } from '@/components/trends/trend-chart'
import { useLabRecords, getTrendPoints } from '@/lib/hooks/use-lab-records'
import { ChartSkeleton } from '@/components/ui/skeleton'
import { formatDate } from '@/lib/utils'
import { linearRegression } from '@/lib/calculations/trends'
import { REFERENCE_RANGES } from '@/lib/constants/reference-ranges'
import { formatRange, resolveRange, type RecordRangeRefs, type TargetMap } from '@/lib/calculations/targets'
import { useTargets } from '@/lib/hooks/use-targets'
import type { LabRecord } from '@/lib/types/lab-record'

const range = (testName: string) => REFERENCE_RANGES[testName]

/**
 * Key metrics. The band each chart shows is resolved per patient with
 * resolveRange(): doctor's target > range printed on the latest report >
 * REFERENCE_RANGES. `openHigh` hides a default/printed upper bound that isn't
 * a clinical concern (eGFR); a target's upper bound is always shown.
 */
const KEY_METRICS: {
  testName: string
  label: string
  tone: TrendTone
  insight: string
  openHigh?: boolean
}[] = [
  { testName: 'Creatinine', label: 'Creatinine', tone: 'terra', insight: 'Kidney filtration marker — lower is better within range' },
  { testName: 'eGFR', label: 'eGFR', tone: 'sage', insight: 'Kidney function rate — higher is better', openHigh: true },
  { testName: 'Tacrolimus', label: 'Tacrolimus', tone: 'ink', insight: 'Immunosuppressant trough level' },
  { testName: 'Potassium', label: 'Potassium', tone: 'terraDk', insight: 'Electrolyte — some transplant medications can raise it' },
  { testName: 'Hemoglobin', label: 'Hemoglobin', tone: 'sage', insight: 'Oxygen-carrying capacity — stable is good' },
  { testName: 'Sodium', label: 'Sodium', tone: 'ink2', insight: 'Fluid/electrolyte balance indicator' },
]

/** Latest printed reference range for a test across records (records are oldest first). */
function latestRefs(records: LabRecord[], testName: string): RecordRangeRefs | undefined {
  for (let i = records.length - 1; i >= 0; i--) {
    const v = records[i].values.find((x) => x.testName === testName)
    if (v && (v.referenceMin != null || v.referenceMax != null)) return v
  }
  return undefined
}

function metricBand(records: LabRecord[], metric: (typeof KEY_METRICS)[number], targets: TargetMap) {
  const resolved = resolveRange(metric.testName, latestRefs(records, metric.testName), targets)
  if (!resolved) return { refLow: undefined, refHigh: null, note: '' }
  const isTarget = resolved.source === 'target'
  const targetMax = isTarget && targets[metric.testName]?.max != null
  const refHigh = metric.openHigh && !targetMax ? null : resolved.max
  const unit = range(metric.testName)?.unit ?? ''
  const shown = { min: resolved.min, max: refHigh }
  const note = isTarget
    ? `Your target ${formatRange(shown)} ${unit}${resolved.target?.setBy ? ` (set by ${resolved.target.setBy})` : ''}`
    : `${resolved.source === 'record' ? 'Lab range' : 'Reference'} ${formatRange(shown)} ${unit}`
  return { refLow: resolved.min ?? undefined, refHigh, note: note.trim() }
}

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
  const { targetMap, loading: targetsLoading } = useTargets()

  if (loading || targetsLoading) {
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
          {' · '}
          <Link href="/targets" className="tlink font-semibold">
            {Object.keys(targetMap).length > 0 ? 'Edit targets' : 'Set targets'}
          </Link>
        </p>
        {KEY_METRICS.map((metric) => {
          const points = getTrendPoints(records, metric.testName)
          const stats = computeStats(points)
          const band = metricBand(records, metric, targetMap)
          return (
            <TrendChart
              key={metric.testName}
              label={metric.label}
              insight={band.note ? `${metric.insight}. ${band.note}` : metric.insight}
              tone={metric.tone}
              points={points}
              refLow={band.refLow}
              refHigh={band.refHigh}
              stats={stats}
              higherIsBetter={!!range(metric.testName)?.higherIsBetter}
            />
          )
        })}
      </main>
    </>
  )
}
