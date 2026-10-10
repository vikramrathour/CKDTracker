import type { LabValue, Panel } from '@/lib/types/lab-record'
import type { HealthScore } from '@/lib/types/analysis'
import { REFERENCE_RANGES } from '@/lib/constants/reference-ranges'

/**
 * Compute health score for a single lab value (0-100).
 * 100 = perfectly in range, decreasing as value deviates.
 */
function scoreValue(val: LabValue): number {
  const ref = REFERENCE_RANGES[val.testName]
  if (!ref) return 50 // unknown test, neutral score

  const min = val.referenceMin ?? ref.min
  const max = val.referenceMax ?? ref.max
  const range = max - min

  if (val.value >= min && val.value <= max) return 100

  const deviation = val.value < min ? min - val.value : val.value - max
  const deviationPercent = range > 0 ? deviation / range : 1

  // Score decays quadratically from 100 to 0
  return Math.max(0, Math.round(100 * (1 - Math.min(deviationPercent, 1) ** 0.8)))
}

/**
 * Compute the weighted average health score for a set of lab values.
 * Returns null when there are no values (system not measured).
 */
function weightedScore(values: LabValue[]): number | null {
  if (values.length === 0) return null

  let totalWeight = 0
  let totalScore = 0

  for (const val of values) {
    const ref = REFERENCE_RANGES[val.testName]
    const weight = ref?.weight ?? 3
    totalWeight += weight
    totalScore += scoreValue(val) * weight
  }

  return totalWeight > 0 ? Math.round(totalScore / totalWeight) : null
}

/**
 * Compute overall and per-system health scores from a set of lab values.
 * This is the core algorithm powering the dashboard rings.
 */
export function computeHealthScore(values: LabValue[]): HealthScore {
  const byPanel: Record<string, LabValue[]> = {}
  for (const val of values) {
    if (!byPanel[val.panel]) byPanel[val.panel] = []
    byPanel[val.panel].push(val)
  }

  const systems: HealthScore['systems'] = {
    kidney: weightedScore(byPanel['kidney'] || []),
    immunosuppression: weightedScore(byPanel['tacrolimus'] || []),
    electrolytes: weightedScore(byPanel['electrolytes'] || []),
    hemogram: weightedScore(byPanel['hemogram'] || []),
    lipid: weightedScore(byPanel['lipid'] || []),
  }

  // Overall score is the weighted average of the systems that were measured
  // (weights renormalized over present systems). Kidney and immunosuppression weigh more.
  const systemWeights = { kidney: 3, immunosuppression: 3, electrolytes: 2, hemogram: 2, lipid: 1 }
  let totalWeight = 0
  let totalScore = 0
  for (const [sys, score] of Object.entries(systems)) {
    if (score == null) continue
    const w = systemWeights[sys as keyof typeof systemWeights] || 1
    totalWeight += w
    totalScore += score * w
  }

  return {
    overall: totalWeight > 0 ? Math.round(totalScore / totalWeight) : null,
    systems,
  }
}

/**
 * Get the color for a score value.
 */
export function getScoreColor(score: number): string {
  if (score >= 80) return '#10b981' // good - green
  if (score >= 60) return '#f59e0b' // warning - amber
  return '#ef4444' // danger - red
}

/**
 * Get the label for a score value.
 */
export function getScoreLabel(score: number): string {
  if (score >= 80) return 'Good'
  if (score >= 60) return 'Fair'
  if (score >= 40) return 'Concerning'
  return 'Critical'
}
