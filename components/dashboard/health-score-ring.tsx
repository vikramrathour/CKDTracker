'use client'

import { useEffect, useState } from 'react'
import { scoreStatus } from '@/components/ui/status'

interface HealthScoreRingProps {
  /** null = not measured; renders an empty ring with an em dash */
  score: number | null
  size?: number
  label?: string
  strokeWidth?: number
}

// Arc colour by score band: sage (good) → terra (watch) → terra-dk (low).
const ARC = {
  good: 'rgb(var(--sage))',
  warning: 'rgb(var(--terra))',
  danger: 'rgb(var(--terra-dk))',
} as const

export function HealthScoreRing({ score, size = 72, label, strokeWidth = 4 }: HealthScoreRingProps) {
  const [animatedScore, setAnimatedScore] = useState(0)
  const radius = (size - strokeWidth * 2) / 2
  const circumference = 2 * Math.PI * radius
  const arc = score == null ? 'transparent' : ARC[scoreStatus(score)]

  useEffect(() => {
    const timer = setTimeout(() => setAnimatedScore(score ?? 0), 50)
    return () => clearTimeout(timer)
  }, [score])

  const pct = Math.max(0, Math.min(100, animatedScore))
  const offset = circumference - (circumference * pct) / 100
  const large = size > 50

  return (
    <div
      className="relative flex-shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={score == null ? 'Not measured' : `Score ${Math.round(score)} of 100`}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          style={{ stroke: 'rgb(var(--recess))' }}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{
            stroke: arc,
            transition: 'stroke-dashoffset 1.2s cubic-bezier(.16,1,.3,1)',
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className={`num leading-none ${score == null ? 'text-ink-3' : 'text-ink'}`}
          style={{ fontSize: large ? 26 : 15, fontWeight: large ? 400 : 500 }}
        >
          {score == null ? '—' : Math.round(pct)}
        </span>
        {label && (
          <span className="mt-1 text-[9px] font-bold uppercase leading-none tracking-[.08em] text-ink-3">
            {label}
          </span>
        )}
      </div>
    </div>
  )
}
