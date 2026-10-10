'use client'

import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/utils'
import type { LabRecord } from '@/lib/types/lab-record'

interface QuickStatsProps {
  records: LabRecord[]
  trajectory: string
}

export function QuickStats({ records, trajectory }: QuickStatsProps) {
  if (records.length === 0) return null

  const first = records[0]
  const last = records[records.length - 1]

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[13px] text-ink-3">
      <span className="tabular">{records.length} records</span>
      <span aria-hidden>·</span>
      <span className="tabular">{formatDate(first.recordDate, 'MMM yy')} → {formatDate(last.recordDate, 'MMM yy')}</span>
      <Badge
        variant={
          trajectory === 'improving' ? 'good' :
          trajectory === 'declining' ? 'danger' : 'neutral'
        }
      >
        {trajectory === 'improving' ? '↗ Improving' :
         trajectory === 'declining' ? '↘ Declining' : '→ Stable'}
      </Badge>
    </div>
  )
}
