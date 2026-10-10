'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useDropzone } from 'react-dropzone'
import { Header } from '@/components/layout/header'
import { useAuth } from '@/components/providers/auth-provider'
import { useLabRecords } from '@/lib/hooks/use-lab-records'
import { addLabRecord } from '@/lib/firebase/firestore'
import { REFERENCE_RANGES } from '@/lib/constants/reference-ranges'
import { Upload, FileText, Check, AlertCircle, Pencil } from 'lucide-react'
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

      const res = await fetch('/api/pdf/parse', { method: 'POST', body: formData })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to parse PDF')
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
      setError('Failed to upload file. Please try again.')
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
      <Header title="Upload Report" showBack />
      <main className="px-4 py-4">
        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-6">
          {['Upload', 'Review', 'Save'].map((label, i) => {
            const stepIdx = i === 0 ? 'upload' : i === 1 ? 'review' : 'done'
            const isActive = (step === 'upload' || step === 'parsing') && i === 0
              || (step === 'review') && i === 1
              || (step === 'saving' || step === 'done') && i === 2
            const isDone = (i === 0 && step !== 'upload' && step !== 'parsing' && step !== 'error')
              || (i === 1 && (step === 'saving' || step === 'done'))
              || (i === 2 && step === 'done')
            return (
              <div key={label} className="flex items-center gap-2 flex-1">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  isDone ? 'bg-emerald-600 text-white' :
                  isActive ? 'bg-blue-600 text-white' :
                  'bg-gray-200 text-gray-400'
                }`}>
                  {isDone ? <Check className="w-3.5 h-3.5" /> : i + 1}
                </div>
                <span className={`text-xs ${isActive || isDone ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>
                  {label}
                </span>
                {i < 2 && <div className="flex-1 h-px bg-gray-200" />}
              </div>
            )
          })}
        </div>

        {/* Upload step */}
        {(step === 'upload' || step === 'error') && (
          <div>
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                isDragActive ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
              }`}
            >
              <input {...getInputProps()} />
              <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-700">
                {isDragActive ? 'Drop the PDF here' : 'Tap to select or drag a lab report PDF'}
              </p>
              <p className="text-xs text-gray-400 mt-1">Supports Metropolis Healthcare and other labs (max 10MB)</p>
            </div>
            {step === 'error' && (
              <div className="mt-4 p-3 bg-red-50 rounded-lg border border-red-100 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-red-700">{error}</div>
              </div>
            )}
          </div>
        )}

        {/* Parsing step */}
        {step === 'parsing' && (
          <div className="text-center py-12">
            <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-600">Extracting values from <strong>{fileName}</strong>...</p>
            <p className="text-xs text-gray-400 mt-1">Using regex patterns + AI fallback</p>
          </div>
        )}

        {/* Review step */}
        {step === 'review' && (
          <div>
            <div className="flex gap-3 mb-4">
              <div className="flex-1">
                <label className="text-[11px] uppercase tracking-wider text-gray-400 block mb-1">Date</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg font-mono text-sm bg-white"
                />
              </div>
              <div className="flex-1">
                <label className="text-[11px] uppercase tracking-wider text-gray-400 block mb-1">Lab</label>
                <input
                  value={labName}
                  onChange={(e) => setLabName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-gray-900">
                {values.length} values extracted
              </span>
              <span className="text-xs text-gray-400">Tap a value to edit</span>
            </div>

            <div className="space-y-1.5">
              {values.map((val, idx) => {
                const ref = REFERENCE_RANGES[val.testName]
                return (
                  <div
                    key={idx}
                    className={`flex items-center gap-2 p-2.5 rounded-lg border ${
                      val.isAbnormal ? 'border-red-200 bg-red-50/50' : 'border-gray-100 bg-white'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      val.isAbnormal ? 'bg-red-500' : 'bg-emerald-500'
                    }`} />
                    <span className="text-sm text-gray-900 flex-1">{val.testName}</span>
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
                        className="w-20 px-2 py-1 border border-blue-300 rounded text-sm font-mono text-right"
                      />
                    ) : (
                      <button
                        onClick={() => setEditingIdx(idx)}
                        className={`font-mono text-sm font-semibold ${
                          val.isAbnormal ? 'text-red-600' : 'text-emerald-600'
                        }`}
                      >
                        {val.value}
                      </button>
                    )}
                    <span className="text-[10px] text-gray-400 w-14 text-right">{val.unit}</span>
                    <button
                      onClick={() => removeValue(idx)}
                      className="text-gray-300 hover:text-red-400 text-sm px-1"
                    >
                      ×
                    </button>
                  </div>
                )
              })}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setStep('upload'); setValues([]); }}
                className="flex-1 py-3 border border-gray-200 rounded-lg text-sm text-gray-500 bg-white"
              >
                Re-upload
              </button>
              <button
                onClick={handleSave}
                className="flex-[2] py-3 rounded-lg text-sm font-semibold text-white bg-emerald-700"
              >
                Save {values.length} Values
              </button>
            </div>
          </div>
        )}

        {/* Saving / Done */}
        {step === 'saving' && (
          <div className="text-center py-12">
            <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-600">Saving to Firestore...</p>
          </div>
        )}

        {step === 'done' && (
          <div className="text-center py-12">
            <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <Check className="w-6 h-6 text-emerald-600" />
            </div>
            <p className="text-sm font-semibold text-gray-900">Record saved!</p>
            <p className="text-xs text-gray-400 mt-1">Redirecting to dashboard...</p>
          </div>
        )}
      </main>
    </>
  )
}
