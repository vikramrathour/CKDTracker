'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePatient } from '@/components/providers/patient-provider'
import { ValuesEditor } from '@/components/records/values-editor'
import { apiFetch } from '@/lib/api/client'
import { addLabRecord } from '@/lib/firebase/firestore'
import { saveRecordFromDocument } from '@/lib/firebase/documents'
import { notifyRecordAdded } from '@/lib/firebase/messaging'
import type { DocumentMeta } from '@/lib/types/care'
import type { LabValue } from '@/lib/types/lab-record'

/**
 * Extract → review → save, shared by "Upload report" and the document vault.
 *
 *   source 'document': a vault file → POST /api/documents/extract; the saved
 *                      record links back to it (sourceDocumentId/pdfPath).
 *   source 'file':     legacy path when the vault upload failed (e.g. Storage
 *                      rules not deployed) → POST /api/pdf/parse; record only.
 *
 * Values are always shown for review before anything is saved.
 */

export type ExtractSource =
  | { kind: 'document'; doc: Pick<DocumentMeta, 'id' | 'storagePath' | 'fileName'> }
  | { kind: 'file'; file: File }

type Phase = 'extracting' | 'review' | 'saving' | 'done' | 'error'

const STATUS_MESSAGES: Record<number, string> = {
  401: 'Your session has expired. Please sign in again.',
  403: 'Only the owner or an editor can extract values.',
  404: 'The document could not be found.',
  411: 'The upload was incomplete. Please try again.',
  413: 'This file is too large to read.',
  415: 'Only PDF and photo (JPEG, PNG, WebP, HEIC) files can be read.',
  503: 'Reading photos needs AI extraction, which is not set up on this server.',
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

export function ExtractReview({
  source,
  onSaved,
  onCancel,
}: {
  source: ExtractSource
  onSaved: (recordId: string) => void
  onCancel: () => void
}) {
  const { pid, records } = usePatient()
  const [phase, setPhase] = useState<Phase>('extracting')
  const [error, setError] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const [date, setDate] = useState('')
  const [labName, setLabName] = useState('')
  const [values, setValues] = useState<LabValue[]>([])
  const started = useRef(false)

  const extract = useCallback(async () => {
    if (!pid) return
    setPhase('extracting')
    setError('')
    try {
      let res: Response
      if (source.kind === 'document') {
        res = await apiFetch('/api/documents/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pid, documentId: source.doc.id }),
        })
      } else {
        const form = new FormData()
        form.append('pid', pid)
        form.append('file', source.file)
        res = await apiFetch('/api/pdf/parse', { method: 'POST', body: form })
      }
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(STATUS_MESSAGES[res.status] || data.error || 'Could not read this file.')
        setPhase('error')
        return
      }
      setValues(Array.isArray(data.values) ? data.values : [])
      setDate(data.date || today())
      setLabName(data.labName || '')
      setNote(data.values?.length ? null : data.note || 'No lab values were found. You can add them by hand below.')
      setPhase('review')
    } catch (err) {
      setError(err instanceof Error && err.message === 'Not signed in' ? 'You are not signed in. Please sign in again.' : 'Could not reach the server. Try again.')
      setPhase('error')
    }
  }, [pid, source])

  useEffect(() => {
    if (started.current) return
    started.current = true
    extract()
  }, [extract])

  const save = async () => {
    if (!pid || values.length === 0 || !date) return
    const existing = records.find((r) => r.recordDate.startsWith(date))
    if (existing && !confirm(`A record for ${date} already exists with ${existing.values.length} tests. Add another record for this date?`)) return
    setPhase('saving')
    try {
      const lab = labName.trim() || 'Unknown Lab'
      const recordId =
        source.kind === 'document'
          ? await saveRecordFromDocument(pid, source.doc, { recordDate: date, labName: lab, values })
          : await addLabRecord(pid, { recordDate: new Date(date), labName: lab, values })
      setPhase('done')
      notifyRecordAdded(pid, recordId)
      onSaved(recordId)
    } catch (err) {
      console.error('Saving record failed:', err)
      setError('Could not save the record. Check your connection and try again.')
      setPhase('review')
    }
  }

  if (phase === 'extracting') {
    return (
      <div className="py-12 text-center" role="status">
        <div className="mx-auto mb-4 h-7 w-7 animate-spin rounded-full border-2 border-terra border-t-transparent" />
        <p className="text-sm text-ink-2">
          Reading <strong className="font-semibold text-ink">{source.kind === 'document' ? source.doc.fileName : source.file.name}</strong>…
        </p>
        <p className="mt-1 text-xs text-ink-3">Report parser first, AI for other labs and photos</p>
      </div>
    )
  }

  if (phase === 'error') {
    return (
      <div>
        <div role="alert" className="flex items-start gap-2.5 rounded-card border border-l-2 border-hair border-l-critical bg-critical-pale p-3.5">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-critical" aria-hidden />
          <div className="text-sm text-critical">{error}</div>
        </div>
        <div className="mt-5 flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={onCancel}>Back</Button>
          <Button className="flex-1" onClick={extract}>Try again</Button>
        </div>
      </div>
    )
  }

  if (phase === 'done') {
    return (
      <div className="animate-fade-up py-12 text-center" role="status">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-sage-pale">
          <Check className="h-6 w-6 text-sage" aria-hidden />
        </div>
        <p className="font-serif text-xl font-medium text-ink">Record saved</p>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-5 flex gap-3">
        <div className="min-w-0 flex-1">
          <label htmlFor="review-date" className="label mb-1.5 block text-ink-3">Date</label>
          <input id="review-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="field tabular" />
        </div>
        <div className="min-w-0 flex-1">
          <label htmlFor="review-lab" className="label mb-1.5 block text-ink-3">Lab</label>
          <input id="review-lab" value={labName} placeholder="Lab name" onChange={(e) => setLabName(e.target.value)} className="field" />
        </div>
      </div>

      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 className="font-serif text-xl font-medium tracking-[-.015em] text-ink tabular">
          {values.length} value{values.length === 1 ? '' : 's'} to save
        </h2>
        <span className="text-xs text-ink-3">Check each value against the report</span>
      </div>
      {note && <p className="mb-3 text-sm text-ink-2">{note}</p>}

      <ValuesEditor values={values} onChange={setValues} />

      {error && <p role="alert" className="mt-3 text-sm text-critical">{error}</p>}

      <div className="mt-6 flex gap-3">
        <Button variant="secondary" onClick={onCancel} className="flex-1">Cancel</Button>
        <Button onClick={save} loading={phase === 'saving'} disabled={values.length === 0 || !date} className="flex-[2]">
          Save {values.length} value{values.length === 1 ? '' : 's'}
        </Button>
      </div>
    </div>
  )
}
