import { describe, expect, it } from 'vitest'
import {
  EXTRACTABLE_TESTS,
  EXTRACTION_SCHEMA,
  coerceNumber,
  guessLabName,
  parseExtractionText,
  validateExtraction,
} from '@/lib/parsing/extraction'
import { REFERENCE_RANGES } from '@/lib/constants/reference-ranges'

// Synthetic model responses only.

describe('EXTRACTION_SCHEMA', () => {
  it('restricts testName to REFERENCE_RANGES keys', () => {
    const enumNames = EXTRACTION_SCHEMA.properties.values.items.properties.testName.enum
    expect([...enumNames].sort()).toEqual(Object.keys(REFERENCE_RANGES).sort())
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

  it('drops unknown names, near-misses, duplicates and non-numeric values', () => {
    const r = validateExtraction({
      values: [
        { testName: 'Serum Creatinine', value: 1.1 },
        { testName: 'creatinine', value: 1.1 },
        { testName: 'toString', value: 1 },
        { testName: '__proto__', value: 1 },
        { testName: 'eGFR', value: 'high' },
        { testName: 'Potassium', value: 4.1, unit: 'mEq/L' },
        { testName: 'Potassium', value: 9.9, unit: 'mEq/L' },
        null,
        'Sodium 140',
      ],
    })
    expect(r.values.map((v) => [v.testName, v.value])).toEqual([['Potassium', 4.1]])
  })

  it('tolerates missing or malformed top-level fields', () => {
    expect(validateExtraction(null)).toEqual({ values: [], date: null, labName: null })
    expect(validateExtraction({ values: 'nope', date: 42, labName: '' })).toEqual({ values: [], date: null, labName: null })
    expect(validateExtraction({ values: [], date: '31/02/2026' }).date).toBeNull()
    expect(validateExtraction({ values: [], date: '05/03/2026' }).date).toBe('2026-03-05')
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
