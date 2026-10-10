import { REFERENCE_RANGES } from '@/lib/constants/reference-ranges'
import type { LabValue } from '@/lib/types/lab-record'
import { extractReportDate } from './date'

// Regex extraction for Metropolis Healthcare reports (text from pdf-parse).
//
// pdf-parse output is line-oriented: one test per line, with the name, result,
// unit and reference range in that order, sometimes with no whitespace between
// columns. Every pattern is therefore anchored at the start of a line (m flag)
// and only looks for the result on the SAME line, so that:
//   - "Urine Creatinine", "Non-HDL Cholesterol", "VLDL Cholesterol" and
//     "Ionized Calcium" don't match "Creatinine" / "HDL" / "LDL" / "Calcium"
//   - "BUN/Creatinine Ratio" doesn't match "BUN" or "Creatinine"
//   - a reference-range number on a following line is never captured
//
// Synthetic sample (not real patient data):
//   Haemoglobin (Hb)          14.1  g/dL        13.0 - 17.0
//   Platelet Count            2.45  Lakhs/cumm  1.5 - 4.1
//   Creatinine, Serum         1.12  mg/dL       0.70 - 1.30
//   BUN/Creatinine Ratio      12.5               10 - 20
//   Urine Creatinine          88    mg/dL
//   HDL Cholesterol           46    mg/dL       >40
//   VLDL Cholesterol          24    mg/dL       <30
//   LDL Cholesterol, Direct   92    mg/dL       <100
//   Collection Date : 11/09/2024 10:42
// -> Hemoglobin 14.1, Platelet Count 245000, Creatinine 1.12,
//    BUN/Creatinine Ratio 12.5, HDL 46, VLDL 24, LDL 92, date 2024-09-11

const NUM = '(\\d[\\d,]*(?:\\.\\d+)?)'
// Optional specimen qualifier and/or parenthetical method after the name,
// e.g. "Creatinine, Serum", "Haemoglobin (Hb)", "eGFR (CKD-EPI 2021)"
const QUALIFIER = '(?:[ \\t]*,?[ \\t]*(?:Serum|Plasma|Whole[ \\t]+Blood|Blood|EDTA))?(?:[ \\t]*\\([^)\\n]*\\))?'
// Separator between name and value: horizontal whitespace, colon or dash only
const SEP = '[ \\t:\\-]*'

/** Build a line-anchored pattern: group 1 = value, group 2 = rest of the line. */
function line(name: string): RegExp {
  return new RegExp(`^[ \\t]*(?:${name})${QUALIFIER}${SEP}${NUM}([^\\n]*)`, 'im')
}

/**
 * Cell counts are reported either as absolute /µL or in thousands (10^3/µL)
 * or lakhs. Normalise to /µL, which is what REFERENCE_RANGES uses.
 */
function perMicrolitre(thousandsBelow: number) {
  return (value: number, rest: string): number => {
    if (/lakh/i.test(rest)) return Math.round(value * 100000)
    if (/10\s*(?:\^|\*\*)\s*3|10³|thou|\bK\s*\/|\/\s*nL/i.test(rest) || value < thousandsBelow) {
      return Math.round(value * 1000)
    }
    return value
  }
}

export interface PatternDef {
  pattern: RegExp
  /** Optional unit normalisation, given the parsed number and the rest of the line. */
  normalize?: (value: number, rest: string) => number
}

/** Keys MUST match REFERENCE_RANGES test names exactly. */
export const METROPOLIS_PATTERNS: Record<string, PatternDef> = {
  // Hemogram
  'Hemoglobin': { pattern: line('Ha?emoglobin|Hb') },
  'RBC Count': { pattern: line('(?:Total[ \\t]+)?R\\.?B\\.?C\\.?[ \\t]*Count|Red[ \\t]+Blood[ \\t]+Cell[ \\t]+Count|Erythrocyte[ \\t]+Count') },
  'WBC Count': {
    pattern: line('(?:Total[ \\t]+)?W\\.?B\\.?C\\.?[ \\t]*Count|Total[ \\t]+Leu[ck]ocyte[ \\t]+Count|TLC'),
    normalize: perMicrolitre(100),
  },
  'Platelet Count': { pattern: line('Platelet[ \\t]*Count|Platelets'), normalize: perMicrolitre(2000) },
  'PCV/Hematocrit': { pattern: line('PCV|Packed[ \\t]+Cell[ \\t]+Volume|Ha?ematocrit|HCT') },
  'MCV': { pattern: line('MCV') },
  'MCH': { pattern: line('MCH') }, // "MCHC 33" fails: "C" isn't a number
  'MCHC': { pattern: line('MCHC') },

  // Kidney
  'Creatinine': { pattern: line('(?:Serum[ \\t]+)?Creatinine') },
  'eGFR': { pattern: line('eGFR|Estimated[ \\t]+GFR|GFR|Glomerular[ \\t]+Filtration[ \\t]+Rate') },
  'BUN': { pattern: line('BUN|Blood[ \\t]+Urea[ \\t]+Nitrogen') }, // "BUN/..." fails: "/" isn't a number
  'Urea': { pattern: line('(?:Serum[ \\t]+|Blood[ \\t]+)?Urea') }, // "Blood Urea Nitrogen" fails on "Nitrogen"
  'Uric Acid': { pattern: line('(?:Serum[ \\t]+)?Uric[ \\t]+Acid') },
  'BUN/Creatinine Ratio': { pattern: line('BUN[ \\t]*\\/[ \\t]*(?:Serum[ \\t]+)?Creatinine[ \\t]+Ratio') },

  // Tacrolimus
  // Up to three qualifier words before the value, same line only, e.g.
  // "Tacrolimus Trough Level", "Tacrolimus Whole Blood (EDTA)", "Tacrolimus C0"
  'Tacrolimus': { pattern: line('Tacrolimus(?:[ \\t]+(?:Trough|Levels?|Whole|Blood|C0|\\(EDTA\\))){0,3}') },

  // Electrolytes
  'Sodium': { pattern: line('(?:Serum[ \\t]+)?Sodium') },
  'Potassium': { pattern: line('(?:Serum[ \\t]+)?Potassium') },
  'Chloride': { pattern: line('(?:Serum[ \\t]+)?Chloride') },
  'Calcium': { pattern: line('(?:Serum[ \\t]+|Total[ \\t]+)?Calcium(?:[ \\t]*,[ \\t]*Total)?') },
  'Phosphorus': { pattern: line('(?:Serum[ \\t]+|Inorganic[ \\t]+)?Phosph(?:orus|ate)(?:[ \\t]*,[ \\t]*Inorganic)?') },

  // Lipids (line anchoring keeps HDL/LDL out of "VLDL" and "Non-HDL")
  'Total Cholesterol': { pattern: line('(?:Total[ \\t]+)?Cholesterol(?:[ \\t]*,[ \\t]*Total)?') },
  'Triglycerides': { pattern: line('Triglycerides?') },
  'HDL Cholesterol': { pattern: line('HDL(?:[ \\t]*-?[ \\t]*(?:Cholesterol|C))?(?:[ \\t]*,[ \\t]*Direct)?') },
  'LDL Cholesterol': { pattern: line('(?:Direct[ \\t]+)?LDL(?:[ \\t]*-?[ \\t]*(?:Cholesterol|C))?(?:[ \\t]*,[ \\t]*(?:Direct|Calculated))?') },
  'VLDL Cholesterol': { pattern: line('VLDL(?:[ \\t]*-?[ \\t]*(?:Cholesterol|C))?') },

  // Urine routine
  'Urine pH': { pattern: line('(?:Urine[ \\t]+)?pH|Reaction[ \\t]*\\(pH\\)') },
  'Specific Gravity': { pattern: line('(?:Urine[ \\t]+)?Specific[ \\t]+Gravity') },
}

/** Build a LabValue for a known test name, flagging against REFERENCE_RANGES. */
export function toLabValue(testName: string, value: number, unit?: string): LabValue | null {
  const ref = REFERENCE_RANGES[testName]
  if (!ref || !Number.isFinite(value)) return null
  return {
    testName,
    panel: ref.panel,
    value,
    unit: unit || ref.unit,
    referenceMin: ref.min,
    referenceMax: ref.max,
    isAbnormal: value < ref.min || value > ref.max,
  }
}

/** Run every Metropolis pattern over the text; first match per test wins. */
export function parseWithRegex(text: string): LabValue[] {
  const values: LabValue[] = []
  for (const [testName, def] of Object.entries(METROPOLIS_PATTERNS)) {
    const match = text.match(def.pattern)
    if (!match) continue
    let num = parseFloat(match[1].replace(/,/g, ''))
    if (isNaN(num)) continue
    if (def.normalize) num = def.normalize(num, match[2] || '')
    const labValue = toLabValue(testName, num)
    if (labValue) values.push(labValue)
  }
  return values
}

/** Pure entry point: extract lab values and the report date from PDF text. */
export function parseLabText(text: string): { values: LabValue[]; date: string | null } {
  return { values: parseWithRegex(text), date: extractReportDate(text) }
}
