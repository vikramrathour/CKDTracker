'use client'

import { Printer } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { usePatient } from '@/components/providers/patient-provider'
import { Button } from '@/components/ui/button'
import { ListSkeleton } from '@/components/ui/skeleton'
import { ExportButtons } from '@/components/records/export-buttons'
import { PANELS } from '@/lib/constants/test-panels'
import { REFERENCE_RANGES } from '@/lib/constants/reference-ranges'
import { formatDate, formatValue, cn } from '@/lib/utils'
import { resolveRange, type TargetMap } from '@/lib/calculations/targets'
import { useTargets } from '@/lib/hooks/use-targets'
import type { LabValue } from '@/lib/types/lab-record'

const ORDER = PANELS.flatMap((p) => p.tests)
const orderOf = (t: string) => {
  const i = ORDER.indexOf(t)
  return i === -1 ? ORDER.length : i
}

/** H/L against the patient's target when set, else the printed (or default) range. */
function flag(v: LabValue, targetMap: TargetMap): 'H' | 'L' | '' {
  const range = resolveRange(v.testName, v, targetMap)
  if (range?.max != null && v.value > range.max) return 'H'
  if (range?.min != null && v.value < range.min) return 'L'
  return ''
}

/**
 * Printable full history (window.print) plus CSV/JSON export. Print styles
 * hide the app chrome; each report avoids breaking across pages.
 */
export default function PrintHistoryPage() {
  const { pid, activePatient, records, recordsLoading } = usePatient()
  const { targetMap } = useTargets()
  const newestFirst = [...records].sort((a, b) => b.recordDate.localeCompare(a.recordDate))

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4; margin: 14mm; }
          header, nav, .no-print { display: none !important; }
          body { background: #fff !important; }
          .print-sheet { padding: 0 !important; }
          .print-sheet * { color: #121A24 !important; }
          .print-avoid { break-inside: avoid; }
        }
      `}</style>
      <Header title="Full History" emphasis="History" showBack />
      <main className="print-sheet px-4 py-5">
        <div className="no-print mb-6 space-y-4 rounded-card border border-hair bg-vellum p-4">
          <p className="text-sm text-ink-2">Print this page (or save it as a PDF) for a complete record, or download the data.</p>
          <Button onClick={() => window.print()} disabled={recordsLoading || records.length === 0}>
            <Printer className="h-4 w-4" aria-hidden /> Print
          </Button>
          {pid && <ExportButtons pid={pid} />}
        </div>

        <div className="mb-5 border-b-[1.5px] border-terra pb-3">
          <p className="eyebrow">Lab history</p>
          <h2 className="mt-1 font-serif text-[1.75rem] font-normal leading-tight text-ink">{activePatient?.displayName ?? 'Patient'}</h2>
          <p className="text-xs text-ink-3 tabular">
            {[
              activePatient?.dateOfBirth && `Born ${formatDate(activePatient.dateOfBirth, 'd MMM yyyy')}`,
              activePatient?.transplantDate && `Transplant ${formatDate(activePatient.transplantDate, 'd MMM yyyy')}`,
              activePatient?.doctorName,
              `${records.length} reports`,
              `Printed ${formatDate(new Date().toISOString(), 'd MMM yyyy')}`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>

        {recordsLoading ? (
          <ListSkeleton rows={5} />
        ) : records.length === 0 ? (
          <p className="text-[15px] text-ink-2">No records yet.</p>
        ) : (
          <div className="space-y-5">
            {newestFirst.map((r) => (
              <section key={r.id} className="print-avoid">
                <h3 className="flex items-baseline justify-between gap-3 border-b border-ink pb-1">
                  <span className="font-serif text-lg text-ink tabular">{formatDate(r.recordDate, 'd MMM yyyy')}</span>
                  <span className="text-xs text-ink-3">{r.labName}</span>
                </h3>
                <dl className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
                  {[...r.values].sort((a, b) => orderOf(a.testName) - orderOf(b.testName)).map((v) => {
                    const f = flag(v, targetMap)
                    return (
                      <div key={v.testName} className="flex items-baseline justify-between gap-2 border-b border-hair-2 py-1 text-[13px]">
                        <dt className="truncate text-ink-2">{REFERENCE_RANGES[v.testName]?.label ?? v.testName}</dt>
                        <dd className={cn('whitespace-nowrap tabular', f ? 'font-semibold text-terra-dk' : 'text-ink')}>
                          {formatValue(v.value, v.unit)} <span className="text-[11px] text-ink-3">{v.unit}</span>
                          {f && <span className="ml-1 text-[11px]">{f}</span>}
                        </dd>
                      </div>
                    )
                  })}
                </dl>
                {r.notes && <p className="mt-1 text-xs text-ink-3">{r.notes}</p>}
              </section>
            ))}
          </div>
        )}
      </main>
    </>
  )
}
