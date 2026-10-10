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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "2026-08-12" → "12 Aug 2026" (calendar date, no timezone shift); anything else unchanged. */
export function formatYmd(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd)
  if (!m) return ymd
  const month = MONTHS[Number(m[2]) - 1]
  const day = Number(m[3])
  return month && day >= 1 && day <= 31 ? `${day} ${month} ${m[1]}` : ymd
}

/** Rewrite every YYYY-MM-DD inside free text (e.g. activity summaries) as "12 Aug 2026". */
export function humanizeYmdDates(text: string): string {
  return text.replace(/\b\d{4}-\d{2}-\d{2}\b/g, formatYmd)
}

/** Format a numeric value with appropriate precision */
// Keeps the precision labs report (creatinine 1.15, specific gravity 1.015)
// instead of rounding it away, while trimming float noise and trailing zeros.
// `unit` is kept for call-site compatibility.
export function formatValue(value: number, unit: string): string {
  const abs = Math.abs(value)
  if (abs >= 1000) return Math.round(value).toLocaleString()
  const decimals = abs < 10 ? 3 : abs < 100 ? 2 : 1
  return String(Number(value.toFixed(decimals)))
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
