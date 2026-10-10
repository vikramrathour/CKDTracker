'use client'

import { useId } from 'react'
import {
  ComposedChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceArea,
  ReferenceLine,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts'
import { cn, formatDate } from '@/lib/utils'
import { useThemeColors, type ThemeColors } from '@/components/ui/status'
import type { TrendPoint } from '@/lib/types/analysis'

/** Palette key for the series line (ink / terra / sage family). */
export type TrendTone = 'ink' | 'ink2' | 'terra' | 'terraDk' | 'sage'

interface TrendChartProps {
  label: string
  insight: string
  tone: TrendTone
  points: TrendPoint[]
  refLow?: number
  refHigh?: number | null
  stats: {
    min: number
    max: number
    avg: number
    last: number
    count: number
    slope: number | null
    change: number | null
    changePct: number | null
  } | null
  higherIsBetter?: boolean
}

export function TrendChart({
  label,
  insight,
  tone,
  points,
  refLow,
  refHigh,
  stats,
  higherIsBetter,
}: TrendChartProps) {
  const c: ThemeColors = useThemeColors()
  const gradientId = `tg-${useId().replace(/:/g, '')}`
  if (points.length < 2) return null

  const color = c[tone]
  const data = points.map((p) => ({
    date: formatDate(p.date, 'dd MMM'),
    value: p.value,
  }))

  const trendDir = stats?.slope != null
    ? stats.slope > 0.01 ? '↗' : stats.slope < -0.01 ? '↘' : '→'
    : '→'
  const trendLabel = stats?.slope != null
    ? stats.slope > 0.01 ? 'Rising' : stats.slope < -0.01 ? 'Falling' : 'Stable'
    : 'Stable'

  // Same good/bad rule as before: rising is good only when higher is better.
  const changeIsGood = stats?.changePct != null && stats.changePct > 0 ? !!higherIsBetter : !higherIsBetter

  const hasHigh = refHigh != null && refHigh < 900
  const hasLow = refLow != null && refLow > 0
  const tick = { fontSize: 10, fill: c.ink3, fontFamily: 'var(--font-sans)' }

  return (
    <section className="mb-3.5 rounded-card border border-hair bg-vellum p-4">
      <div className="mb-1 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-serif text-xl font-medium leading-snug tracking-[-.015em] text-ink">{label}</h3>
          <p className="mt-0.5 text-[13px] leading-snug text-ink-3">{insight}</p>
        </div>
        {stats && (
          <div className="flex-shrink-0 text-right">
            <div className="num text-[28px] leading-none text-ink">{stats.last}</div>
            <div className={cn('mt-1 text-[11px] font-semibold tabular', changeIsGood ? 'text-sage' : 'text-terra-dk')}>
              {trendDir} {trendLabel}{' '}
              {stats.changePct != null
                ? `(${stats.changePct > 0 ? '+' : ''}${stats.changePct.toFixed(1)}%)`
                : ''}
            </div>
          </div>
        )}
      </div>

      {/* Stats row */}
      {stats && (
        <dl className="mb-2 mt-3 flex gap-4 border-t border-hair pt-2.5">
          {[
            { l: 'Min', v: stats.min.toFixed(2) },
            { l: 'Avg', v: stats.avg.toFixed(2) },
            { l: 'Max', v: stats.max.toFixed(2) },
            { l: 'n', v: stats.count },
          ].map((s) => (
            <div key={s.l} className="flex items-baseline gap-1.5">
              <dt className="text-[10px] font-bold uppercase tracking-[.08em] text-ink-3">{s.l}</dt>
              <dd className="text-[13px] font-semibold text-ink-2 tabular">{s.v}</dd>
            </div>
          ))}
        </dl>
      )}

      {/* Chart */}
      <div className="h-40 w-full">
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.12} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            {(hasLow || hasHigh) && (
              <ReferenceArea
                y1={hasLow ? refLow : undefined}
                y2={hasHigh ? (refHigh as number) : undefined}
                fill={c.sagePale}
                fillOpacity={0.7}
                stroke="none"
                ifOverflow="hidden"
              />
            )}
            <CartesianGrid stroke={c.hair} vertical={false} />
            <XAxis dataKey="date" tick={tick} axisLine={false} tickLine={false} />
            <YAxis tick={tick} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
            <Tooltip
              cursor={{ stroke: c.hair2 }}
              contentStyle={{
                fontSize: 12,
                fontFamily: 'var(--font-sans)',
                background: c.vellum,
                color: c.ink,
                border: `1px solid ${c.hair2}`,
                borderRadius: 6,
                boxShadow: 'var(--shadow-soft)',
              }}
              labelStyle={{ color: c.ink3, fontWeight: 600 }}
              itemStyle={{ color: c.ink }}
            />
            {hasHigh && (
              <ReferenceLine
                y={refHigh as number}
                stroke={c.sage}
                strokeOpacity={0.5}
                strokeDasharray="4 3"
                strokeWidth={1}
                label={{ value: `High ${refHigh}`, position: 'insideTopRight', fontSize: 9, fill: c.ink3 }}
              />
            )}
            {hasLow && (
              <ReferenceLine
                y={refLow}
                stroke={c.sage}
                strokeOpacity={0.5}
                strokeDasharray="4 3"
                strokeWidth={1}
                label={{ value: `Low ${refLow}`, position: 'insideBottomRight', fontSize: 9, fill: c.ink3 }}
              />
            )}
            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              dot={{ r: 3.5, fill: color, strokeWidth: 0 }}
              activeDot={{ r: 5.5, stroke: c.vellum, strokeWidth: 2 }}
              name={label}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}
