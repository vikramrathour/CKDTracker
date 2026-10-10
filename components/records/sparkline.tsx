'use client'

import { AreaChart, Area, YAxis } from 'recharts'
import type { TrendPoint } from '@/lib/types/analysis'

interface SparklineProps {
  points: TrendPoint[]
  color?: string
  width?: number
  height?: number
}

export function Sparkline({ points, color = '#6b7280', width = 60, height = 28 }: SparklineProps) {
  if (points.length < 2) return null

  return (
    <AreaChart data={points} width={width} height={height} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
      <defs>
        <linearGradient id={`spark-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.2} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <YAxis domain={['dataMin', 'dataMax']} hide />
      <Area
        type="monotone"
        dataKey="value"
        stroke={color}
        strokeWidth={1.5}
        fill={`url(#spark-${color.replace('#', '')})`}
        dot={false}
        isAnimationActive={false}
      />
    </AreaChart>
  )
}
