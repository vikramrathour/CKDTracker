import type { TrendData, TrendPoint, RegressionResult } from '@/lib/types/analysis'
import type { LabRecord } from '@/lib/types/lab-record'
import { REFERENCE_RANGES } from '@/lib/constants/reference-ranges'

/**
 * Simple linear regression on (x, y) pairs.
 */
export function linearRegression(points: { x: number; y: number }[]): RegressionResult {
  const n = points.length
  if (n < 2) return { slope: 0, intercept: 0, rSquared: 0 }

  const sumX = points.reduce((s, p) => s + p.x, 0)
  const sumY = points.reduce((s, p) => s + p.y, 0)
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0)
  const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0)
  const sumY2 = points.reduce((s, p) => s + p.y * p.y, 0)

  const denom = n * sumX2 - sumX * sumX
  if (denom === 0) return { slope: 0, intercept: sumY / n, rSquared: 0 }

  const slope = (n * sumXY - sumX * sumY) / denom
  const intercept = (sumY - slope * sumX) / n

  // R-squared
  const meanY = sumY / n
  const ssTot = sumY2 - n * meanY * meanY
  const ssRes = points.reduce((s, p) => {
    const predicted = slope * p.x + intercept
    return s + (p.y - predicted) ** 2
  }, 0)
  const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0

  return { slope, intercept, rSquared: Math.max(0, rSquared) }
}

/**
 * Compute trend data for a specific test across all records.
 */
export function computeTrendData(records: LabRecord[], testName: string): TrendData | null {
  const ref = REFERENCE_RANGES[testName]
  const points: TrendPoint[] = []

  // Sort records chronologically
  const sorted = [...records].sort(
    (a, b) => new Date(a.recordDate).getTime() - new Date(b.recordDate).getTime()
  )

  for (const record of sorted) {
    const val = record.values.find((v) => v.testName === testName)
    if (val) {
      points.push({ date: record.recordDate, value: val.value })
    }
  }

  if (points.length < 2) return null

  const values = points.map((p) => p.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const avg = values.reduce((s, v) => s + v, 0) / values.length

  // Regression using days since first record as x-axis
  const firstDate = new Date(points[0].date).getTime()
  const regressionPoints = points.map((p) => ({
    x: (new Date(p.date).getTime() - firstDate) / (1000 * 60 * 60 * 24), // days
    y: p.value,
  }))
  const { slope, rSquared } = linearRegression(regressionPoints)

  // Determine direction based on slope and whether higher is better
  let direction: TrendData['direction']
  const slopeThreshold = 0.001
  if (Math.abs(slope) < slopeThreshold) {
    direction = 'stable'
  } else if (ref?.higherIsBetter) {
    direction = slope > 0 ? 'improving' : 'worsening'
  } else {
    direction = slope < 0 ? 'improving' : 'worsening'
  }

  return {
    testName,
    unit: ref?.unit || '',
    points,
    min: Math.round(min * 100) / 100,
    max: Math.round(max * 100) / 100,
    avg: Math.round(avg * 100) / 100,
    slope: Math.round(slope * 1000) / 1000,
    rSquared: Math.round(rSquared * 1000) / 1000,
    direction,
  }
}
