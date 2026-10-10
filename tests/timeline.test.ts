import { describe, expect, it } from 'vitest'
import { buildTimeline, filterTimeline, groupByMonth } from '@/lib/timeline/build'
import type { LabRecord } from '@/lib/types/lab-record'

// Synthetic data only.

const records: LabRecord[] = [
  {
    id: 'r1',
    recordDate: '2026-03-05T00:00:00.000Z',
    labName: 'Test Lab',
    values: [
      { testName: 'Creatinine', panel: 'kidney', value: 1.5, unit: 'mg/dL', isAbnormal: true },
      { testName: 'eGFR', panel: 'kidney', value: 70, unit: '', isAbnormal: false },
    ],
  },
  { id: 'r2', recordDate: '2026-01-20T00:00:00.000Z', labName: '', values: [] },
]

const input = {
  records,
  visits: [
    { id: 'v1', visitDate: '2026-03-05', visitTime: '10:00', doctorName: 'Dr Test', createdBy: 'u' },
    { id: 'v2', visitDate: '2026-11-01', createdBy: 'u' },
  ],
  doseChanges: [
    { id: 'd1', medicationId: 'm1', medicationName: 'Tacrolimus', dose: '1.5 mg', previousDose: '2 mg', effectiveDate: '2026-03-06', visitId: 'v1', createdBy: 'u' },
  ],
  documents: [
    { id: 'doc1', kind: 'prescription' as const, title: 'Rx', fileName: 'rx.jpg', storagePath: 'x', contentType: 'image/jpeg', size: 1, documentDate: '2026-02-01', createdBy: 'u' },
    { id: 'doc2', kind: 'lab-report' as const, fileName: 'a.pdf', storagePath: 'x', contentType: 'application/pdf', size: 1, labRecordId: 'r1', createdBy: 'u' },
    { id: 'doc3', kind: 'other' as const, fileName: 'b.pdf', storagePath: 'x', contentType: 'application/pdf', size: 1, createdAt: '2026-01-25T08:00:00.000Z', createdBy: 'u' },
  ],
  questions: [
    { id: 'q1', text: 'Is this OK?', status: 'answered' as const, answer: 'Yes', answeredAt: '2026-03-05T11:00:00.000Z', visitId: 'v1', createdBy: 'u' },
    { id: 'q2', text: 'Open one', status: 'open' as const, createdBy: 'u' },
  ],
  today: '2026-10-10',
}

describe('buildTimeline', () => {
  const items = buildTimeline(input)

  it('merges all kinds newest first', () => {
    expect(items.map((i) => i.key)).toEqual([
      'visit:v2',
      'dose:m1/d1',
      'question:q1',
      'visit:v1',
      'lab:r1',
      'document:doc1',
      'document:doc3',
      'lab:r2',
    ])
  })

  it('skips documents that produced a record and unanswered questions', () => {
    expect(items.some((i) => i.key === 'document:doc2')).toBe(false)
    expect(items.some((i) => i.key === 'question:q2')).toBe(false)
  })

  it('builds titles, links and flags', () => {
    const dose = items.find((i) => i.kind === 'dose')!
    expect(dose.title).toBe('Tacrolimus dose 2 mg → 1.5 mg')
    expect(dose.href).toBe('/visits/v1')
    const lab = items.find((i) => i.key === 'lab:r1')!
    expect(lab.flag).toBe('abnormal')
    expect(lab.detail).toBe('2 tests, 1 out of range')
    expect(lab.href).toBe('/records/r1')
    expect(items.find((i) => i.key === 'visit:v2')!.flag).toBe('upcoming')
    expect(items.find((i) => i.key === 'visit:v1')!.flag).toBeUndefined()
  })

  it('filters by kind and groups by month', () => {
    const labs = filterTimeline(items, new Set(['lab'] as const))
    expect(labs.map((i) => i.key)).toEqual(['lab:r1', 'lab:r2'])
    expect(filterTimeline(items, new Set())).toHaveLength(items.length)

    const months = groupByMonth(items)
    expect(months.map((m) => m.month)).toEqual(['2026-11', '2026-03', '2026-02', '2026-01'])
    expect(months[1].items).toHaveLength(4)
  })

  it('ignores items with invalid dates', () => {
    const out = buildTimeline({ records: [{ id: 'x', recordDate: 'garbage', labName: '', values: [] }] })
    expect(out).toEqual([])
  })
})
