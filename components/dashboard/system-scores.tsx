'use client'

import { HealthScoreRing } from './health-score-ring'
import type { HealthScore } from '@/lib/types/analysis'

const SYSTEM_LABELS: Record<string, string> = {
  kidney: 'Kidney',
  immunosuppression: 'Immuno',
  electrolytes: 'Lytes',
  hemogram: 'Blood',
  lipid: 'Lipid',
}

export function SystemScores({ scores }: { scores: HealthScore['systems'] }) {
  return (
    <div className="mt-5 flex gap-1 border-t border-hair pt-4">
      {Object.entries(scores).map(([key, value]) => (
        <div
          key={key}
          className="flex flex-1 flex-col items-center text-center"
          title={value == null ? 'Not measured in latest report' : undefined}
        >
          <HealthScoreRing score={value} size={46} strokeWidth={3} />
          <div
            className={`mt-1.5 text-[10px] font-bold uppercase tracking-[.08em] ${value == null ? 'text-ink-3/60' : 'text-ink-3'}`}
          >
            {SYSTEM_LABELS[key] || key}
          </div>
        </div>
      ))}
    </div>
  )
}
