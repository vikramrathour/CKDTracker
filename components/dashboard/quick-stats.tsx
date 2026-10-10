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
    <div className="flex items-center gap-2 text-xs text-gray-500">
      <span>{records.length} records</span>
      <span>·</span>
      <span>{formatDate(first.recordDate, 'MMM yy')} → {formatDate(last.recordDate, 'MMM yy')}</span>
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
