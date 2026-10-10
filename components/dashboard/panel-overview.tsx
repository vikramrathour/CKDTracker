'use client'

import { cn, getLabValueStatus, formatValue } from '@/lib/utils'
import { Sparkline } from '@/components/records/sparkline'
import { STATUS_STYLES, statusColor, useThemeColors, type Status, type ThemeColors } from '@/components/ui/status'
import { getTrendPoints } from '@/lib/hooks/use-lab-records'
import { PANELS } from '@/lib/constants/test-panels'
import type { LabRecord, LabValue } from '@/lib/types/lab-record'

function StatusDot({ status }: { status: Status }) {
  return (
    <span
      className={cn('inline-block h-2 w-2 flex-shrink-0 rounded-full', STATUS_STYLES[status].dot)}
      title={STATUS_STYLES[status].label}
    />
  )
}

function LabValueRow({
  val,
  trendPoints,
  colors,
}: {
  val: LabValue
  trendPoints: { date: string; value: number }[]
  colors: ThemeColors
}) {
  const status = getLabValueStatus(val)

  return (
    <div className="flex min-h-[44px] items-center gap-3 border-t border-hair py-2 first:border-t-0">
      <StatusDot status={status} />
      <div className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{val.testName}</div>
      {trendPoints.length >= 2 && (
        <Sparkline points={trendPoints} color={statusColor(status, colors)} />
      )}
      <div
        className={cn(
          'num min-w-[52px] text-right text-[17px] font-medium',
          status === 'good' ? 'text-ink' : STATUS_STYLES[status].text
        )}
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
  const colors = useThemeColors()

  return (
    <div className="space-y-3">
      {PANELS.map((panel) => {
        const panelValues = latestRecord.values.filter((v) => v.panel === panel.id)
        if (panelValues.length === 0) return null

        return (
          <section key={panel.id} className="rounded-card border border-hair bg-vellum px-4 pb-2 pt-4">
            <h3 className="mb-1 font-serif text-lg font-medium leading-snug tracking-[-.015em] text-ink">
              {panel.label}
            </h3>
            {panelValues.map((val) => (
              <LabValueRow
                key={val.testName}
                val={val}
                colors={colors}
                trendPoints={getTrendPoints(records, val.testName)}
              />
            ))}
          </section>
        )
      })}
    </div>
  )
}
