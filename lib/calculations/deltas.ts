import type { DeltaResult } from '@/lib/types/analysis'
import { isDeltaPositive } from '@/lib/utils'

/**
 * Compute the delta between current and previous values.
 */
export function computeDelta(
  testName: string,
  current: number,
  previous: number
): DeltaResult {
  const absolute = current - previous
  const percentage = previous !== 0 ? (absolute / previous) * 100 : 0
  const direction: 'up' | 'down' | 'stable' =
    Math.abs(percentage) < 1 ? 'stable' : absolute > 0 ? 'up' : 'down'

  return {
    absolute: Math.round(absolute * 100) / 100,
    percentage: Math.round(percentage * 10) / 10,
    direction,
    isGood: direction === 'stable' || isDeltaPositive(testName, direction),
  }
}

/**
 * Format delta for display.
 */
export function formatDelta(delta: DeltaResult): string {
  if (delta.direction === 'stable') return '~0%'
  const sign = delta.direction === 'up' ? '+' : ''
  return `${sign}${delta.percentage}%`
}
