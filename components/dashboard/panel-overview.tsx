'use client'

import { getLabValueStatus, STATUS_COLORS, formatValue } from '@/lib/utils'
import { Sparkline } from '@/components/records/sparkline'
import { getTrendPoints } from '@/lib/hooks/use-lab-records'
import { PANELS } from '@/lib/constants/test-panels'
import type { LabRecord, LabValue } from '@/lib/types/lab-record'

function StatusDot({ status }: { status: 'good' | 'warning' | 'danger' }) {
  const color = STATUS_COLORS[status]
  return (
    <span
      className="inline-block w-2 h-2 rounded-full flex-shrink-0"
      style={{ backgroundColor: color }}
    />
  )
}

function LabValueRow({
  val,
  trendPoints,
}: {
  val: LabValue
  trendPoints: { date: string; value: number }[]
}) {
  const status = getLabValueStatus(val)
  const color = STATUS_COLORS[status]

  return (
    <div className="flex items-center gap-2.5 py-2 border-t border-gray-50 first:border-t-0">
      <StatusDot status={status} />
      <div className="flex-1 text-sm text-gray-900 font-medium">{val.testName}</div>
      {trendPoints.length >= 2 && (
        <Sparkline points={trendPoints} color={color} />
      )}
      <div
        className="font-mono text-sm font-semibold min-w-[48px] text-right"
        style={{ color }}
      >
        {formatValue(val.value, val.unit)}
      </div>
    </div>
  )
}

interface PanelOverviewProps {
  records: LabRecord[]
  latestRecord: LabRecord
}

export function PanelOverview({ records, latestRecord }: PanelOverviewProps) {
  return (
    <div className="space-y-3">
      {PANELS.map((panel) => {
        const panelValues = latestRecord.values.filter((v) => v.panel === panel.id)
        if (panelValues.length === 0) return null

        return (
          <div
            key={panel.id}
            className="bg-white rounded-xl p-4 border border-gray-100"
          >
            <div className="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wider">
              {panel.label}
            </div>
            {panelValues.map((val) => (
              <LabValueRow
                key={val.testName}
                val={val}
                trendPoints={getTrendPoints(records, val.testName)}
              />
            ))}
          </div>
        )
      })}
    </div>
  )
}
