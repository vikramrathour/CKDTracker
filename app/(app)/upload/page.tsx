'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useDropzone } from 'react-dropzone'
import { Upload, Check, AlertCircle, Camera } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { usePatient, useCanEdit } from '@/components/providers/patient-provider'
import { ViewOnlyNotice } from '@/components/shared/view-only-notice'
import { ExtractReview, type ExtractSource } from '@/components/documents/extract-review'
import { prepareVaultFile } from '@/components/documents/shared'
import { uploadDocument } from '@/lib/firebase/storage'
import { logActivity } from '@/lib/firebase/patients'
import { DOCUMENT_MAX_BYTES } from '@/lib/types/care'
import { cn } from '@/lib/utils'

/**
 * Upload a lab report: the file goes into the document vault first
 * (patients/{pid}/documents), then /api/documents/extract reads it and the
 * user reviews the values before saving. If the vault upload fails, a PDF
 * falls back to the legacy /api/pdf/parse route (values only, no stored file).
 */

type Step = 'upload' | 'storing' | 'review' | 'done' | 'error'

const LEGACY_PDF_MAX = 10 * 1024 * 1024

export default function UploadPage() {
  const router = useRouter()
  const { pid } = usePatient()
  const canEdit = useCanEdit()

  const [step, setStep] = useState<Step>('upload')
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [source, setSource] = useState<ExtractSource | null>(null)

  const start = useCallback(
    async (raw: File, camera = false) => {
      if (!pid) return
      setError('')
      setNotice('')
      const prepared = prepareVaultFile(raw)
      if ('error' in prepared) {
        setError(prepared.error)
        setStep('error')
        return
      }
      const file = prepared.file
      setFileName(file.name)
      setStep('storing')
      try {
        const { docId, storagePath } = await uploadDocument(pid, file, {
          kind: 'lab-report',
          title: file.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 200),
          source: camera ? 'camera' : 'upload',
        })
        logActivity(pid, 'document.uploaded', { targetType: 'document', targetId: docId, summary: 'Uploaded a lab report' })
        setSource({ kind: 'document', doc: { id: docId, storagePath, fileName: file.name } })
        setStep('review')
      } catch (err) {
        console.warn('Vault upload failed:', err)
        if (file.type === 'application/pdf' && file.size <= LEGACY_PDF_MAX) {
          setNotice('The original file could not be stored, so only the values will be saved.')
          setSource({ kind: 'file', file })
          setStep('review')
        } else {
          setError('Could not upload the file. Check your connection and try again.')
          setStep('error')
        }
      }
    },
    [pid]
  )

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop: (accepted, rejected) => {
      if (accepted[0]) start(accepted[0])
      else if (rejected[0]) {
        setError(rejected[0].errors[0]?.code === 'file-too-large' ? 'Files must be under 20 MB.' : 'Only PDF or photo files can be uploaded.')
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
    maxFiles: 1,
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

  const stepIndex = step === 'review' ? 1 : step === 'done' ? 2 : 0

  return (
    <>
      <Header title="Upload Report" emphasis="Report" showBack />
      <main className="px-4 py-5">
        <ol className="mb-6 flex items-center gap-2">
          {['Upload', 'Review', 'Save'].map((label, i) => {
            const isDone = i < stepIndex || step === 'done'
            const isActive = i === stepIndex && step !== 'done'
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
                {isDragActive ? 'Drop the report here' : 'Tap to select or drag a lab report'}
              </p>
              <p className="mt-1.5 text-xs text-ink-3">PDF or photo, any lab (max 20 MB). The original is kept in Documents.</p>
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
                  if (f) start(f, true)
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

        {step === 'storing' && (
          <div className="py-12 text-center" role="status">
            <div className="mx-auto mb-4 h-7 w-7 animate-spin rounded-full border-2 border-terra border-t-transparent" />
            <p className="text-sm text-ink-2">Uploading <strong className="font-semibold text-ink">{fileName}</strong>…</p>
          </div>
        )}

        {step === 'review' && source && (
          <>
            {notice && <p className="mb-4 rounded-card border border-l-2 border-hair border-l-terra bg-vellum p-3 text-sm text-ink-2">{notice}</p>}
            <ExtractReview
              source={source}
              onCancel={() => {
                setSource(null)
                setStep('upload')
              }}
              onSaved={(recordId) => {
                setStep('done')
                setTimeout(() => router.push(`/records/${recordId}`), 1200)
              }}
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
      </main>
    </>
  )
}
