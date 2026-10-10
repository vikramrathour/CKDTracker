'use client'

import { useState } from 'react'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { useCanEdit } from '@/components/providers/patient-provider'
import { useVitals } from '@/lib/hooks/use-vitals'
import { flagsForVital, type VitalFlag } from '@/lib/calculations/vitals'
import { VitalForm } from './vital-form'
import { VitalFlags } from './vital-flags'
import { summarizeVital } from './vitals-list'

/**
 * Compact dashboard card: last reading (with flags) and, for editors, a
 * quick BP / pulse / weight / temperature form. Self-contained (own
 * subscription); mount as <VitalsQuickEntry /> anywhere under AppShell.
 */
export function VitalsQuickEntry({ className }: { className?: string }) {
  const canEdit = useCanEdit()
  const { vitals, loading } = useVitals()
  const [open, setOpen] = useState(false)
  const [justFlagged, setJustFlagged] = useState<VitalFlag[]>([])
  const latest = vitals[0]
  const latestFlags = latest ? flagsForVital(latest, vitals) : []

  return (
    <section className={`rounded-card border border-hair bg-vellum p-4 ${className ?? ''}`} aria-label="Vitals">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 className="label text-ink-3">Vitals</h2>
        <Link href="/vitals" className="tlink text-[12px] font-semibold">
          All readings
        </Link>
      </div>

      {loading ? (
        <p className="text-sm text-ink-3">Loading…</p>
      ) : latest ? (
        <div className="mb-3">
          <div className="text-[15px] text-ink tabular">{summarizeVital(latest)}</div>
          <div className="text-[12px] text-ink-3">{formatDistanceToNow(new Date(latest.recordedAt), { addSuffix: true })}</div>
          <VitalFlags flags={justFlagged.length > 0 ? justFlagged : latestFlags} className="mt-2" />
        </div>
      ) : (
        <p className="mb-3 text-sm text-ink-3">No readings yet.</p>
      )}

      {canEdit &&
        (open ? (
          <VitalForm
            variant="quick"
            history={vitals}
            onSaved={(flags) => {
              setJustFlagged(flags)
              setOpen(false)
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setJustFlagged([])
              setOpen(true)
            }}
            className="w-full rounded-btn border-[1.5px] border-ink px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-wash"
          >
            Log BP, weight, temperature
          </button>
        ))}
    </section>
  )
}
