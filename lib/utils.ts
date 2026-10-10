import { clsx, type ClassValue } from 'clsx'
import { format, parseISO } from 'date-fns'
import type { LabValue } from '@/lib/types/lab-record'
import { REFERENCE_RANGES } from '@/lib/constants/reference-ranges'

/** Tailwind class merger utility */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

/** Format ISO date string for display */
export function formatDate(dateStr: string, fmt: string = 'MMM yyyy'): string {
  return format(parseISO(dateStr), fmt)
}

/** Format a numeric value with appropriate precision */
export function formatValue(value: number, unit: string): string {
  if (unit === '' || unit === '%') return value.toFixed(1)
  if (value >= 1000) return Math.round(value).toLocaleString()
  if (value < 0.1) return value.toFixed(3)
  return value % 1 === 0 ? value.toString() : value.toFixed(1)
}

/** Determine health status color based on value vs reference range */
export function getStatusColor(
  value: number,
  min?: number,
  max?: number
): 'good' | 'warning' | 'danger' {
  if (min === undefined || max === undefined) return 'good'
  if (value >= min && value <= max) return 'good'

  const range = max - min
  const deviation = value < min ? min - value : value - max
  const deviationPercent = range > 0 ? deviation / range : 1

  if (deviationPercent > 0.5) return 'danger'
  return 'warning'
}

/** Get status color for a lab value */
export function getLabValueStatus(val: LabValue): 'good' | 'warning' | 'danger' {
  return getStatusColor(val.value, val.referenceMin, val.referenceMax)
}

/** Color hex values for health statuses */
export const STATUS_COLORS = {
  good: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
  neutral: '#6b7280',
} as const

/** Determine if a delta direction is positive for a specific test */
export function isDeltaPositive(testName: string, direction: 'up' | 'down'): boolean {
  // REFERENCE_RANGES is the single source of truth for direction; unknown
  // tests and most analytes are treated as lower-is-better
  if (REFERENCE_RANGES[testName]?.higherIsBetter) return direction === 'up'
  return direction === 'down'
}
