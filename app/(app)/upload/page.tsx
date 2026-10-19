'use client'

import { useCallback, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useDropzone, type FileRejection } from 'react-dropzone'
import { Upload, Check, AlertCircle, Camera, Minus } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { usePatient, useCanEdit } from '@/components/providers/patient-provider'
import { ViewOnlyNotice } from '@/components/shared/view-only-notice'
import { ExtractReview, type ExtractSource } from '@/components/documents/extract-review'
import { prepareVaultFile } from '@/components/documents/shared'
import { Button } from '@/components/ui/button'
import { uploadDocument } from '@/lib/firebase/storage'
import { logActivity } from '@/lib/firebase/patients'
import { DOCUMENT_MAX_BYTES } from '@/lib/types/care'
import { cn } from '@/lib/utils'

/**
 * Upload lab reports: every file goes into the document vault first
 * (patients/{pid}/documents), then /api/documents/extract reads it and the
 * user reviews the values before saving. If the vault upload fails, a PDF
 * falls back to the legacy /api/pdf/parse route (values only, no stored file).
 *
 * Several files form a queue: all are uploaded up front, then reviewed one at
 * a time (each becomes its own lab record), ending on a summary. A single file
 * keeps the direct flow: review → saved → open the record.
 */

type Step = 'upload' | 'storing' | 'review' | 'done' | 'summary' | 'error'

type ItemStatus = 'pending' | 'ready' | 'saved' | 'skipped' | 'failed'

interface QueueItem {
  name: string
  status: ItemStatus
  source?: ExtractSource
  /** Shown above the review, e.g. the legacy "values only" fallback. */
  notice?: string
  error?: string
  recordId?: string
}

// The fallback posts the whole file through a server function; Netlify caps
// buffered requests at 6 MB (≈ 4.5 MB of binary after base64), and larger
// bodies come back as a gateway 504 instead of a readable error.
const LEGACY_PDF_MAX = 4 * 1024 * 1024
const MAX_FILES = 10

function rejectionReason(r: FileRejection): string {
  return r.errors[0]?.code === 'file-too-large' ? 'over 20 MB' : 'not a PDF or photo'
}

export default function UploadPage() {
  const router = useRouter()
  const { pid } = usePatient()
  const canEdit = useCanEdit()

  const [step, setStep] = useState<Step>('upload')
  const [items, setItems] = useState<QueueItem[]>([])
  const [current, setCurrent] = useState(0)
  const [error, setError] = useState('')
  // Files the dropzone turned away (wrong type, too large, over the cap).
  const [skipped, setSkipped] = useState<string[]>([])

  /** Upload one file to the vault; returns the item's outcome. */
  const store = useCallback(
    async (raw: File, camera: boolean): Promise<Partial<QueueItem>> => {
      if (!pid) return { status: 'failed', error: 'No patient selected.' }
      const prepared = prepareVaultFile(raw)
      if ('error' in prepared) return { status: 'failed', error: prepared.error }
      const file = prepared.file
      try {
        const { docId, storagePath } = await uploadDocument(pid, file, {
          kind: 'lab-report',
          title: file.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 200),
          source: camera ? 'camera' : 'upload',
        })
        logActivity(pid, 'document.uploaded', { targetType: 'document', targetId: docId, summary: 'Uploaded a lab report' })
        return { status: 'ready', source: { kind: 'document', doc: { id: docId, storagePath, fileName: file.name } } }
      } catch (err) {
        console.warn('Vault upload failed:', err)
        if (file.type === 'application/pdf' && file.size <= LEGACY_PDF_MAX) {
          return {
            status: 'ready',
            source: { kind: 'file', file },
            notice: 'The original file could not be stored, so only the values will be saved.',
          }
        }
        return { status: 'failed', error: 'Could not upload the file. Check your connection and try again.' }
      }
    },
    [pid]
  )

  const start = useCallback(
    async (files: File[], camera = false) => {
      if (!pid || files.length === 0) return
      setError('')
      const queue: QueueItem[] = files.map((f) => ({ name: f.name, status: 'pending' }))
      setItems(queue)
      setCurrent(0)
      setStep('storing')
      // Sequential: keeps phone bandwidth on one file and the progress honest.
      for (let i = 0; i < files.length; i++) {
        setCurrent(i)
        const outcome = await store(files[i], camera)
        queue[i] = { ...queue[i], ...outcome }
        setItems((prev) => prev.map((it, j) => (j === i ? { ...it, ...outcome } : it)))
      }
      const first = queue.findIndex((it) => it.status === 'ready')
      if (first >= 0) {
        setCurrent(first)
        setStep('review')
      } else if (queue.length === 1) {
        // A lone file that failed: back to the dropzone with the error.
        setError(queue[0].error || 'Could not upload the file.')
        setStep('error')
      } else {
        setStep('summary')
      }
    },
    [pid, store]
  )

  /** Settle the item under review and move to the next ready one (or finish). */
  const settle = (i: number, patch: Partial<QueueItem>) => {
    const next = items.map((it, j) => (j === i ? { ...it, ...patch } : it))
    setItems(next)
    const j = next.findIndex((it, k) => k > i && it.status === 'ready')
    if (j >= 0) {
      setCurrent(j)
      return
    }
    if (next.length === 1) {
      if (next[0].status === 'saved') {
        setStep('done')
        setTimeout(() => router.push(`/records/${next[0].recordId}`), 1200)
      } else {
        reset()
      }
      return
    }
    setStep('summary')
  }

  const reset = () => {
    setItems([])
    setCurrent(0)
    setError('')
    setSkipped([])
    setStep('upload')
  }

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop: (accepted, rejected) => {
      const notes = rejected.map((r) => `${r.file.name} (${rejectionReason(r)})`)
      const take = accepted.slice(0, MAX_FILES)
      for (const f of accepted.slice(MAX_FILES)) notes.push(`${f.name} (over ${MAX_FILES} files at once)`)
      if (take.length) {
        setSkipped(notes)
        start(take)
      } else if (rejected.length === 1) {
        setSkipped([])
        setError(rejectionReason(rejected[0]) === 'over 20 MB' ? 'Files must be under 20 MB.' : 'Only PDF or photo files can be uploaded.')
        setStep('error')
      } else if (rejected.length > 1) {
        setSkipped(notes)
        setError('None of these files can be uploaded. Use PDFs or photos under 20 MB.')
        setStep('error')
      }
    },
    accept: {
      'application/pdf': ['.pdf'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/webp': ['.webp'],
      'image/heic': ['.heic', '.heif'],
    },
    multiple: true,
    maxSize: DOCUMENT_MAX_BYTES - 1,
    noClick: true,
  })

  if (!canEdit) {
    return (
      <>
        <Header title="Upload Report" emphasis="Report" showBack />
        <main className="px-4 py-5"><ViewOnlyNotice action="upload reports" /></main>
      </>
    )
  }

  const finished = step === 'done' || step === 'summary'
  const stepIndex = step === 'review' ? 1 : finished ? 2 : 0
  const multi = items.length > 1
  const item = items[current]

  return (
    <>
      <Header title="Upload Report" emphasis="Report" showBack />
      <main className="px-4 py-5">
        <ol className="mb-6 flex items-center gap-2">
          {['Upload', 'Review', 'Save'].map((label, i) => {
            const isDone = i < stepIndex || finished
            const isActive = i === stepIndex && !finished
            return (
              <li key={label} className="flex flex-1 items-center gap-2" aria-current={isActive ? 'step' : undefined}>
                <span
                  className={cn(
                    'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold tabular',
                    isDone ? 'bg-sage text-canvas' : isActive ? 'bg-ink text-canvas' : 'bg-recess text-ink-3'
                  )}
                >
                  {isDone ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </span>
                <span className={cn('text-[13px]', isActive || isDone ? 'font-semibold text-ink' : 'text-ink-3')}>{label}</span>
                {i < 2 && <span className="h-px flex-1 bg-hair-2" aria-hidden />}
              </li>
            )
          })}
        </ol>

        {skipped.length > 0 && step !== 'done' && (
          <p className="mb-4 rounded-card border border-l-2 border-hair border-l-terra bg-vellum p-3 text-sm text-ink-2">
            Skipped {skipped.length} file{skipped.length === 1 ? '' : 's'}: {skipped.join(', ')}.
          </p>
        )}

        {(step === 'upload' || step === 'error') && (
          <div>
            <div
              {...getRootProps()}
              onClick={open}
              className={cn(
                'cursor-pointer rounded-card border-[1.5px] border-dashed px-6 py-10 text-center transition-[border-color,background-color,box-shadow] duration-300 ease-editorial',
                isDragActive ? 'border-terra bg-terra-pale shadow-lift' : 'border-hair-2 bg-vellum hover:border-hair-hot hover:shadow-soft'
              )}
            >
              <input {...getInputProps()} />
              <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-recess text-terra-dk">
                <Upload className="h-5 w-5" />
              </span>
              <p className="font-serif text-lg font-medium leading-snug text-ink">
                {isDragActive ? 'Drop the reports here' : 'Tap to select or drag lab reports'}
              </p>
              <p className="mt-1.5 text-xs text-ink-3">
                PDF or photo, any lab (max 20 MB, up to {MAX_FILES} at once). Each file becomes its own record; originals are kept in Documents.
              </p>
            </div>
            <label className="mt-3 flex min-h-[48px] cursor-pointer items-center justify-center gap-2 rounded-btn border-[1.5px] border-ink text-sm font-semibold text-ink transition-colors hover:bg-wash">
              <Camera className="h-4 w-4" aria-hidden /> Take a photo of the report
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  e.target.value = ''
                  if (f) {
                    setSkipped([])
                    start([f], true)
                  }
                }}
              />
            </label>
            {step === 'error' && (
              <div role="alert" className="mt-4 flex items-start gap-2.5 rounded-card border border-l-2 border-hair border-l-critical bg-critical-pale p-3.5">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-critical" />
                <div className="text-sm text-critical">{error}</div>
              </div>
            )}
          </div>
        )}

        {step === 'storing' && item && (
          <div className="py-12 text-center" role="status">
            <div className="mx-auto mb-4 h-7 w-7 animate-spin rounded-full border-2 border-terra border-t-transparent" />
            <p className="text-sm text-ink-2">
              Uploading{multi && <span className="tabular"> {current + 1} of {items.length}</span>}{' '}
              <strong className="font-semibold text-ink">{item.name}</strong>…
            </p>
          </div>
        )}

        {step === 'review' && item?.source && (
          <>
            {multi && <QueueProgress items={items} current={current} />}
            {item.notice && <p className="mb-4 rounded-card border border-l-2 border-hair border-l-terra bg-vellum p-3 text-sm text-ink-2">{item.notice}</p>}
            <ExtractReview
              key={current}
              source={item.source}
              cancelLabel={multi ? 'Skip file' : undefined}
              onCancel={() => settle(current, { status: 'skipped' })}
              onSaved={(recordId) => settle(current, { status: 'saved', recordId })}
            />
          </>
        )}

        {step === 'done' && (
          <div className="animate-fade-up py-12 text-center" role="status">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-sage-pale">
              <Check className="h-6 w-6 text-sage" />
            </div>
            <p className="font-serif text-xl font-medium text-ink">Record saved!</p>
            <p className="mt-1 text-xs text-ink-3">Opening the record…</p>
          </div>
        )}

        {step === 'summary' && <QueueSummary items={items} onReset={reset} onRecords={() => router.push('/records')} />}
      </main>
    </>
  )
}

/** "Report 2 of 4 · name" with one segment per file, coloured by outcome. */
function QueueProgress({ items, current }: { items: QueueItem[]; current: number }) {
  return (
    <div className="mb-5">
      <p className="mb-2 flex min-w-0 items-baseline gap-1.5 text-sm text-ink-2">
        <span className="label flex-shrink-0 text-ink-3 tabular">Report {current + 1} of {items.length}</span>
        <span aria-hidden className="text-ink-3">·</span>
        <span className="truncate font-semibold text-ink">{items[current].name}</span>
      </p>
      <div className="flex gap-1" aria-hidden>
        {items.map((it, i) => (
          <span
            key={i}
            className={cn(
              'h-1 flex-1 rounded-full',
              i === current ? 'bg-ink' : it.status === 'saved' ? 'bg-sage' : it.status === 'failed' ? 'bg-critical' : it.status === 'skipped' ? 'bg-ink-3' : 'bg-recess'
            )}
          />
        ))}
      </div>
    </div>
  )
}

function QueueSummary({ items, onReset, onRecords }: { items: QueueItem[]; onReset: () => void; onRecords: () => void }) {
  const saved = items.filter((it) => it.status === 'saved').length
  return (
    <div className="animate-fade-up">
      <h2 className="font-serif text-xl font-medium tracking-[-.015em] text-ink tabular">
        {saved} of {items.length} report{items.length === 1 ? '' : 's'} saved
      </h2>
      <ul className="mt-4 divide-y divide-hair overflow-hidden rounded-card border border-hair bg-vellum">
        {items.map((it, i) => (
          <li key={i} className="flex items-start gap-3 px-3.5 py-3">
            <span
              className={cn(
                'mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full',
                it.status === 'saved' ? 'bg-sage-pale text-sage' : it.status === 'failed' ? 'bg-critical-pale text-critical' : 'bg-recess text-ink-3'
              )}
            >
              {it.status === 'saved' ? <Check className="h-3 w-3" aria-hidden /> : it.status === 'failed' ? <AlertCircle className="h-3 w-3" aria-hidden /> : <Minus className="h-3 w-3" aria-hidden />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink">{it.name}</p>
              <p className={cn('text-xs', it.status === 'failed' ? 'text-critical' : 'text-ink-3')}>
                {it.status === 'saved' ? 'Saved' : it.status === 'failed' ? it.error || 'Upload failed' : 'Skipped'}
              </p>
            </div>
            {it.status === 'saved' && it.recordId && (
              <Link href={`/records/${it.recordId}`} className="tlink flex-shrink-0 text-sm">Open</Link>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-6 flex gap-3">
        <Button variant="secondary" className="flex-1" onClick={onReset}>Upload more</Button>
        <Button className="flex-1" onClick={onRecords}>View records</Button>
      </div>
    </div>
  )
}
