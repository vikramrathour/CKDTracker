'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { usePatient } from '@/components/providers/patient-provider'
import { computeAlerts, type Alert } from '@/lib/calculations/alerts'
import { subscribeAlertInputs } from '@/lib/firebase/chat'
import { cn, formatDate } from '@/lib/utils'
import type { AlertRule, Target } from '@/lib/types/care'

const MAX_SHOWN = 3

/** Question prefilled in /chat when the user taps an alert. */
export function alertChatPrompt(a: Alert): string {
  return `The app flagged my ${a.testName} from ${a.date}: ${a.message} What could this mean, and what should I ask my transplant team?`
}

/**
 * Dashboard banner for red flags computed by lib/calculations/alerts.ts from
 * the active patient's records + targets + alert rules. Critical alerts get a
 * pulsing dot and "contact your transplant team today". Tapping an alert opens
 * the chat with a prefilled question (not sent until the user taps send).
 */
export function AlertsBanner({ className }: { className?: string }) {
  const { pid, records } = usePatient()
  const [inputs, setInputs] = useState<{ targets: Target[]; alertRules: AlertRule[] }>({ targets: [], alertRules: [] })

  useEffect(() => {
    setInputs({ targets: [], alertRules: [] })
    if (!pid) return
    try {
      return subscribeAlertInputs(pid, setInputs, () => {
        /* targets/rules unavailable: fall back to built-in rules only */
      })
    } catch {
      return undefined
    }
  }, [pid])

  const alerts = useMemo(
    () => computeAlerts({ records, targets: inputs.targets, alertRules: inputs.alertRules }).filter((a) => a.severity !== 'info'),
    [records, inputs]
  )

  if (alerts.length === 0) return null
  const shown = alerts.slice(0, MAX_SHOWN)
  const hasCritical = alerts.some((a) => a.severity === 'critical')

  return (
    <section aria-label="Alerts" className={cn('space-y-2', className)}>
      {hasCritical && (
        <p className="eyebrow !text-critical">Contact your transplant team today</p>
      )}
      {shown.map((a) => {
        const critical = a.severity === 'critical'
        return (
          <Link
            key={a.id}
            href={`/chat?q=${encodeURIComponent(alertChatPrompt(a))}`}
            className={cn(
              'group flex items-start gap-3 rounded-card border px-3.5 py-3 transition-[border-color,box-shadow] duration-300 ease-editorial hover:shadow-lift',
              critical ? 'border-critical/40 bg-critical-pale' : 'border-hair-hot bg-terra-pale'
            )}
          >
            <span
              className={cn('mt-1.5', critical ? 'pulse-dot bg-critical' : 'inline-block h-[7px] w-[7px] flex-shrink-0 rounded-full ring-[1.5px] ring-inset ring-terra')}
              aria-hidden
            />
            <span className="min-w-0 flex-1">
              <span className={cn('block text-[11px] font-bold uppercase tracking-[.08em]', critical ? 'text-critical' : 'text-terra-dk')}>
                {critical ? 'Urgent' : 'Check'} · {a.testName} · {safeDate(a.date)}
              </span>
              <span className="mt-0.5 block text-[14px] leading-snug text-ink">{a.message}</span>
              <span className="mt-1 inline-flex items-center gap-1 text-[12px] font-semibold text-ink-2 group-hover:text-terra-dk">
                Ask about this <ChevronRight className="h-3.5 w-3.5" aria-hidden />
              </span>
            </span>
          </Link>
        )
      })}
      {alerts.length > MAX_SHOWN && (
        <p className="text-[12px] text-ink-3">
          +{alerts.length - MAX_SHOWN} more {alerts.length - MAX_SHOWN === 1 ? 'alert' : 'alerts'}
        </p>
      )}
    </section>
  )
}

function safeDate(d: string): string {
  try {
    return formatDate(d, 'd MMM yy')
  } catch {
    return d
  }
}
