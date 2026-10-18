import { describe, expect, it } from 'vitest'
import {
  EXTRACTABLE_TESTS,
  EXTRACTION_SCHEMA,
  coerceNumber,
  MAX_RECORD_VALUES,
  guessLabName,
  mergeLabValues,
  parseExtractionText,
  validateExtraction,
} from '@/lib/parsing/extraction'
import { REFERENCE_RANGES } from '@/lib/constants/reference-ranges'

// Synthetic model responses only.

describe('EXTRACTION_SCHEMA', () => {
  it('restricts knownTest to REFERENCE_RANGES keys and leaves testName free', () => {
    const props = EXTRACTION_SCHEMA.properties.values.items.properties
    expect([...props.knownTest.enum].sort()).toEqual(Object.keys(REFERENCE_RANGES).sort())
    expect('enum' in props.testName).toBe(false)
    expect(EXTRACTABLE_TESTS).toContain('Tacrolimus')
  })
})

describe('coerceNumber', () => {
  it('accepts numbers and numeric strings', () => {
    expect(coerceNumber(7.2)).toBe(7.2)
    expect(coerceNumber(' 1,234.5 ')).toBe(1234.5)
    expect(coerceNumber('.5')).toBe(0.5)
    expect(coerceNumber('-2')).toBe(-2)
  })

  it('rejects junk', () => {
    expect(coerceNumber('12 mg/dL')).toBeNull()
    expect(coerceNumber('<5')).toBeNull()
    expect(coerceNumber('')).toBeNull()
    expect(coerceNumber(Infinity)).toBeNull()
    expect(coerceNumber(null)).toBeNull()
    expect(coerceNumber({})).toBeNull()
  })
})

describe('validateExtraction', () => {
  it('keeps known tests, coerces values, flags against ranges', () => {
    const r = validateExtraction({
      date: '2026-03-05',
      labName: '  Some   Lab ',
      values: [
        { testName: 'Creatinine', value: '1.45', unit: 'mg/dL' },
        { testName: 'Hemoglobin', value: 14.1, unit: '' },
      ],
    })
    expect(r.date).toBe('2026-03-05')
    expect(r.labName).toBe('Some Lab')
    expect(r.values).toHaveLength(2)
    expect(r.values[0]).toMatchObject({ testName: 'Creatinine', value: 1.45, unit: 'mg/dL', panel: 'kidney', isAbnormal: true })
    expect(r.values[1]).toMatchObject({ testName: 'Hemoglobin', unit: 'g/dL', isAbnormal: false })
  })

  it('maps knownTest (or an exact / case-only match) to the canonical test', () => {
    const r = validateExtraction({
      values: [
        { testName: 'Haemoglobin (Hb)', knownTest: 'Hemoglobin', value: 13.2, unit: 'g/dL' },
        { testName: 'creatinine', knownTest: null, value: 1.1, unit: 'mg/dL' },
        { testName: 'Potassium', value: 4.1, unit: 'mEq/L' },
      ],
    })
    expect(r.values.map((v) => [v.testName, v.panel])).toEqual([
      ['Hemoglobin', 'hemogram'],
      ['Creatinine', 'kidney'],
      ['Potassium', 'electrolytes'],
    ])
  })

  it('keeps every other numeric test in the other panel, flagged against its printed range', () => {
    const r = validateExtraction({
      values: [
        { testName: '  SGPT   (ALT) ', knownTest: null, value: '52', unit: 'U/L', referenceMin: null, referenceMax: 45 },
        { testName: 'HbA1c', knownTest: null, value: 5.4, unit: '%', referenceMin: 4, referenceMax: 5.6 },
        { testName: 'Urine Creatinine', knownTest: null, value: 88, unit: 'mg/dL', referenceMin: null, referenceMax: null },
        { testName: 'Magnesium', knownTest: 'NotATest', value: 2.0, unit: 'mg/dL', referenceMin: 2.6, referenceMax: 1.6 },
      ],
    })
    expect(r.values.map((v) => [v.testName, v.panel, v.isAbnormal])).toEqual([
      ['SGPT (ALT)', 'other', true],
      ['HbA1c', 'other', false],
      ['Urine Creatinine', 'other', false],
      ['Magnesium', 'other', false],
    ])
    expect(r.values[0]).toMatchObject({ value: 52, unit: 'U/L', referenceMax: 45 })
    expect(r.values[0]).not.toHaveProperty('referenceMin')
    expect(r.values[3]).toMatchObject({ referenceMin: 1.6, referenceMax: 2.6 })
  })

  it('drops prototype names, names without letters, duplicates and non-numeric values', () => {
    const r = validateExtraction({
      values: [
        { testName: 'toString', value: 1 },
        { testName: '__proto__', value: 1 },
        { testName: '12.5', value: 1 },
        { testName: 'eGFR', value: 'high' },
        { testName: 'ESR', value: 'Nil' },
        { testName: 'Potassium', value: 4.1, unit: 'mEq/L' },
        { testName: 'potassium', value: 9.9, unit: 'mEq/L' },
        { testName: 'ESR', value: 12, unit: 'mm/hr' },
        { testName: 'esr', value: 30, unit: 'mm/hr' },
        null,
        'Sodium 140',
      ],
    })
    expect(r.values.map((v) => [v.testName, v.value])).toEqual([['Potassium', 4.1], ['ESR', 12]])
  })

  it('caps a record at 200 values', () => {
    const many = Array.from({ length: 250 }, (_, i) => ({ testName: `Test ${i}`, value: i, unit: '' }))
    expect(validateExtraction({ values: many }).values).toHaveLength(MAX_RECORD_VALUES)
  })
  it('tolerates missing or malformed top-level fields', () => {
    expect(validateExtraction(null)).toEqual({ values: [], date: null, labName: null })
    expect(validateExtraction({ values: 'nope', date: 42, labName: '' })).toEqual({ values: [], date: null, labName: null })
    expect(validateExtraction({ values: [], date: '31/02/2026' }).date).toBeNull()
    expect(validateExtraction({ values: [], date: '05/03/2026' }).date).toBe('2026-03-05')
  })
})

describe('mergeLabValues', () => {
  it('keeps the primary values and adds only tests it lacks', () => {
    const a = validateExtraction({ values: [{ testName: 'Creatinine', value: 1.1 }] }).values
    const b = validateExtraction({
      values: [
        { testName: 'Creatinine', value: 9.9 },
        { testName: 'SGOT (AST)', value: 30, unit: 'U/L' },
      ],
    }).values
    expect(mergeLabValues(a, b).map((v) => [v.testName, v.value])).toEqual([['Creatinine', 1.1], ['SGOT (AST)', 30]])
  })
})

describe('parseExtractionText', () => {
  it('parses JSON text and survives garbage', () => {
    expect(parseExtractionText('{"values":[{"testName":"Sodium","value":140,"unit":"mEq/L"}],"date":null,"labName":null}').values).toHaveLength(1)
    expect(parseExtractionText('not json')).toEqual({ values: [], date: null, labName: null })
    expect(parseExtractionText(undefined)).toEqual({ values: [], date: null, labName: null })
  })
})

describe('guessLabName', () => {
  it('recognises common Indian labs', () => {
    expect(guessLabName('METROPOLIS HEALTHCARE LTD')).toBe('Metropolis Healthcare')
    expect(guessLabName('Dr Lal PathLabs')).toBe('Dr Lal PathLabs')
    expect(guessLabName('Unknown')).toBeNull()
  })
})
