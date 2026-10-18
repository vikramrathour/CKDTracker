'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Pencil } from 'lucide-react'
import { Header, iconButton } from '@/components/layout/header'
import { usePatient, useCanEdit } from '@/components/providers/patient-provider'
import { Button } from '@/components/ui/button'
import { ListSkeleton } from '@/components/ui/skeleton'
import { CompareTable } from '@/components/compare/compare-table'
import { OpenReportButton } from '@/components/records/open-report-button'
import { ValuesEditor } from '@/components/records/values-editor'
import { deleteLabRecord, updateLabRecord } from '@/lib/firebase/firestore'
import { buildComparison } from '@/lib/calculations/compare'
import { formatDate, formatShortDate, cn } from '@/lib/utils'
import { valueStatus } from '@/lib/calculations/targets'
import { useTargets } from '@/lib/hooks/use-targets'
import type { LabValue } from '@/lib/types/lab-record'
import type { LabRecordWithSource } from '@/lib/firebase/documents'

const navButton =
  'flex min-h-[44px] min-w-0 flex-1 items-center gap-1.5 rounded-btn border border-hair px-3 text-[13px] text-ink-2 tabular transition-colors'

type Neighbour = { id: string; recordDate: string } | undefined

/** Older / newer report links; a muted placeholder at either end of the history. */
function ReportNav({ older, newer }: { older: Neighbour; newer: Neighbour }) {
  return (
    <nav aria-label="Other reports" className="mt-3 flex gap-2">
      {older ? (
        <Link href={`/records/${older.id}`} className={cn(navButton, 'hover:border-hair-hot hover:text-ink')}>
          <ChevronLeft className="h-4 w-4 flex-shrink-0" aria-hidden />
          <span className="truncate"><span className="sr-only">Older report, </span>{formatShortDate(older.recordDate)}</span>
        </Link>
      ) : (
        <span aria-disabled="true" className={cn(navButton, 'text-ink-3 opacity-50')}>
          <ChevronLeft className="h-4 w-4 flex-shrink-0" aria-hidden />
          <span className="truncate">Oldest</span>
        </span>
      )}
      {newer ? (
        <Link href={`/records/${newer.id}`} className={cn(navButton, 'justify-end hover:border-hair-hot hover:text-ink')}>
          <span className="truncate"><span className="sr-only">Newer report, </span>{formatShortDate(newer.recordDate)}</span>
          <ChevronRight className="h-4 w-4 flex-shrink-0" aria-hidden />
        </Link>
      ) : (
        <span aria-disabled="true" className={cn(navButton, 'justify-end text-ink-3 opacity-50')}>
          <span className="truncate">Latest</span>
          <ChevronRight className="h-4 w-4 flex-shrink-0" aria-hidden />
        </span>
      )}
    </nav>
  )
}

export default function RecordDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { pid, records, recordsLoading } = usePatient()
  const canEdit = useCanEdit()
  const { targetMap } = useTargets()
  // records are ascending by recordDate, so the neighbours are the older / newer reports.
  const index = records.findIndex((r) => r.id === id)
  const record = (index >= 0 ? records[index] : undefined) as LabRecordWithSource | undefined
  const older = index > 0 ? records[index - 1] : undefined
  const newer = index >= 0 ? records[index + 1] : undefined

  const [editing, setEditing] = useState(false)
  const [date, setDate] = useState('')
  const [lab, setLab] = useState('')
  const [notes, setNotes] = useState('')
  const [values, setValues] = useState<LabValue[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // This report's tests against their earlier readings (later reports are ignored).
  const comparison = useMemo(
    () => (record ? buildComparison(records, { anchorRecordId: record.id, targets: targetMap }) : null),
    [records, record, targetMap]
  )

  if (recordsLoading) {
    return (
      <>
        <Header title="Record" showBack />
        <main className="px-4 py-5"><ListSkeleton rows={6} /></main>
      </>
    )
  }

  if (!record || !pid || !comparison) {
    return (
      <>
        <Header title="Record" showBack />
        <main className="px-4 py-5"><p className="pt-16 text-center text-[15px] text-ink-2">This record no longer exists.</p></main>
      </>
    )
  }

  const startEdit = () => {
    setDate(record.recordDate.slice(0, 10))
    setLab(record.labName || '')
    setNotes(record.notes || '')
    setValues(record.values)
    setError(null)
    setEditing(true)
  }

  const save = async () => {
    if (!date || values.length === 0) {
      setError('A record needs a date and at least one value.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await updateLabRecord(pid, record.id, { recordDate: new Date(date), labName: lab.trim(), notes: notes.trim(), values })
      setEditing(false)
    } catch (err) {
      console.error('Record update failed:', err)
      setError('Could not save the changes. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!confirm('Delete this record? Its source document stays in Documents.')) return
    setBusy(true)
    try {
      await deleteLabRecord(pid, record.id)
      router.replace('/records')
    } catch (err) {
      console.error('Record delete failed:', err)
      setError('Could not delete the record. Please try again.')
      setBusy(false)
    }
  }

  const abnormal = record.values.filter((v) => valueStatus(v.testName, v.value, v, targetMap) !== 'good').length

  return (
    <>
      <Header
        title="Record"
        showBack
        actions={
          canEdit && !editing ? (
            <button type="button" onClick={startEdit} aria-label="Edit record" className={iconButton}>
              <Pencil className="h-5 w-5" />
            </button>
          ) : undefined
        }
      />
      <main className="px-4 py-5">
        {editing ? (
          <div className="space-y-5">
            <div className="flex gap-3">
              <div className="min-w-0 flex-1">
                <label htmlFor="rec-date" className="label mb-1.5 block text-ink-3">Date</label>
                <input id="rec-date" type="date" className="field tabular" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="min-w-0 flex-1">
                <label htmlFor="rec-lab" className="label mb-1.5 block text-ink-3">Lab</label>
                <input id="rec-lab" className="field" value={lab} onChange={(e) => setLab(e.target.value)} />
              </div>
            </div>
            <ValuesEditor values={values} onChange={setValues} />
            <div>
              <label htmlFor="rec-notes" className="label mb-1.5 block text-ink-3">Notes</label>
              <textarea id="rec-notes" rows={3} className="field" value={notes} maxLength={2000} onChange={(e) => setNotes(e.target.value)} />
            </div>
            {error && <p role="alert" className="text-sm text-critical">{error}</p>}
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setEditing(false)}>Cancel</Button>
              <Button className="flex-[2]" loading={busy} onClick={save}>Save changes</Button>
            </div>
          </div>
        ) : (
          <>
            <p className="eyebrow">Lab report</p>
            <h2 className="mt-1 font-serif text-[1.75rem] font-normal leading-tight tracking-[-.02em] text-ink tabular">
              {formatDate(record.recordDate, 'EEE d MMM yyyy')}
            </h2>
            <p className="mt-0.5 text-sm text-ink-2 tabular">
              {record.labName || 'Lab not set'} · {record.values.length} tests
              {abnormal ? <span className="text-terra-dk"> · {abnormal} out of range</span> : null}
            </p>

            {/* Nothing here for hand-entered or migrated records without a file. */}
            <OpenReportButton pdfPath={record.pdfPath} className="mt-4" />
            {record.sourceDocumentId && (
              <Link href={`/documents/${record.sourceDocumentId}`} className="tlink mt-2 inline-block text-[13px]">
                View in Documents
              </Link>
            )}

            <ReportNav older={older} newer={newer} />

            {/* Keyed so the panels' open/closed state resets when moving to another report. */}
            <CompareTable
              key={record.id}
              className="mt-5"
              comparison={comparison}
              columns={3}
              columnLabels={['This report', 'Previous', 'Before']}
            />

            {record.notes && (
              <section className="mt-6">
                <h3 className="label mb-1.5 text-ink-3">Notes</h3>
                <p className="whitespace-pre-wrap text-[15px] text-ink">{record.notes}</p>
              </section>
            )}

            {error && <p role="alert" className="mt-4 text-sm text-critical">{error}</p>}
            {canEdit && (
              <div className="mt-8 border-t border-hair-2 pt-5">
                <Button variant="danger" size="sm" loading={busy} onClick={remove}>Delete record</Button>
              </div>
            )}
          </>
        )}
      </main>
    </>
  )
}
