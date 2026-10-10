'use client'

import { cn, getLabValueStatus, STATUS_COLORS } from '@/lib/utils'
import { computeDelta, formatDelta } from '@/lib/calculations/deltas'
import type { LabValue } from '@/lib/types/lab-record'
import { Sparkline } from '@/components/records/sparkline'
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
  if (!current) return null

  const status = getLabValueStatus(current)
  const delta = previous ? computeDelta(testName, current.value, previous.value) : null
  const color = STATUS_COLORS[status]

  return (
    <div
      onClick={onClick}
      className={cn(
        'bg-white rounded-xl p-3 border cursor-pointer transition-shadow hover:shadow-md',
        status !== 'good' ? 'border-red-200' : 'border-gray-100'
      )}
    >
      <div className="text-[10px] text-gray-400 font-medium uppercase tracking-wider mb-1.5">
        {label}
      </div>
      <div
        className="font-mono text-2xl font-bold tracking-tight"
        style={{ color }}
      >
        {current.value}
      </div>
      {delta && (
        <div className="text-[11px] text-gray-500 mt-0.5">
          <span className={delta.isGood ? 'text-emerald-600' : 'text-red-500'}>
            {formatDelta(delta)}
          </span>{' '}
          prev
        </div>
      )}
      {trendPoints.length >= 2 && (
        <div className="mt-1">
          <Sparkline points={trendPoints} color={color} />
        </div>
      )}
    </div>
  )
}
