import { describe, expect, it } from 'vitest'
import { METROPOLIS_PATTERNS, parseLabText, parseWithRegex, toLabValue } from '@/lib/parsing/metropolis'
import { REFERENCE_RANGES } from '@/lib/constants/reference-ranges'
import type { LabValue } from '@/lib/types/lab-record'

// All report text below is synthetic, laid out like pdf-parse output of a
// Metropolis report: one test per line — name, result, unit, reference range.

function byName(values: LabValue[]): Record<string, LabValue> {
  return Object.fromEntries(values.map((v) => [v.testName, v]))
}

function valueOf(text: string, testName: string): number | undefined {
  return byName(parseWithRegex(text))[testName]?.value
}

const FULL_REPORT = `
Metropolis Healthcare (synthetic sample)
Patient Name : TEST PATIENT          Age/Sex : 40 Y / M
Collection Date : 11/09/2024 10:42
Report Date : 12/09/2024 18:00

COMPLETE BLOOD COUNT
Haemoglobin (Hb)          14.1  g/dL        13.0 - 17.0
Total RBC Count           4.82  mill/cumm   4.5 - 5.5
Total Leucocyte Count     7.2   10^3/µL     4.0 - 10.0
Platelet Count            2.45  Lakhs/cumm  1.5 - 4.1
PCV                       43.5  %           40 - 50
MCV                       90.2  fL          83 - 101
MCH                       29.3  pg          27 - 32
MCHC                      32.4  g/dL        31.5 - 34.5

KIDNEY FUNCTION TEST
Creatinine, Serum         1.12  mg/dL       0.70 - 1.30
eGFR (CKD-EPI 2021)       78    mL/min/1.73m²  >60
Blood Urea Nitrogen (BUN) 14    mg/dL       7 - 20
Urea, Serum               30    mg/dL       15 - 43
Uric Acid, Serum          5.6   mg/dL       3.5 - 7.2
BUN/Creatinine Ratio      12.5               10 - 20
Urine Creatinine          88    mg/dL

TACROLIMUS
Tacrolimus, Whole Blood   6.8   ng/mL       5 - 10

ELECTROLYTES
Sodium (Na+)              139   mEq/L       136 - 146
Potassium (K+)            4.4   mEq/L       3.5 - 5.1
Chloride (Cl-)            103   mEq/L       98 - 106
Calcium, Total            9.4   mg/dL       8.5 - 10.5
Ionized Calcium           1.2   mmol/L      1.1 - 1.3
Phosphorus, Inorganic     3.6   mg/dL       2.5 - 4.5

LIPID PROFILE
Cholesterol, Total        182   mg/dL       <200
Triglycerides             140   mg/dL       <150
HDL Cholesterol           46    mg/dL       >40
Non-HDL Cholesterol       136   mg/dL       <130
VLDL Cholesterol          24    mg/dL       <30
LDL Cholesterol, Direct   92    mg/dL       <100
Cholesterol/HDL Ratio     3.9                <5

URINE ROUTINE
Reaction (pH)             6.0               4.5 - 8.0
Specific Gravity          1.020             1.005 - 1.030
`

describe('parseLabText — full synthetic report', () => {
  const { values, date } = parseLabText(FULL_REPORT)
  const v = byName(values)

  const expected: [string, number][] = [
    ['Hemoglobin', 14.1],
    ['RBC Count', 4.82],
    ['WBC Count', 7200],
    ['Platelet Count', 245000],
    ['PCV/Hematocrit', 43.5],
    ['MCV', 90.2],
    ['MCH', 29.3],
    ['MCHC', 32.4],
    ['Creatinine', 1.12],
    ['eGFR', 78],
    ['BUN', 14],
    ['Urea', 30],
    ['Uric Acid', 5.6],
    ['BUN/Creatinine Ratio', 12.5],
    ['Tacrolimus', 6.8],
    ['Sodium', 139],
    ['Potassium', 4.4],
    ['Chloride', 103],
    ['Calcium', 9.4],
    ['Phosphorus', 3.6],
    ['Total Cholesterol', 182],
    ['Triglycerides', 140],
    ['HDL Cholesterol', 46],
    ['VLDL Cholesterol', 24],
    ['LDL Cholesterol', 92],
    ['Urine pH', 6.0],
    ['Specific Gravity', 1.02],
  ]

  it.each(expected)('extracts %s = %s', (name, value) => {
    expect(v[name], `${name} missing`).toBeDefined()
    expect(v[name].value).toBeCloseTo(value, 6)
  })

  it('extracts every METROPOLIS_PATTERNS test exactly once', () => {
    expect(values).toHaveLength(Object.keys(METROPOLIS_PATTERNS).length)
    expect(new Set(values.map((x) => x.testName)).size).toBe(values.length)
  })

  it('fills panel, unit and reference range from REFERENCE_RANGES', () => {
    for (const val of values) {
      const ref = REFERENCE_RANGES[val.testName]
      expect(val.panel).toBe(ref.panel)
      expect(val.unit).toBe(ref.unit)
      expect(val.referenceMin).toBe(ref.min)
      expect(val.referenceMax).toBe(ref.max)
    }
  })

  it('flags nothing abnormal when everything is in range', () => {
    expect(values.filter((x) => x.isAbnormal).map((x) => x.testName)).toEqual([])
  })

  it('reads the collection date day-first', () => {
    expect(date).toBe('2024-09-11')
  })
})

describe('parseWithRegex — look-alike test names', () => {
  it('"Urine Creatinine" does not populate Creatinine', () => {
    expect(valueOf('Urine Creatinine   88  mg/dL', 'Creatinine')).toBeUndefined()
    expect(valueOf('Urine Creatinine   88  mg/dL\nCreatinine, Serum  1.12 mg/dL', 'Creatinine')).toBe(1.12)
  })

  it('"BUN/Creatinine Ratio" populates neither Creatinine nor BUN', () => {
    const text = 'BUN/Creatinine Ratio   12.5    10 - 20'
    const v = byName(parseWithRegex(text))
    expect(v['Creatinine']).toBeUndefined()
    expect(v['BUN']).toBeUndefined()
    expect(v['BUN/Creatinine Ratio']?.value).toBe(12.5)
  })

  it('"BUN / Serum Creatinine Ratio" spacing variant', () => {
    expect(valueOf('BUN / Serum Creatinine Ratio  15', 'BUN/Creatinine Ratio')).toBe(15)
  })

  it('"Blood Urea Nitrogen" populates BUN but not Urea', () => {
    const v = byName(parseWithRegex('Blood Urea Nitrogen   14  mg/dL'))
    expect(v['BUN']?.value).toBe(14)
    expect(v['Urea']).toBeUndefined()
  })

  it('"VLDL Cholesterol" populates neither LDL nor HDL', () => {
    const v = byName(parseWithRegex('VLDL Cholesterol   24  mg/dL  <30'))
    expect(v['VLDL Cholesterol']?.value).toBe(24)
    expect(v['LDL Cholesterol']).toBeUndefined()
    expect(v['HDL Cholesterol']).toBeUndefined()
  })

  it('"Non-HDL Cholesterol" does not populate HDL or Total Cholesterol', () => {
    const v = byName(parseWithRegex('Non-HDL Cholesterol   136  mg/dL'))
    expect(v['HDL Cholesterol']).toBeUndefined()
    expect(v['Total Cholesterol']).toBeUndefined()
  })

  it('ratio lines do not populate HDL/LDL/Total Cholesterol', () => {
    const v = byName(parseWithRegex('Cholesterol/HDL Ratio  3.9\nLDL/HDL Ratio  2.0'))
    expect(v['HDL Cholesterol']).toBeUndefined()
    expect(v['LDL Cholesterol']).toBeUndefined()
    expect(v['Total Cholesterol']).toBeUndefined()
  })

  it('HDL/LDL variants', () => {
    expect(valueOf('HDL-C  48', 'HDL Cholesterol')).toBe(48)
    expect(valueOf('HDL Cholesterol, Direct  48', 'HDL Cholesterol')).toBe(48)
    expect(valueOf('Direct LDL  101', 'LDL Cholesterol')).toBe(101)
    expect(valueOf('LDL Cholesterol, Calculated  97', 'LDL Cholesterol')).toBe(97)
  })

  it('MCH and MCHC are kept apart regardless of order', () => {
    const a = byName(parseWithRegex('MCHC  33.1  g/dL\nMCH  29.0  pg'))
    expect(a['MCH']?.value).toBe(29.0)
    expect(a['MCHC']?.value).toBe(33.1)

    const onlyMchc = byName(parseWithRegex('MCHC  33.1  g/dL'))
    expect(onlyMchc['MCH']).toBeUndefined()
    expect(onlyMchc['MCHC']?.value).toBe(33.1)
  })

  it('"Ionized Calcium" does not populate Calcium', () => {
    expect(valueOf('Ionized Calcium  1.2  mmol/L', 'Calcium')).toBeUndefined()
  })

  it('"Phosphorus" is not read as urine pH (case-insensitive patterns)', () => {
    const v = byName(parseWithRegex('Phosphorus  3.4  mg/dL'))
    expect(v['Urine pH']).toBeUndefined()
    expect(v['Phosphorus']?.value).toBe(3.4)
  })

  it('HbA1c / glycated haemoglobin do not populate Hemoglobin', () => {
    expect(valueOf('HbA1c  5.6  %', 'Hemoglobin')).toBeUndefined()
    expect(valueOf('Glycated Haemoglobin (HbA1c)  5.6  %', 'Hemoglobin')).toBeUndefined()
    expect(valueOf('Mean Corpuscular Hemoglobin (MCH)  29  pg', 'Hemoglobin')).toBeUndefined()
  })

  it('first matching line wins', () => {
    expect(valueOf('Creatinine  1.1\nCreatinine  2.2', 'Creatinine')).toBe(1.1)
  })
})

describe('parseWithRegex — layout robustness', () => {
  it('does not capture a reference-range number from a neighbouring line', () => {
    const text = 'Creatinine, Serum\n0.70 - 1.30\nHaemoglobin\n13.0 - 17.0'
    const v = byName(parseWithRegex(text))
    expect(v['Creatinine']).toBeUndefined()
    expect(v['Hemoglobin']).toBeUndefined()
  })

  it('reads the result, not the reference range, on the same line', () => {
    expect(valueOf('Creatinine  1.62  mg/dL  0.70 - 1.30', 'Creatinine')).toBe(1.62)
  })

  it('handles columns with no whitespace between them', () => {
    expect(valueOf('Creatinine1.12mg/dL0.70 - 1.30', 'Creatinine')).toBe(1.12)
    expect(valueOf('Sodium139mEq/L136 - 146', 'Sodium')).toBe(139)
  })

  it('handles colon / dash separators and leading indentation', () => {
    expect(valueOf('   Potassium : 4.2 mEq/L', 'Potassium')).toBe(4.2)
    expect(valueOf('\tSodium - 140', 'Sodium')).toBe(140)
  })

  it('is case-insensitive on test names', () => {
    expect(valueOf('CREATININE, SERUM  1.12', 'Creatinine')).toBe(1.12)
    expect(valueOf('haemoglobin  14', 'Hemoglobin')).toBe(14)
  })

  it('handles CRLF line endings', () => {
    const v = byName(parseWithRegex('Creatinine  1.12\r\nSodium  139\r\n'))
    expect(v['Creatinine']?.value).toBe(1.12)
    expect(v['Sodium']?.value).toBe(139)
  })

  it('ignores lines without a numeric result', () => {
    expect(parseWithRegex('Creatinine  Pending\nSodium  --')).toEqual([])
    expect(parseWithRegex('')).toEqual([])
  })

  it('reads Tacrolimus with qualifiers', () => {
    expect(valueOf('Tacrolimus  6.8 ng/mL', 'Tacrolimus')).toBe(6.8)
    expect(valueOf('Tacrolimus Trough  6.8 ng/mL', 'Tacrolimus')).toBe(6.8)
    expect(valueOf('Tacrolimus Level  6.8 ng/mL', 'Tacrolimus')).toBe(6.8)
    expect(valueOf('Tacrolimus (LC-MS/MS)  6.8 ng/mL', 'Tacrolimus')).toBe(6.8)
  })

  it('reads multi-word Tacrolimus labels', () => {
    expect(valueOf('Tacrolimus Trough Level  6.8 ng/mL', 'Tacrolimus')).toBe(6.8)
    expect(valueOf('Tacrolimus Trough Levels: 6.8 ng/mL', 'Tacrolimus')).toBe(6.8)
    expect(valueOf('Tacrolimus C0 Level  6.8 ng/mL', 'Tacrolimus')).toBe(6.8)
    expect(valueOf('Tacrolimus Whole Blood (EDTA)  6.8 ng/mL', 'Tacrolimus')).toBe(6.8)
    expect(valueOf('Tacrolimus Level, Whole Blood (LC-MS/MS)  6.8 ng/mL', 'Tacrolimus')).toBe(6.8)
  })

  it('does not read a Tacrolimus value from the next line', () => {
    expect(valueOf('Tacrolimus Trough Level\n6.8 ng/mL', 'Tacrolimus')).toBeUndefined()
  })
})

describe('parseWithRegex — unit conversions', () => {
  it.each([
    ['WBC Count  7200  /cumm', 7200],
    ['WBC Count  7,200  /cumm', 7200],
    ['Total Leucocyte Count  7.2  10^3/µL', 7200],
    ['Total Leukocyte Count  7.2  10*3/uL', 7200],
    ['TLC  7.8  thou/mm3', 7800],
    ['W.B.C. Count  6.5  K/uL', 6500],
    ['WBC Count  6.5  x10³/µL', 6500],
    ['WBC Count  9  /nL', 9000],
    ['WBC Count  65  ', 65000], // bare small number assumed to be thousands
  ])('WBC: %s -> %d', (line, expected) => {
    expect(valueOf(line, 'WBC Count')).toBe(expected)
  })

  it.each([
    ['Platelet Count  2.45  Lakhs/cumm', 245000],
    ['Platelet Count  2.45  lakh/µL', 245000],
    ['Platelet Count  245  10^3/µL', 245000],
    ['Platelets  180', 180000],
    ['Platelet Count  245000  /cumm', 245000],
    ['Platelet Count  2,45,000  /cumm', 245000],
  ])('Platelets: %s -> %d', (line, expected) => {
    expect(valueOf(line, 'Platelet Count')).toBe(expected)
  })

  it('does not scale other tests', () => {
    expect(valueOf('RBC Count  4.8  10^6/µL', 'RBC Count')).toBe(4.8)
  })
})

describe('isAbnormal flags', () => {
  it('flags values outside REFERENCE_RANGES', () => {
    const text = [
      'Creatinine  1.62  mg/dL',
      'eGFR  48',
      'Potassium  5.6',
      'Haemoglobin  11.2',
      'Platelet Count  1.2  Lakhs/cumm',
      'Sodium  140',
      'Tacrolimus  10',
    ].join('\n')
    const v = byName(parseWithRegex(text))
    expect(v['Creatinine'].isAbnormal).toBe(true)
    expect(v['eGFR'].isAbnormal).toBe(true)
    expect(v['Potassium'].isAbnormal).toBe(true)
    expect(v['Hemoglobin'].isAbnormal).toBe(true)
    expect(v['Platelet Count'].isAbnormal).toBe(true) // 120000 < 150000
    expect(v['Sodium'].isAbnormal).toBe(false)
    expect(v['Tacrolimus'].isAbnormal).toBe(false) // boundary is inclusive
  })
})

describe('toLabValue', () => {
  it('returns null for unknown tests and non-finite values', () => {
    expect(toLabValue('Not A Test', 1)).toBeNull()
    expect(toLabValue('Creatinine', NaN)).toBeNull()
    expect(toLabValue('Creatinine', Infinity)).toBeNull()
  })

  it('uses the given unit or falls back to the reference unit', () => {
    expect(toLabValue('Creatinine', 1)?.unit).toBe('mg/dL')
    expect(toLabValue('Creatinine', 88, 'µmol/L')?.unit).toBe('µmol/L')
  })

  it('treats range bounds as in range', () => {
    expect(toLabValue('Creatinine', 0.7)?.isAbnormal).toBe(false)
    expect(toLabValue('Creatinine', 1.3)?.isAbnormal).toBe(false)
    expect(toLabValue('Creatinine', 1.31)?.isAbnormal).toBe(true)
    expect(toLabValue('Creatinine', 0.69)?.isAbnormal).toBe(true)
  })
})
