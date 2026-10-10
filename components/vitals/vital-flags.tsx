'use client'

import { AlertTriangle, Siren } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { VitalFlag } from '@/lib/calculations/vitals'

/** Flag callouts: critical in deep red (sparingly), warnings in terra. Icon + text, never colour alone. */
export function VitalFlags({ flags, className }: { flags: VitalFlag[]; className?: string }) {
  if (flags.length === 0) return null
  return (
    <ul className={cn('space-y-1.5', className)}>
      {flags.map((f) => {
        const critical = f.level === 'critical'
        const Icon = critical ? Siren : AlertTriangle
        return (
          <li
            key={f.kind}
            role={critical ? 'alert' : undefined}
            className={cn(
              'flex items-start gap-2 rounded-btn px-3 py-2 text-[13px] leading-snug',
              critical ? 'bg-critical-pale text-critical' : 'bg-terra-pale text-terra-dk'
            )}
          >
            <Icon aria-hidden className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>
              <span className="font-semibold">{critical ? 'Urgent: ' : 'Check: '}</span>
              {f.message}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
