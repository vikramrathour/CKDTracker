'use client'

import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { format } from 'date-fns'
import { Badge } from '@/components/ui/badge'
import { usePatient } from '@/components/providers/patient-provider'
import { useToast } from '@/components/providers/toast-provider'
import { deleteVital } from '@/lib/firebase/vitals'
import { flagsForVital, groupVitalsByDay, worstLevel } from '@/lib/calculations/vitals'
import type { Vital } from '@/lib/types/care'

/** "128/82 · Pulse 72 · 68.5 kg · 36.8 °C · Glucose 110 · Urine 1800 mL" */
export function summarizeVital(v: Vital): string {
  const parts: string[] = []
  if (v.systolic != null || v.diastolic != null) parts.push(`BP ${v.systolic ?? '–'}/${v.diastolic ?? '–'}`)
  if (v.pulse != null) parts.push(`Pulse ${v.pulse}`)
  if (v.weightKg != null) parts.push(`${v.weightKg} kg`)
  if (v.temperatureC != null) parts.push(`${v.temperatureC} °C`)
  if (v.glucose != null) parts.push(`Glucose ${v.glucose}`)
  if (v.urineOutputMl != null) parts.push(`Urine ${v.urineOutputMl} mL`)
  return parts.join(' · ')
}

function dayHeading(day: string): string {
  const d = new Date(`${day}T12:00:00`)
  const today = new Date()
  const yesterday = new Date(Date.now() - 864e5)
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  if (same(d, today)) return 'Today'
  if (same(d, yesterday)) return 'Yesterday'
  return format(d, 'EEE dd MMM yyyy')
}

/** Readings grouped by day, newest first; flagged readings get a badge. Editors can delete. */
export function VitalsList({ vitals, canEdit }: { vitals: Vital[]; canEdit: boolean }) {
  const { pid } = usePatient()
  const { showToast } = useToast()
  const [deleting, setDeleting] = useState<string | null>(null)
  const groups = groupVitalsByDay(vitals)

  const remove = async (v: Vital) => {
    if (!pid || !window.confirm('Delete this reading?')) return
    setDeleting(v.id)
    try {
      await deleteVital(pid, v.id)
    } catch (err) {
      console.error('Delete vital failed', err)
      showToast('error', 'Could not delete the reading.')
    } finally {
      setDeleting(null)
    }
  }

  if (groups.length === 0) return <p className="py-6 text-center text-sm text-ink-3">No readings yet.</p>

  return (
    <div className="space-y-3.5">
      {groups.map((g) => (
        <section key={g.day} className="rounded-card border border-hair bg-vellum px-4 pb-1 pt-3">
          <h3 className="label mb-1 text-ink-3">{dayHeading(g.day)}</h3>
          <ul>
            {g.items.map((v) => {
              const level = worstLevel(flagsForVital(v, vitals))
              return (
                <li key={v.id} className="flex items-start gap-3 border-t border-hair py-2.5 first:border-t-0">
                  <span className="w-11 flex-shrink-0 pt-0.5 text-[12px] font-semibold text-ink-3 tabular">
                    {format(new Date(v.recordedAt), 'HH:mm')}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] text-ink tabular">{summarizeVital(v)}</div>
                    {v.notes && <div className="text-[12px] text-ink-3">{v.notes}</div>}
                  </div>
                  {level && (
                    <Badge variant={level === 'critical' ? 'danger' : 'warning'} className={level === 'critical' ? 'text-critical' : undefined}>
                      {level === 'critical' ? 'Urgent' : 'Check'}
                    </Badge>
                  )}
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => remove(v)}
                      disabled={deleting === v.id}
                      aria-label="Delete reading"
                      className="-mr-2 -mt-1.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-btn text-ink-3 transition-colors hover:bg-wash hover:text-critical disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
