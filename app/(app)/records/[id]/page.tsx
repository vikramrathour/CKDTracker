'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Pencil } from 'lucide-react'
import { Header, iconButton } from '@/components/layout/header'
import { usePatient, useCanEdit } from '@/components/providers/patient-provider'
import { Button } from '@/components/ui/button'
import { ListSkeleton } from '@/components/ui/skeleton'
import { STATUS_STYLES } from '@/components/ui/status'
import { DocumentPreview } from '@/components/documents/document-preview'
import { ValuesEditor } from '@/components/records/values-editor'
import { deleteLabRecord, updateLabRecord } from '@/lib/firebase/firestore'
import { PANELS } from '@/lib/constants/test-panels'
import { REFERENCE_RANGES } from '@/lib/constants/reference-ranges'
import { formatDate, formatValue, cn } from '@/lib/utils'
import { formatRange, resolveRange, valueStatus, type TargetMap } from '@/lib/calculations/targets'
import { useTargets } from '@/lib/hooks/use-targets'
import type { LabValue } from '@/lib/types/lab-record'
import type { LabRecordWithSource } from '@/lib/firebase/documents'

/** The range printed on the report (falling back to the default range), without targets. */
function labRangeOf(v: LabValue): string {
  const range = resolveRange(v.testName, v)
  return range ? formatRange(range) : '—'
}

/** The range the value is judged against: the patient's target when set, else the lab range. */
function RangeCell({ v, targetMap }: { v: LabValue; targetMap: TargetMap }) {
  const resolved = resolveRange(v.testName, v, targetMap)
  const lab = labRangeOf(v)
  if (!resolved) return <>—</>
  const primary = formatRange(resolved)
  if (resolved.source !== 'target') return <>{primary}</>
  return (
    <>
      <span className="text-ink-2">Your target {primary}</span>
      {lab !== primary && lab !== '—' && <span className="block text-[11px] text-ink-3">Lab range {lab}</span>}
    </>
  )
}

function guessType(path: string): string {
  const ext = path.toLowerCase().split('.').pop()
  if (ext === 'pdf') return 'application/pdf'
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'heic' || ext === 'heif') return 'image/heic'
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  return 'application/octet-stream'
}

export default function RecordDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { pid, records, recordsLoading } = usePatient()
  const canEdit = useCanEdit()
  const { targetMap } = useTargets()
  const record = records.find((r) => r.id === id) as LabRecordWithSource | undefined

  const [editing, setEditing] = useState(false)
  const [date, setDate] = useState('')
  const [lab, setLab] = useState('')
  const [notes, setNotes] = useState('')
  const [values, setValues] = useState<LabValue[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const grouped = useMemo(() => {
    if (!record) return []
    const known = new Set(PANELS.flatMap((p) => p.tests))
    const groups = PANELS.map((p) => ({
      id: p.id as string,
      label: p.label,
      values: p.tests.map((t) => record.values.find((v) => v.testName === t)).filter((v): v is LabValue => !!v),
    }))
    const other = record.values.filter((v) => !known.has(v.testName))
    if (other.length) groups.push({ id: 'other', label: 'Other', values: other })
    return groups.filter((g) => g.values.length)
  }, [record])

  if (recordsLoading) {
    return (
      <>
        <Header title="Record" showBack />
        <main className="px-4 py-5"><ListSkeleton rows={6} /></main>
      </>
    )
  }

  if (!record || !pid) {
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
  const sourcePath = record.pdfPath || null

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

            {grouped.map((g) => (
              <section key={g.id} className="mt-6">
                <h3 className="label mb-1.5 text-ink-3">{g.label}</h3>
                <table className="w-full border-t border-hair-2 text-sm">
                  <thead className="sr-only">
                    <tr><th>Test</th><th>Value</th><th>Range</th></tr>
                  </thead>
                  <tbody>
                    {g.values.map((v) => {
                      const status = valueStatus(v.testName, v.value, v, targetMap)
                      return (
                        <tr key={v.testName} className={cn('border-b border-hair-2', status !== 'good' && 'bg-terra-pale/40')}>
                          <td className="py-2.5 pl-1 pr-2 text-ink">
                            <span className={cn('mr-2 inline-block h-2 w-2 rounded-full align-middle', STATUS_STYLES[status].dot)} aria-hidden />
                            {REFERENCE_RANGES[v.testName]?.label ?? v.testName}
                          </td>
                          <td className={cn('num whitespace-nowrap py-2.5 text-right text-[16px]', status === 'good' ? 'text-ink' : 'text-terra-dk')}>
                            {formatValue(v.value, v.unit)} <span className="font-sans text-[11px] text-ink-3">{v.unit}</span>
                          </td>
                          <td className="whitespace-nowrap py-2.5 pl-3 text-right text-xs text-ink-3 tabular"><RangeCell v={v} targetMap={targetMap} /></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </section>
            ))}

            {record.notes && (
              <section className="mt-6">
                <h3 className="label mb-1.5 text-ink-3">Notes</h3>
                <p className="whitespace-pre-wrap text-[15px] text-ink">{record.notes}</p>
              </section>
            )}

            <section className="mt-6">
              <h3 className="label mb-1.5 text-ink-3">Source document</h3>
              {sourcePath ? (
                <>
                  <DocumentPreview storagePath={sourcePath} contentType={guessType(sourcePath)} title="Source report" />
                  {record.sourceDocumentId && (
                    <Link href={`/documents/${record.sourceDocumentId}`} className="tlink mt-2 text-[13px]">View in Documents</Link>
                  )}
                </>
              ) : (
                <p className="text-sm text-ink-3">Entered by hand; no file attached.</p>
              )}
            </section>

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
