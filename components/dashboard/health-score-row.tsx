'use client'

import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { HealthScoreRing } from './health-score-ring'
import { interactiveCard } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { HealthScore } from '@/lib/types/analysis'

const SYSTEM_LABELS: Record<keyof HealthScore['systems'], string> = {
  kidney: 'Kidney',
  immunosuppression: 'Immuno',
  electrolytes: 'Lytes',
  hemogram: 'Blood',
  lipid: 'Lipid',
}

/** One-row health score (latest report) linking to the deep analysis page. */
export function HealthScoreRow({ score }: { score: HealthScore }) {
  const systems = (Object.keys(SYSTEM_LABELS) as (keyof HealthScore['systems'])[]).map((key) => ({
    key,
    label: SYSTEM_LABELS[key],
    value: score.systems[key],
  }))

  return (
    <Link
      href="/analysis"
      className={cn('flex items-center gap-3 rounded-card border border-hair bg-vellum px-3 py-2.5', interactiveCard)}
    >
      <HealthScoreRing score={score.overall} size={44} strokeWidth={3} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-ink">Health score</div>
        <div className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-ink-3 tabular">
          {systems.map((s) => (
            <span key={s.key} title={s.value == null ? 'Not measured in latest report' : undefined}>
              {s.label} <span className="text-ink-2">{s.value == null ? '—' : Math.round(s.value)}</span>
            </span>
          ))}
        </div>
      </div>
      <ChevronRight className="h-4 w-4 flex-shrink-0 text-ink-3" aria-hidden />
    </Link>
  )
}
