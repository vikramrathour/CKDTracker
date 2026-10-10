'use client'

import { cn, getLabValueStatus } from '@/lib/utils'
import { computeDelta, formatDelta } from '@/lib/calculations/deltas'
import type { LabValue } from '@/lib/types/lab-record'
import { Sparkline } from '@/components/records/sparkline'
import { interactiveCard } from '@/components/ui/card'
import { STATUS_STYLES, statusColor, useThemeColors } from '@/components/ui/status'
import type { TrendPoint } from '@/lib/types/analysis'

interface CriticalMetricCardProps {
  testName: string
  label: string
  current: LabValue | undefined
  previous: LabValue | undefined
  trendPoints: TrendPoint[]
  onClick?: () => void
}

export function CriticalMetricCard({
  testName,
  label,
  current,
  previous,
  trendPoints,
  onClick,
}: CriticalMetricCardProps) {
  const colors = useThemeColors()
  if (!current) return null

  const status = getLabValueStatus(current)
  const delta = previous ? computeDelta(testName, current.value, previous.value) : null
  const styles = STATUS_STYLES[status]

  return (
    <div
      onClick={onClick}
      className={cn(
        'min-w-0 rounded-card border bg-vellum p-3',
        status === 'good' ? 'border-hair' : 'border-hair-hot',
        onClick && interactiveCard
      )}
    >
      <div className="mb-1.5 flex items-center gap-1.5">
        {status !== 'good' && <span className="pulse-dot" aria-label={styles.label} />}
        <span className="truncate text-[10px] font-bold uppercase tracking-[.08em] text-ink-3">{label}</span>
      </div>
      <div className={cn('num text-[28px] leading-none', status === 'good' ? 'text-ink' : styles.text)}>
        {current.value}
      </div>
      {delta && (
        <div className="mt-1.5 text-[11px] text-ink-3 tabular">
          <span className={cn('font-semibold', delta.isGood ? 'text-sage' : 'text-terra-dk')}>
            {formatDelta(delta)}
          </span>{' '}
          prev
        </div>
      )}
      {trendPoints.length >= 2 && (
        <div className="mt-1.5">
          <Sparkline points={trendPoints} color={statusColor(status, colors)} />
        </div>
      )}
    </div>
  )
}
