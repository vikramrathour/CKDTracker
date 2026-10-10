import type { DeltaResult } from '@/lib/types/analysis'
import { isDeltaPositive } from '@/lib/utils'

// Changes smaller than this (in the test's own unit) count as no change when
// there is no previous value to take a percentage of (previous === 0)
const ABSOLUTE_EPSILON = 1e-9

/**
 * Compute the delta between current and previous values.
 *
 * When previous is 0 a percentage is undefined: `percentage` is reported as 0
 * and direction comes from the absolute change instead (e.g. Urine Protein
 * 0 -> 30 is 'up', not 'stable'). formatDelta then shows the absolute change.
 */
export function computeDelta(
  testName: string,
  current: number,
  previous: number
): DeltaResult {
  const absolute = current - previous
  const hasPercentage = previous !== 0
  const percentage = hasPercentage ? (absolute / Math.abs(previous)) * 100 : 0
  const isStable = hasPercentage ? Math.abs(percentage) < 1 : Math.abs(absolute) < ABSOLUTE_EPSILON
  const direction: 'up' | 'down' | 'stable' = isStable ? 'stable' : absolute > 0 ? 'up' : 'down'

  return {
    absolute: Math.round(absolute * 100) / 100,
    percentage: Math.round(percentage * 10) / 10,
    direction,
    isGood: direction === 'stable' || isDeltaPositive(testName, direction),
  }
}

/**
 * Format delta for display. A non-stable delta with a 0% change came from a
 * previous value of 0 (computeDelta treats |change| < 1% as stable otherwise),
 * so show the signed absolute change instead of a meaningless percentage.
 */
export function formatDelta(delta: DeltaResult): string {
  if (delta.direction === 'stable') return '~0%'
  const sign = delta.direction === 'up' ? '+' : ''
  if (delta.percentage === 0) return `${sign}${delta.absolute}`
  return `${sign}${delta.percentage}%`
}
