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
    <div className="flex gap-2 mt-4">
      {Object.entries(scores).map(([key, value]) => (
        <div key={key} className="flex-1 text-center">
          <HealthScoreRing score={value} size={44} />
          <div className="text-[8px] text-gray-400 mt-1 uppercase tracking-wider">
            {SYSTEM_LABELS[key] || key}
          </div>
        </div>
      ))}
    </div>
  )
}
