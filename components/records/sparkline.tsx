'use client'

import { useId } from 'react'
import { AreaChart, Area, YAxis } from 'recharts'
import type { TrendPoint } from '@/lib/types/analysis'

interface SparklineProps {
  points: TrendPoint[]
  /** Literal colour (see useThemeColors); defaults to ink-3 */
  color?: string
  width?: number
  height?: number
}

export function Sparkline({ points, color = '#656D7A', width = 60, height = 28 }: SparklineProps) {
  const gradientId = `spark-${useId().replace(/:/g, '')}`
  if (points.length < 2) return null

  return (
    <AreaChart data={points} width={width} height={height} margin={{ top: 3, right: 3, bottom: 3, left: 3 }}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.16} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <YAxis domain={['dataMin', 'dataMax']} hide />
      <Area
        type="monotone"
        dataKey="value"
        stroke={color}
        strokeWidth={1.5}
        fill={`url(#${gradientId})`}
        dot={false}
        isAnimationActive={false}
      />
    </AreaChart>
  )
}
