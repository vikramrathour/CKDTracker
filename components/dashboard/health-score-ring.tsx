'use client'

import { useEffect, useState } from 'react'
import { getScoreColor } from '@/lib/calculations/health-score'

interface HealthScoreRingProps {
  /** null = not measured; renders an empty ring with an em dash */
  score: number | null
  size?: number
  label?: string
  strokeWidth?: number
}

export function HealthScoreRing({ score, size = 72, label, strokeWidth = 4 }: HealthScoreRingProps) {
  const [animatedScore, setAnimatedScore] = useState(0)
  const radius = (size - strokeWidth * 2) / 2
  const circumference = 2 * Math.PI * radius
  const color = score == null ? '#9ca3af' : getScoreColor(score)

  useEffect(() => {
    const timer = setTimeout(() => setAnimatedScore(score ?? 0), 50)
    return () => clearTimeout(timer)
  }, [score])

  const pct = Math.max(0, Math.min(100, animatedScore))
  const offset = circumference - (circumference * pct) / 100

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="font-mono font-bold"
          style={{ fontSize: size > 50 ? 18 : 13, color }}
        >
          {score == null ? '—' : Math.round(pct)}
        </span>
        {label && (
          <span className="text-[7px] text-gray-400 uppercase tracking-wider">
            {label}
          </span>
        )}
      </div>
    </div>
  )
}
