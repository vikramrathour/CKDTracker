'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/layout/header'
import { useAuth } from '@/components/providers/auth-provider'
import { useLabRecords } from '@/lib/hooks/use-lab-records'
import { addLabRecord } from '@/lib/firebase/firestore'
import { PANELS } from '@/lib/constants/test-panels'
import { REFERENCE_RANGES } from '@/lib/constants/reference-ranges'
import type { LabValue, Panel } from '@/lib/types/lab-record'

export default function NewRecordPage() {
  const router = useRouter()
  const { user } = useAuth()
  const { records } = useLabRecords()

  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [lab, setLab] = useState('Metropolis Healthcare')
  const [activePanel, setActivePanel] = useState<Panel>('kidney')
  const [values, setValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const updateValue = (testName: string, val: string) => {
    setValues((prev) => ({ ...prev, [testName]: val }))
  }

  const handleSave = async () => {
    if (!user || !date) return

    // Check for duplicate date
    const existingRecord = records.find(
      (r) => r.recordDate.startsWith(date)
    )
    if (existingRecord) {
      const confirmed = confirm(
        `A record for ${date} already exists with ${existingRecord.values.length} tests. Do you want to add another record for this date?`
      )
      if (!confirmed) return
    }

    setSaving(true)
    try {
      // Build lab values from filled fields
      const labValues: Omit<LabValue, 'id'>[] = []
      for (const [testName, strVal] of Object.entries(values)) {
        if (strVal === '' || strVal === undefined) continue
        const numVal = parseFloat(strVal)
        if (isNaN(numVal)) continue

        const ref = REFERENCE_RANGES[testName]
        if (!ref) continue

        labValues.push({
          testName,
          panel: ref.panel,
          value: numVal,
          unit: ref.unit,
          referenceMin: ref.min,
          referenceMax: ref.max,
          isAbnormal: numVal < ref.min || numVal > ref.max,
        })
      }

      if (labValues.length === 0) {
        alert('Please enter at least one test value.')
        setSaving(false)
        return
      }

      await addLabRecord(user.uid, {
        recordDate: new Date(date),
        labName: lab,
        values: labValues,
      })

      router.push('/records')
    } catch (err) {
      console.error('Failed to save record:', err)
      alert('Failed to save record. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const currentPanel = PANELS.find((p) => p.id === activePanel)
  const panelTests = currentPanel?.tests || []

  return (
    <>
      <Header title="Add Record" showBack />
      <main className="px-4 py-4">
        {/* Date & Lab */}
        <div className="flex gap-3 mb-5">
          <div className="flex-1">
            <label className="text-[11px] uppercase tracking-wider text-gray-400 block mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg font-mono text-sm bg-white"
            />
          </div>
          <div className="flex-1">
            <label className="text-[11px] uppercase tracking-wider text-gray-400 block mb-1">Lab</label>
            <input
              value={lab}
              onChange={(e) => setLab(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-white"
            />
          </div>
        </div>

        {/* Panel Tabs */}
        <div className="flex flex-wrap gap-1.5 mb-5">
          {PANELS.map((panel) => (
            <button
              key={panel.id}
              onClick={() => setActivePanel(panel.id)}
              className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
                activePanel === panel.id
                  ? 'border-emerald-700 bg-emerald-50 text-emerald-700'
                  : 'border-gray-200 bg-white text-gray-500'
              }`}
            >
              {panel.label}
            </button>
          ))}
        </div>

        {/* Test Fields */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          {panelTests.map((testName) => {
            const ref = REFERENCE_RANGES[testName]
            if (!ref) return null
            return (
              <div key={testName}>
                <label className="text-[11px] text-gray-500 block mb-1">{ref.label}</label>
                <input
                  type="number"
                  step="any"
                  value={values[testName] ?? ''}
                  onChange={(e) => updateValue(testName, e.target.value)}
                  placeholder={`${ref.min}–${ref.max < 900 ? ref.max : '—'}`}
                  className="w-full px-2.5 py-2 border border-gray-200 rounded-md font-mono text-sm bg-white"
                />
              </div>
            )
          })}
        </div>

        {/* Summary of filled values */}
        {Object.keys(values).filter((k) => values[k] !== '').length > 0 && (
          <div className="mb-4 p-3 bg-blue-50 rounded-lg text-xs text-blue-700">
            {Object.keys(values).filter((k) => values[k] !== '').length} test value(s) entered across panels
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={() => router.back()}
            className="flex-1 py-3 border border-gray-200 rounded-lg text-sm text-gray-500 bg-white"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-[2] py-3 rounded-lg text-sm font-semibold text-white bg-emerald-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Record'}
          </button>
        </div>
      </main>
    </>
  )
}
