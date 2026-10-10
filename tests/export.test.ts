import { describe, expect, it } from 'vitest'
import { buildFullExport, buildLabCsv, contentDisposition, csvField, exportSlug, fileDate } from '@/lib/export/build'
import type { LabRecord } from '@/lib/types/lab-record'
import { asDateString, asText, sanitizeBundle } from '@/lib/export/sanitize'

// Synthetic data only.

describe('csvField', () => {
  it('quotes commas, quotes and newlines', () => {
    expect(csvField('a,b')).toBe('"a,b"')
    expect(csvField('say "hi"')).toBe('"say ""hi"""')
    expect(csvField('line1\nline2')).toBe('"line1\nline2"')
    expect(csvField('plain')).toBe('plain')
  })

  it('renders numbers and empties', () => {
    expect(csvField(1.25)).toBe('1.25')
    expect(csvField(-3)).toBe('-3')
    expect(csvField(NaN)).toBe('')
    expect(csvField(null)).toBe('')
    expect(csvField(undefined)).toBe('')
  })

  it('neutralises spreadsheet formulas but not negative numbers', () => {
    expect(csvField('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`)
    expect(csvField('+cmd')).toBe("'+cmd")
    expect(csvField('@SUM(A1)')).toBe("'@SUM(A1)")
    expect(csvField('-1.5')).toBe('-1.5')
  })
})

describe('buildLabCsv', () => {
  const records: LabRecord[] = [
    {
      id: 'b',
      recordDate: '2026-03-01T00:00:00.000Z',
      labName: 'Lab, "North"',
      values: [{ testName: 'Creatinine', panel: 'kidney', value: 1.4, unit: 'mg/dL', referenceMin: 0.7, referenceMax: 1.3, isAbnormal: true }],
    },
    {
      id: 'a',
      recordDate: '2026-01-01T00:00:00.000Z',
      labName: 'Test Lab',
      values: [
        { testName: 'eGFR', panel: 'kidney', value: 70, unit: 'mL/min/1.73m²', referenceMin: 60, referenceMax: 120, isAbnormal: false },
        { testName: 'Urine Protein', panel: 'urine', value: 0, unit: 'mg/dL', isAbnormal: false },
      ],
    },
  ]

  it('writes a header and one row per value, oldest first', () => {
    const lines = buildLabCsv(records).split('\r\n')
    expect(lines[0]).toBe('date,lab,test,value,unit,refMin,refMax,abnormal,target')
    expect(lines[1]).toBe('2026-01-01,Test Lab,eGFR,70,mL/min/1.73m²,60,120,no,')
    expect(lines[2]).toBe('2026-01-01,Test Lab,Urine Protein,0,mg/dL,,,no,')
    expect(lines[3]).toBe('2026-03-01,"Lab, ""North""",Creatinine,1.4,mg/dL,0.7,1.3,yes,')
    expect(lines[4]).toBe('')
    expect(lines).toHaveLength(5)
  })

  it('adds the patient target next to the printed range', () => {
    const lines = buildLabCsv(records, [
      { testName: 'eGFR', min: 45, max: null },
      { testName: 'Creatinine', min: 0.8, max: 1.2 },
    ]).split('\r\n')
    expect(lines[1]).toBe('2026-01-01,Test Lab,eGFR,70,mL/min/1.73m²,60,120,no,≥ 45')
    expect(lines[3]).toBe('2026-03-01,"Lab, ""North""",Creatinine,1.4,mg/dL,0.7,1.3,yes,0.8–1.2')
  })

  it('handles no records', () => {
    expect(buildLabCsv([])).toBe('date,lab,test,value,unit,refMin,refMax,abnormal,target\r\n')
  })
})

describe('buildFullExport', () => {
  it('includes every section and sorts records', () => {
    const out = buildFullExport(
      {
        patient: { displayName: 'Test Patient' },
        records: [
          { id: 'b', recordDate: '2026-03-01T00:00:00.000Z', labName: '', values: [] },
          { id: 'a', recordDate: '2026-01-01T00:00:00.000Z', labName: '', values: [] },
        ],
        medications: [{ id: 'm1', doseHistory: [] }],
        visits: [],
        questions: [],
        targets: [],
        vitals: [],
        documents: [{ id: 'd1', storagePath: 'patients/p/documents/d1/x.pdf' }],
      },
      new Date('2026-10-10T00:00:00Z')
    )
    expect(Object.keys(out)).toEqual([
      'schemaVersion', 'exportedAt', 'patient', 'labRecords', 'medications', 'visits', 'questions', 'targets', 'vitals', 'documents',
    ])
    expect(out.labRecords.map((r) => r.id)).toEqual(['a', 'b'])
    expect(out.exportedAt).toBe('2026-10-10T00:00:00.000Z')
  })
})

describe('exportSlug', () => {
  it('makes a filename-safe slug', () => {
    expect(exportSlug('Test Patient (Dad)')).toBe('test-patient-dad')
    expect(exportSlug('')).toBe('patient')
    expect(exportSlug(undefined)).toBe('patient')
  })
})

describe('mistyped clinical fields (defensive coercion)', () => {
  // Synthetic: an editor stored recordDate / visitDate as numbers before the rules checked types.
  const bad = () => ({
    records: [
      { id: 'r1', recordDate: 1767225600000, labName: 42, values: [{ testName: 'Creatinine', panel: 'kidney', value: 1.1, unit: 'mg/dL', isAbnormal: false }, null, { testName: 'eGFR', value: 'x' }] },
      { id: 'r2', recordDate: { weird: true }, labName: null, values: 'nope' },
      { id: 'r3', recordDate: '2025-06-01T00:00:00.000Z', labName: 'Synthetic Lab', values: [] },
    ] as never[],
    medications: [{ id: 'm1', name: 7, dose: null, frequency: undefined, doseHistory: [{ effectiveDate: 5 }, { effectiveDate: '2025-01-02' }] }] as never[],
    visits: [{ id: 'v1', visitDate: 20250101, nextVisitDate: 3 }] as never[],
    questions: [{ id: 'q1', text: { x: 1 }, createdAt: 99 }] as never[],
  })

  it('buildLabCsv and buildFullExport never throw on non-string dates', () => {
    const b = bad()
    expect(() => buildLabCsv(b.records)).not.toThrow()
    expect(() => buildFullExport({ patient: null, records: b.records, medications: [], visits: [], questions: [], targets: [], vitals: [], documents: [] })).not.toThrow()
  })

  it('sanitizeBundle coerces to strings and drops malformed values', () => {
    const b = bad()
    sanitizeBundle(b)
    const [r1, r2, r3] = b.records as unknown as { recordDate: string; labName: string; values: unknown[] }[]
    expect(r1.recordDate).toBe('2026-01-01T00:00:00.000Z')
    expect(r1.labName).toBe('42')
    expect(r1.values).toHaveLength(1)
    expect(r2).toMatchObject({ recordDate: '', labName: '', values: [] })
    expect(r3.recordDate).toBe('2025-06-01T00:00:00.000Z')
    const v = b.visits[0] as unknown as { visitDate: string; nextVisitDate: string | null }
    expect(typeof v.visitDate).toBe('string')
    expect(typeof v.nextVisitDate).toBe('string')
    expect((b.questions[0] as unknown as { text: string }).text).toBe('')
    const m = b.medications[0] as unknown as { name: string; dose: string; doseHistory: { effectiveDate: string }[] }
    expect(m).toMatchObject({ name: '7', dose: '' })
    expect(m.doseHistory.map((h) => typeof h.effectiveDate)).toEqual(['string', 'string'])
    expect(asDateString(Number.NaN)).toBe('')
    expect(asText({})).toBe('')
  })
})

describe('download headers', () => {
  it('fileDate only lets a plain YYYY-MM-DD through', () => {
    expect(fileDate('2026-03-01')).toBe('2026-03-01')
    expect(fileDate('2026-03-01"\r\nSet-Cookie: x=1')).toBe('undated')
    expect(fileDate(20260301)).toBe('undated')
    expect(fileDate(undefined)).toBe('undated')
  })

  it('contentDisposition never lets quotes or CR/LF into the header', () => {
    expect(contentDisposition('visit-prep-asha-2026-03-01.pdf')).toBe('attachment; filename="visit-prep-asha-2026-03-01.pdf"')
    const evil = contentDisposition('a"b\r\nSet-Cookie: x=1.pdf')
    expect(evil).not.toMatch(/[\r\n]/)
    expect(evil.split('"').length).toBe(3) // exactly one quoted value
    expect(evil).toContain("filename*=UTF-8''")
  })

  it('adds an RFC 5987 filename* for non-ASCII names', () => {
    const h = contentDisposition('रिपोर्ट.pdf')
    expect(h).toMatch(/^attachment; filename="[A-Za-z0-9._-]+"; filename\*=UTF-8''%E0/)
    expect(decodeURIComponent(h.split("UTF-8''")[1])).toBe('रिपोर्ट.pdf')
  })
})
