'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/layout/header'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/tabs'
import { usePatient, useCanEdit } from '@/components/providers/patient-provider'
import { ViewOnlyNotice } from '@/components/shared/view-only-notice'
import { useLabRecords } from '@/lib/hooks/use-lab-records'
import { addLabRecord } from '@/lib/firebase/firestore'
import { PANELS } from '@/lib/constants/test-panels'
import { REFERENCE_RANGES } from '@/lib/constants/reference-ranges'
import type { LabValue, Panel } from '@/lib/types/lab-record'

export default function NewRecordPage() {
  const router = useRouter()
  const { pid } = usePatient()
  const canEdit = useCanEdit()
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
    if (!pid || !canEdit || !date) return

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

      await addLabRecord(pid, {
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

  if (!canEdit) {
    return (
      <>
        <Header title="Add Record" emphasis="Record" showBack />
        <main className="px-4 py-5"><ViewOnlyNotice /></main>
      </>
    )
  }

  const currentPanel = PANELS.find((p) => p.id === activePanel)
  const panelTests = currentPanel?.tests || []

  return (
    <>
      <Header title="Add Record" emphasis="Record" showBack />
      <main className="px-4 py-5">
        {/* Date & Lab */}
        <div className="mb-5 flex gap-3">
          <div className="min-w-0 flex-1">
            <label htmlFor="record-date" className="label mb-1.5 block text-ink-3">Date</label>
            <input
              id="record-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="field tabular"
            />
          </div>
          <div className="min-w-0 flex-1">
            <label htmlFor="record-lab" className="label mb-1.5 block text-ink-3">Lab</label>
            <input
              id="record-lab"
              value={lab}
              onChange={(e) => setLab(e.target.value)}
              className="field"
            />
          </div>
        </div>

        {/* Panel Tabs */}
        <div className="mb-5 flex flex-wrap gap-2">
          {PANELS.map((panel) => (
            <Chip
              key={panel.id}
              selected={activePanel === panel.id}
              onClick={() => setActivePanel(panel.id)}
            >
              {panel.label}
            </Chip>
          ))}
        </div>

        {/* Test Fields */}
        <div className="mb-6 grid grid-cols-2 gap-x-3 gap-y-4 rounded-card border border-hair bg-vellum p-4">
          {panelTests.map((testName) => {
            const ref = REFERENCE_RANGES[testName]
            if (!ref) return null
            const id = `test-${testName.replace(/\W+/g, '-')}`
            return (
              <div key={testName} className="min-w-0">
                <label htmlFor={id} className="mb-1.5 block truncate text-xs font-medium text-ink-2">{ref.label}</label>
                <input
                  id={id}
                  type="number"
                  inputMode="decimal"
                  step="any"
                  value={values[testName] ?? ''}
                  onChange={(e) => updateValue(testName, e.target.value)}
                  placeholder={`${ref.min}–${ref.max < 900 ? ref.max : '—'}`}
                  className="field tabular"
                />
              </div>
            )
          })}
        </div>

        {/* Summary of filled values */}
        {Object.keys(values).filter((k) => values[k] !== '').length > 0 && (
          <p className="mb-4 flex items-center gap-2 text-[13px] text-sage tabular" role="status">
            <span className="h-1.5 w-1.5 rounded-full bg-sage" aria-hidden />
            {Object.keys(values).filter((k) => values[k] !== '').length} test value(s) entered across panels
          </p>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => router.back()} className="flex-1">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving} className="flex-[2]">
            {saving ? 'Saving...' : 'Save Record'}
          </Button>
        </div>
      </main>
    </>
  )
}
