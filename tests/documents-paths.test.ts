import { describe, expect, it } from 'vitest'
import { documentStoragePath, isDocumentStoragePath, safeFileName } from '@/lib/documents/paths'
import { fromCachedExtraction, toCachedExtraction } from '@/lib/server/pdf/cache'

// Synthetic ids only.
const PID = 'alice0000000000000000000001'
const OTHER_PID = 'mallory0000000000000000004'

describe('isDocumentStoragePath (server-side scope check for loader + extract)', () => {
  it('accepts a file directly in this document folder', () => {
    expect(isDocumentStoragePath(`patients/${PID}/documents/d1/report.pdf`, PID, 'd1')).toBe(true)
    // Migrated legacy names keep their original characters.
    expect(isDocumentStoragePath(`patients/${PID}/documents/d1/1700000000000-My Report.pdf`, PID, 'd1')).toBe(true)
  })

  it("rejects another patient's or another document's file", () => {
    expect(isDocumentStoragePath(`patients/${OTHER_PID}/documents/d1/report.pdf`, PID, 'd1')).toBe(false)
    expect(isDocumentStoragePath(`patients/${PID}/documents/d2/report.pdf`, PID, 'd1')).toBe(false)
    // Prefix tricks: d1 vs d10, pid vs pid_suffix
    expect(isDocumentStoragePath(`patients/${PID}/documents/d10/report.pdf`, PID, 'd1')).toBe(false)
    expect(isDocumentStoragePath(`patients/${PID}_abcdef12/documents/d1/report.pdf`, PID, 'd1')).toBe(false)
    expect(isDocumentStoragePath(`lab-pdfs/${PID}/report.pdf`, PID, 'd1')).toBe(false)
  })

  it('rejects traversal, sub-folders, empty names and non-strings', () => {
    expect(isDocumentStoragePath(`patients/${PID}/documents/d1/../d2/report.pdf`, PID, 'd1')).toBe(false)
    expect(isDocumentStoragePath(`patients/${PID}/documents/d1/..`, PID, 'd1')).toBe(false)
    expect(isDocumentStoragePath(`patients/${PID}/documents/d1/sub/report.pdf`, PID, 'd1')).toBe(false)
    expect(isDocumentStoragePath(`patients/${PID}/documents/d1/`, PID, 'd1')).toBe(false)
    expect(isDocumentStoragePath(`patients/${PID}/documents/d1/a\\b.pdf`, PID, 'd1')).toBe(false)
    expect(isDocumentStoragePath(42, PID, 'd1')).toBe(false)
    expect(isDocumentStoragePath(undefined, PID, 'd1')).toBe(false)
    expect(isDocumentStoragePath(`patients/${PID}/documents/../report.pdf`, PID, '..')).toBe(false)
  })

  it('round-trips with documentStoragePath + safeFileName', () => {
    const name = safeFileName('../Report (Mar) é.pdf')
    expect(name).not.toContain('/')
    expect(name.startsWith('.')).toBe(false)
    expect(isDocumentStoragePath(documentStoragePath(PID, 'd1', name), PID, 'd1')).toBe(true)
    expect(safeFileName('')).toBe('document')
  })
})

describe('extraction cache', () => {
  const values = [
    { testName: 'Creatinine', panel: 'kidney', value: 1.2, unit: 'mg/dL', referenceMin: 0.7, referenceMax: 1.3, isAbnormal: false },
  ]

  it('stores a Firestore-safe copy and reads it back unchanged', () => {
    const stored = toCachedExtraction({
      values: [{ ...values[0], referenceMin: undefined } as never],
      date: '2026-03-01',
      labName: 'Synthetic Lab',
      method: 'regex',
    })
    expect(JSON.stringify(stored)).not.toContain('undefined')
    expect(stored.note).toBeNull()
    const back = fromCachedExtraction({ ...stored, extractedAt: new Date() })
    expect(back).toMatchObject({ date: '2026-03-01', labName: 'Synthetic Lab', method: 'regex' })
    expect(back?.values[0]).toMatchObject({ testName: 'Creatinine', value: 1.2, referenceMax: 1.3 })
  })

  it('keeps other tests in the other panel; drops bad names, bad values and bad dates; null for junk', () => {
    const back = fromCachedExtraction({
      version: 2,
      method: 'gemini',
      date: 'yesterday',
      labName: 42,
      values: [
        { testName: 'SGPT (ALT)', value: 52, unit: 'U/L', referenceMax: 45 },
        { testName: '__proto__', value: 1 },
        { testName: '12.5', value: 1 },
        { testName: 'Creatinine', value: 'x' },
        values[0],
        { ...values[0], value: 9 },
      ],
    })
    expect(back?.values.map((v) => [v.testName, v.panel, v.value])).toEqual([
      ['SGPT (ALT)', 'other', 52],
      ['Creatinine', 'kidney', 1.2],
    ])
    expect(back?.values[0]).toMatchObject({ unit: 'U/L', referenceMax: 45, isAbnormal: true })
    expect(back?.date).toBeNull()
    expect(back?.labName).toBeNull()
    expect(fromCachedExtraction(null)).toBeNull()
    expect(fromCachedExtraction({ version: 2, values: 'nope', method: 'regex' })).toBeNull()
    expect(fromCachedExtraction({ version: 2, values: [], method: 'evil' })).toBeNull()
    expect(fromCachedExtraction({ version: 2, values: [], method: 'gemini' })?.method).toBe('none')
  })

  it('ignores entries from before other tests were kept (no version)', () => {
    expect(fromCachedExtraction({ values: [values[0]], method: 'regex', date: null, labName: null, note: null })).toBeNull()
  })
})
