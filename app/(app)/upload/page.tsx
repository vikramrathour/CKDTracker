'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useDropzone } from 'react-dropzone'
import { Header } from '@/components/layout/header'
import { useAuth } from '@/components/providers/auth-provider'
import { useLabRecords } from '@/lib/hooks/use-lab-records'
import { addLabRecord } from '@/lib/firebase/firestore'
import { apiFetch } from '@/lib/api/client'
import { REFERENCE_RANGES } from '@/lib/constants/reference-ranges'
import { Upload, Check, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { LabValue } from '@/lib/types/lab-record'

type Step = 'upload' | 'parsing' | 'review' | 'saving' | 'done' | 'error'

export default function UploadPage() {
  const router = useRouter()
  const { user } = useAuth()
  const { records } = useLabRecords()

  const [step, setStep] = useState<Step>('upload')
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')
  const [date, setDate] = useState('')
  const [labName, setLabName] = useState('')
  const [values, setValues] = useState<LabValue[]>([])
  const [editingIdx, setEditingIdx] = useState<number | null>(null)

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0]
    if (!file) return

    setFileName(file.name)
    setStep('parsing')
    setError('')

    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await apiFetch('/api/pdf/parse', { method: 'POST', body: formData })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        const messages: Record<number, string> = {
          401: 'Your session has expired. Please sign in again.',
          413: 'This file is too large. The maximum size is 10 MB.',
          415: 'Only PDF files are supported.',
        }
        setError(messages[res.status] || data.error || 'Failed to parse PDF')
        setStep('error')
        return
      }

      if (data.values.length === 0) {
        setError('No lab values could be extracted from this PDF. Try a different file.')
        setStep('error')
        return
      }

      setValues(data.values)
      setDate(data.date || new Date().toISOString().split('T')[0])
      setLabName(data.labName || 'Unknown Lab')
      setStep('review')
    } catch (err) {
      setError(err instanceof Error && err.message === 'Not signed in'
        ? 'You are not signed in. Please sign in again.'
        : 'Failed to upload file. Please try again.')
      setStep('error')
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024, // 10MB
  })

  const updateValue = (idx: number, newVal: number) => {
    setValues((prev) => {
      const updated = [...prev]
      const ref = REFERENCE_RANGES[updated[idx].testName]
      updated[idx] = {
        ...updated[idx],
        value: newVal,
        isAbnormal: ref ? (newVal < ref.min || newVal > ref.max) : false,
      }
      return updated
    })
    setEditingIdx(null)
  }

  const removeValue = (idx: number) => {
    setValues((prev) => prev.filter((_, i) => i !== idx))
  }

  const handleSave = async () => {
    if (!user || values.length === 0) return

    // Check for duplicate date
    const existing = records.find((r) => r.recordDate.startsWith(date))
    if (existing) {
      const confirmed = confirm(
        `A record for ${date} already exists with ${existing.values.length} tests. Do you want to add another record for this date?`
      )
      if (!confirmed) return
    }

    setStep('saving')
    try {
      await addLabRecord(user.uid, {
        recordDate: new Date(date),
        labName,
        values,
      })
      setStep('done')
      setTimeout(() => router.push('/dashboard'), 1500)
    } catch (err) {
      setError('Failed to save record.')
      setStep('error')
    }
  }

  return (
    <>
      <Header title="Upload Report" emphasis="Report" showBack />
      <main className="px-4 py-5">
        {/* Step indicator */}
        <ol className="mb-6 flex items-center gap-2">
          {['Upload', 'Review', 'Save'].map((label, i) => {
            const isActive = (step === 'upload' || step === 'parsing') && i === 0
              || (step === 'review') && i === 1
              || (step === 'saving' || step === 'done') && i === 2
            const isDone = (i === 0 && step !== 'upload' && step !== 'parsing' && step !== 'error')
              || (i === 1 && (step === 'saving' || step === 'done'))
              || (i === 2 && step === 'done')
            return (
              <li key={label} className="flex flex-1 items-center gap-2" aria-current={isActive ? 'step' : undefined}>
                <span className={cn(
                  'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold tabular',
                  isDone ? 'bg-sage text-canvas' :
                  isActive ? 'bg-ink text-canvas' :
                  'bg-recess text-ink-3'
                )}>
                  {isDone ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </span>
                <span className={cn('text-[13px]', isActive || isDone ? 'font-semibold text-ink' : 'text-ink-3')}>
                  {label}
                </span>
                {i < 2 && <span className="h-px flex-1 bg-hair-2" aria-hidden />}
              </li>
            )
          })}
        </ol>

        {/* Upload step */}
        {(step === 'upload' || step === 'error') && (
          <div>
            <div
              {...getRootProps()}
              className={cn(
                'cursor-pointer rounded-card border-[1.5px] border-dashed px-6 py-10 text-center transition-[border-color,background-color,box-shadow] duration-300 ease-editorial',
                isDragActive
                  ? 'border-terra bg-terra-pale shadow-lift'
                  : 'border-hair-2 bg-vellum hover:border-hair-hot hover:shadow-soft'
              )}
            >
              <input {...getInputProps()} />
              <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-recess text-terra-dk">
                <Upload className="h-5 w-5" />
              </span>
              <p className="font-serif text-lg font-medium leading-snug text-ink">
                {isDragActive ? 'Drop the PDF here' : 'Tap to select or drag a lab report PDF'}
              </p>
              <p className="mt-1.5 text-xs text-ink-3">Supports Metropolis Healthcare and other labs (max 10MB)</p>
            </div>
            {step === 'error' && (
              <div role="alert" className="mt-4 flex items-start gap-2.5 rounded-card border border-l-2 border-hair border-l-critical bg-critical-pale p-3.5">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-critical" />
                <div className="text-sm text-critical">{error}</div>
              </div>
            )}
          </div>
        )}

        {/* Parsing step */}
        {step === 'parsing' && (
          <div className="py-12 text-center" role="status">
            <div className="mx-auto mb-4 h-7 w-7 animate-spin rounded-full border-2 border-terra border-t-transparent" />
            <p className="text-sm text-ink-2">Extracting values from <strong className="font-semibold text-ink">{fileName}</strong>...</p>
            <p className="mt-1 text-xs text-ink-3">Using regex patterns + AI fallback</p>
          </div>
        )}

        {/* Review step */}
        {step === 'review' && (
          <div>
            <div className="mb-5 flex gap-3">
              <div className="min-w-0 flex-1">
                <label htmlFor="upload-date" className="label mb-1.5 block text-ink-3">Date</label>
                <input
                  id="upload-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="field tabular"
                />
              </div>
              <div className="min-w-0 flex-1">
                <label htmlFor="upload-lab" className="label mb-1.5 block text-ink-3">Lab</label>
                <input
                  id="upload-lab"
                  value={labName}
                  onChange={(e) => setLabName(e.target.value)}
                  className="field"
                />
              </div>
            </div>

            <div className="mb-2 flex items-baseline justify-between gap-3">
              <h2 className="font-serif text-xl font-medium tracking-[-.015em] text-ink tabular">
                {values.length} values extracted
              </h2>
              <span className="text-xs text-ink-3">Tap a value to edit</span>
            </div>

            <ul className="border-t border-hair-2">
              {values.map((val, idx) => (
                <li
                  key={idx}
                  className={cn(
                    'flex min-h-[48px] items-center gap-2.5 border-b border-hair-2 py-1.5',
                    val.isAbnormal && 'bg-terra-pale/50'
                  )}
                >
                  <span className={cn(
                    'ml-1 h-2 w-2 flex-shrink-0 rounded-full',
                    val.isAbnormal ? 'bg-terra' : 'bg-sage'
                  )} />
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">{val.testName}</span>
                  {editingIdx === idx ? (
                    <input
                      type="number"
                      step="any"
                      defaultValue={val.value}
                      autoFocus
                      onBlur={(e) => updateValue(idx, parseFloat(e.target.value))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') updateValue(idx, parseFloat((e.target as HTMLInputElement).value))
                      }}
                      className="field w-24 px-2 py-1.5 text-right tabular"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setEditingIdx(idx)}
                      className={cn(
                        'num min-h-[40px] rounded-btn px-2 text-[17px] font-medium underline decoration-hair-2 decoration-dotted underline-offset-4 hover:bg-wash',
                        val.isAbnormal ? 'text-terra-dk' : 'text-ink'
                      )}
                    >
                      {val.value}
                    </button>
                  )}
                  <span className="w-14 text-right text-[11px] text-ink-3">{val.unit}</span>
                  <button
                    type="button"
                    onClick={() => removeValue(idx)}
                    aria-label={`Remove ${val.testName}`}
                    className="flex h-10 w-9 items-center justify-center rounded-btn text-base text-ink-3 transition-colors hover:bg-critical-pale hover:text-critical"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>

            <div className="mt-6 flex gap-3">
              <Button
                variant="secondary"
                onClick={() => { setStep('upload'); setValues([]) }}
                className="flex-1"
              >
                Re-upload
              </Button>
              <Button onClick={handleSave} className="flex-[2]">
                Save {values.length} Values
              </Button>
            </div>
          </div>
        )}

        {/* Saving / Done */}
        {step === 'saving' && (
          <div className="py-12 text-center" role="status">
            <div className="mx-auto mb-4 h-7 w-7 animate-spin rounded-full border-2 border-sage border-t-transparent" />
            <p className="text-sm text-ink-2">Saving to Firestore...</p>
          </div>
        )}

        {step === 'done' && (
          <div className="animate-fade-up py-12 text-center" role="status">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-sage-pale">
              <Check className="h-6 w-6 text-sage" />
            </div>
            <p className="font-serif text-xl font-medium text-ink">Record saved!</p>
            <p className="mt-1 text-xs text-ink-3">Redirecting to dashboard...</p>
          </div>
        )}
      </main>
    </>
  )
}
