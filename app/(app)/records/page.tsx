'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Header, iconButton, primaryIconButton } from '@/components/layout/header'
import { useLabRecords } from '@/lib/hooks/use-lab-records'
import { usePatient, useCanEdit } from '@/components/providers/patient-provider'
import { deleteLabRecord } from '@/lib/firebase/firestore'
import { Badge } from '@/components/ui/badge'
import { ListSkeleton } from '@/components/ui/skeleton'
import { formatDate } from '@/lib/utils'
import { valueStatus } from '@/lib/calculations/targets'
import { useTargets } from '@/lib/hooks/use-targets'
import { Plus, Printer } from 'lucide-react'
import { useState } from 'react'

export default function RecordsPage() {
  const router = useRouter()
  const { pid } = usePatient()
  const canEdit = useCanEdit()
  const { records, loading, error } = useLabRecords()
  const { targetMap } = useTargets()
  const [deleting, setDeleting] = useState<string | null>(null)

  const handleDelete = async (id: string) => {
    if (!pid || !canEdit || !confirm('Delete this record?')) return
    setDeleting(id)
    try {
      // The realtime subscription drops the row once the delete lands.
      await deleteLabRecord(pid, id)
    } catch (err) {
      console.error('Failed to delete record:', err)
      alert('Could not delete the record. Please try again.')
    } finally {
      setDeleting(null)
    }
  }

  if (loading) {
    return (
      <>
        <Header title="Test History" emphasis="History" />
        <main className="px-4 py-4"><ListSkeleton rows={5} /></main>
      </>
    )
  }

  return (
    <>
      <Header
        title="Test History"
        emphasis="History"
        actions={
          <>
            <button
              type="button"
              onClick={() => router.push('/records/print')}
              aria-label="Print or export history"
              className={iconButton}
            >
              <Printer className="h-5 w-5" />
            </button>
            {canEdit && (
              <button
                type="button"
                onClick={() => router.push('/records/new')}
                aria-label="Add record"
                className={primaryIconButton}
              >
                <Plus className="h-5 w-5" />
              </button>
            )}
          </>
        }
      />
      <main className="px-4 py-4">
        {error ? (
          <p role="alert" className="pt-20 text-center text-[15px] text-critical">{error}</p>
        ) : records.length === 0 ? (
          <div className="pt-20 text-center">
            <p className="text-[15px] text-ink-2">
              {canEdit ? 'No records yet. Add your first lab report.' : 'No records have been added yet.'}
            </p>
          </div>
        ) : (
          <ul className="border-t border-hair-2">
            {[...records].reverse().map((record) => {
              const abnormals = record.values.filter((v) => valueStatus(v.testName, v.value, v, targetMap) !== 'good')
              const cr = record.values.find((v) => v.testName === 'Creatinine')
              const egfr = record.values.find((v) => v.testName === 'eGFR')
              const tac = record.values.find((v) => v.testName === 'Tacrolimus')
              const k = record.values.find((v) => v.testName === 'Potassium')
              const hb = record.values.find((v) => v.testName === 'Hemoglobin')
              const keyValues = [
                cr && { l: 'Cr', v: cr.value },
                egfr && { l: 'eGFR', v: egfr.value },
                tac && { l: 'Tac', v: tac.value },
                k && { l: 'K⁺', v: k.value },
                hb && { l: 'Hb', v: hb.value },
              ].filter(Boolean) as { l: string; v: number }[]

              return (
                <li key={record.id} id={`rec-${record.id}`} className="relative border-b border-hair-2 py-4 transition-colors hover:bg-wash/60">
                  <div className="flex items-center gap-3">
                    <div className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                      <h3 className="font-serif text-[1.375rem] font-normal leading-tight tracking-[-.015em] text-ink tabular">
                        <Link
                          href={`/records/${record.id}`}
                          className="after:absolute after:inset-0 after:content-['']"
                          aria-label={`Open the ${formatDate(record.recordDate, 'd MMM yyyy')} record`}
                        >
                          {formatDate(record.recordDate, 'dd MMM yy')}
                        </Link>
                      </h3>
                      <span className="truncate text-right text-[13px] text-ink-3">
                        {record.labName || '—'} · {record.values.length} tests
                      </span>
                    </div>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => handleDelete(record.id)}
                        disabled={deleting === record.id}
                        aria-label="Delete record"
                        className="relative z-10 -mr-2 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-btn text-lg leading-none text-ink-3 transition-colors hover:bg-critical-pale hover:text-critical disabled:opacity-50"
                      >
                        {deleting === record.id ? '...' : '×'}
                      </button>
                    )}
                  </div>

                  {abnormals.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {abnormals.slice(0, 5).map((v) => (
                        <Badge key={v.testName} variant="danger" uppercase={false}>
                          {v.testName}: {v.value}
                        </Badge>
                      ))}
                    </div>
                  )}

                  {keyValues.length > 0 && (
                    <dl className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
                      {keyValues.map((kv) => (
                        <div key={kv.l} className="flex items-baseline gap-1">
                          <dt className="text-xs text-ink-3">{kv.l}</dt>
                          <dd className="text-[13px] font-semibold text-ink tabular">{kv.v}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </main>
    </>
  )
}
