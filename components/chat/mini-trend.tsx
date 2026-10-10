'use client'

import { Sparkline } from '@/components/records/sparkline'
import { useThemeColors } from '@/components/ui/status'
import { formatDate } from '@/lib/utils'
import type { ChartPayload } from '@/lib/server/chat/events'

/** Inline chart shown when the assistant ran compute_trend. */
export function MiniTrend({ chart }: { chart: ChartPayload }) {
  const c = useThemeColors()
  const pts = chart.points
  if (pts.length < 2) return null
  const first = pts[0]
  const last = pts[pts.length - 1]
  const outOfRange =
    (chart.refMin != null && last.value < chart.refMin) || (chart.refMax != null && last.value > chart.refMax)
  const range =
    chart.refMin != null && chart.refMax != null
      ? `${chart.refMin}–${chart.refMax}`
      : chart.refMax != null
        ? `≤ ${chart.refMax}`
        : chart.refMin != null
          ? `≥ ${chart.refMin}`
          : null

  return (
    <figure className="rounded-card border border-hair bg-canvas px-3 py-2.5">
      <figcaption className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] font-bold uppercase tracking-[.08em] text-ink-3">{chart.testName}</span>
        <span className={`num text-lg leading-none ${outOfRange ? 'text-terra-dk' : 'text-ink'}`}>
          {last.value}
          {chart.unit && <span className="ml-1 font-sans text-[11px] text-ink-3">{chart.unit}</span>}
        </span>
      </figcaption>
      <div className="mt-1.5 overflow-hidden" aria-hidden>
        <Sparkline points={pts} color={outOfRange ? c.terra : c.sage} width={240} height={52} />
      </div>
      <p className="mt-1 flex justify-between text-[11px] text-ink-3 tabular">
        <span>
          {formatDate(first.date, 'MMM yy')} → {formatDate(last.date, 'MMM yy')} · {pts.length} readings
        </span>
        {range && <span>Range {range}</span>}
      </p>
    </figure>
  )
}
