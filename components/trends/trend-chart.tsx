'use client'

import {
  ComposedChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts'
import { formatDate } from '@/lib/utils'
import type { TrendPoint } from '@/lib/types/analysis'

interface TrendChartProps {
  label: string
  insight: string
  color: string
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
  color,
  points,
  refLow,
  refHigh,
  stats,
  higherIsBetter,
}: TrendChartProps) {
  if (points.length < 2) return null

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

  return (
    <div className="bg-white rounded-xl p-4 border border-gray-100 mb-3.5">
      <div className="flex justify-between items-start mb-1">
        <div>
          <div className="text-sm font-semibold text-gray-900">{label}</div>
          <div className="text-[11px] text-gray-400">{insight}</div>
        </div>
        {stats && (
          <div className="text-right flex-shrink-0">
            <div className="font-mono text-xl font-bold tracking-tight" style={{ color }}>
              {stats.last}
            </div>
            <div
              className="text-[11px]"
              style={{
                color: stats.changePct != null && stats.changePct > 0
                  ? (higherIsBetter ? '#10b981' : '#ef4444')
                  : (higherIsBetter ? '#ef4444' : '#10b981'),
              }}
            >
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
        <div className="flex gap-4 mb-2 mt-1">
          {[
            { l: 'Min', v: stats.min.toFixed(2) },
            { l: 'Avg', v: stats.avg.toFixed(2) },
            { l: 'Max', v: stats.max.toFixed(2) },
            { l: 'n', v: stats.count },
          ].map((s) => (
            <div key={s.l} className="text-[10px] text-gray-400">
              <span className="uppercase tracking-wider">{s.l}</span>{' '}
              <span className="font-mono font-semibold text-gray-500">{s.v}</span>
            </div>
          ))}
        </div>
      )}

      {/* Chart */}
      <div className="w-full h-40">
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
            <defs>
              <linearGradient id={`tg-${label.replace(/\s/g, '')}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.12} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: '#9ca3af', fontFamily: 'monospace' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: '#9ca3af', fontFamily: 'monospace' }}
              axisLine={false}
              tickLine={false}
              domain={['auto', 'auto']}
            />
            <Tooltip
              contentStyle={{
                fontSize: 12,
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
              }}
            />
            {refHigh != null && refHigh < 900 && (
              <ReferenceLine
                y={refHigh}
                stroke="#ef4444"
                strokeDasharray="4 3"
                strokeWidth={1}
                label={{ value: `High ${refHigh}`, position: 'insideTopRight', fontSize: 9, fill: '#ef4444' }}
              />
            )}
            {refLow != null && refLow > 0 && (
              <ReferenceLine
                y={refLow}
                stroke="#f59e0b"
                strokeDasharray="4 3"
                strokeWidth={1}
                label={{ value: `Low ${refLow}`, position: 'insideBottomRight', fontSize: 9, fill: '#f59e0b' }}
              />
            )}
            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={2}
              fill={`url(#tg-${label.replace(/\s/g, '')})`}
              dot={{ r: 4, fill: color, strokeWidth: 0 }}
              activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2 }}
              name={label}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
