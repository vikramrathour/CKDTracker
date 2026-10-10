'use client'

import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { format } from 'date-fns'
import { useThemeColors } from '@/components/ui/status'
import {
  buildDoseLevelSeries,
  stepLinePoints,
  type DoseHistoryEntry,
  type MedicationDoc,
} from '@/lib/calculations/medications'
import { formatRange, resolveRange, type TargetMap } from '@/lib/calculations/targets'
import { REFERENCE_RANGES } from '@/lib/constants/reference-ranges'
import type { LabRecord } from '@/lib/types/lab-record'

const fmtDay = (t: number) => format(new Date(t), 'dd MMM yy')

/**
 * Drug level vs dose: two stacked charts on one shared time axis (no dual
 * y-axis). Top: trough levels from lab records with the target band and a
 * dashed marker at every dose change. Bottom: daily dose as a step line.
 */
export function DoseLevelChart({
  medication,
  history,
  records,
  levelTest,
  targets,
}: {
  medication: MedicationDoc
  history: DoseHistoryEntry[]
  records: LabRecord[]
  levelTest: string | null
  targets: TargetMap
}) {
  const c = useThemeColors()
  const series = buildDoseLevelSeries(medication, history, records, levelTest)
  const doses = stepLinePoints(series)
  const hasDoseNumbers = doses.some((d) => d.daily != null)
  const domain: [number, number] = [series.start, Math.max(series.end, series.start + 24 * 3600 * 1000)]

  const range = levelTest ? resolveRange(levelTest, undefined, targets) : null
  const unit = levelTest ? REFERENCE_RANGES[levelTest]?.unit ?? '' : ''
  const doseUnit = /mcg|µg/i.test(medication.dose) ? 'mcg/day' : 'mg/day'

  const tick = { fontSize: 10, fill: c.ink3, fontFamily: 'var(--font-sans)' }
  const tooltipStyle = {
    contentStyle: {
      fontSize: 12,
      fontFamily: 'var(--font-sans)',
      background: c.vellum,
      color: c.ink,
      border: `1px solid ${c.hair2}`,
      borderRadius: 6,
      boxShadow: 'var(--shadow-soft)',
    },
    labelStyle: { color: c.ink3, fontWeight: 600 },
    itemStyle: { color: c.ink },
    labelFormatter: (t: unknown) => (typeof t === 'number' ? fmtDay(t) : String(t)),
  }
  const xAxis = (hide: boolean) => (
    <XAxis
      dataKey="t"
      type="number"
      scale="time"
      domain={domain}
      tick={hide ? false : tick}
      tickFormatter={(t: number) => format(new Date(t), 'MMM yy')}
      axisLine={false}
      tickLine={false}
      height={hide ? 4 : 24}
      allowDuplicatedCategory={false}
    />
  )

  return (
    <section className="rounded-card border border-hair bg-vellum p-4" aria-label={`${levelTest ?? 'Dose'} chart`}>
      {levelTest && (
        <>
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <h2 className="font-serif text-lg font-medium tracking-[-.015em] text-ink">
              {REFERENCE_RANGES[levelTest]?.label ?? levelTest} vs dose
            </h2>
            {range && (
              <span className="text-[11px] font-semibold text-ink-3 tabular">
                {range.source === 'target' ? 'Your target' : 'Reference'} {formatRange(range)} {unit}
              </span>
            )}
          </div>
          {series.levels.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-3">No {levelTest} results in the lab records yet.</p>
          ) : (
            <div className="h-44 w-full">
              <ResponsiveContainer>
                <ComposedChart data={series.levels} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                  {range && (
                    <ReferenceArea
                      y1={range.min ?? undefined}
                      y2={range.max ?? undefined}
                      fill={c.sagePale}
                      fillOpacity={0.7}
                      stroke="none"
                      ifOverflow="hidden"
                    />
                  )}
                  <CartesianGrid stroke={c.hair} vertical={false} />
                  {xAxis(true)}
                  <YAxis tick={tick} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
                  {series.changes.map((ch) => (
                    <ReferenceLine
                      key={ch.t}
                      x={ch.t}
                      stroke={c.terra}
                      strokeOpacity={0.7}
                      strokeDasharray="3 3"
                      ifOverflow="hidden"
                    />
                  ))}
                  <Tooltip
                    {...tooltipStyle}
                    cursor={{ stroke: c.hair2 }}
                    formatter={(v: unknown) => [`${v} ${unit}`, 'Level']}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    name="Level"
                    stroke={c.ink}
                    strokeWidth={2}
                    dot={{ r: 4, fill: c.ink, stroke: c.vellum, strokeWidth: 2 }}
                    activeDot={{ r: 6, stroke: c.vellum, strokeWidth: 2 }}
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}

      <div className="mb-1 mt-3 flex items-baseline justify-between gap-3">
        <h3 className="label text-ink-3">Daily dose</h3>
        <span className="flex items-center gap-1.5 text-[11px] text-ink-3">
          <span aria-hidden className="inline-block h-0 w-4 border-t-2 border-dashed border-terra" />
          dose change
        </span>
      </div>
      {hasDoseNumbers ? (
        <div className="h-28 w-full">
          <ResponsiveContainer>
            <ComposedChart data={doses} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
              <CartesianGrid stroke={c.hair} vertical={false} />
              {xAxis(false)}
              <YAxis tick={tick} axisLine={false} tickLine={false} domain={[0, 'auto']} allowDecimals />
              {series.changes.map((ch) => (
                <ReferenceLine key={ch.t} x={ch.t} stroke={c.terra} strokeOpacity={0.7} strokeDasharray="3 3" ifOverflow="hidden" />
              ))}
              <Tooltip
                {...tooltipStyle}
                cursor={{ stroke: c.hair2 }}
                formatter={(v: unknown, _n: unknown, item: { payload?: { label?: string } }) => [
                  `${v} ${doseUnit}${item?.payload?.label ? ` (${item.payload.label})` : ''}`,
                  'Dose',
                ]}
              />
              <Line
                type="stepAfter"
                dataKey="daily"
                name="Daily dose"
                stroke={c.terraDk}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 5, stroke: c.vellum, strokeWidth: 2 }}
                connectNulls
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="py-3 text-[13px] text-ink-3">Doses like “{medication.dose}” can’t be charted; the history below lists every change.</p>
      )}
    </section>
  )
}
