import { REFERENCE_RANGES } from '@/lib/constants/reference-ranges'
import type { LabValue } from '@/lib/types/lab-record'
import { parseDateString } from './date'
import { toLabValue } from './metropolis'

/**
 * Model-based lab extraction: the JSON schema sent to Gemini and the
 * validation of whatever comes back. Pure (no SDK import) so it is unit
 * tested; lib/server/gemini.ts wraps it in the actual API call.
 *
 * The model returns EVERY numeric result on the report. Tests it maps to a
 * REFERENCE_RANGES key (`knownTest`) get the app's vocabulary, panel and
 * ranges; everything else is kept under its printed name in the 'other'
 * panel, flagged against the range printed on the report.
 *
 * Never trust the model: canonical names must be exact REFERENCE_RANGES keys,
 * other names are cleaned, values must coerce to finite numbers, the first
 * occurrence of a test wins.
 */

export const EXTRACTABLE_TESTS: string[] = Object.keys(REFERENCE_RANGES)

/**
 * Gemini `responseSchema` (OpenAPI subset). Plain strings for `type` so this
 * module doesn't depend on the SDK; the values equal `Type.OBJECT` etc.
 */
export const EXTRACTION_SCHEMA = {
  type: 'OBJECT',
  properties: {
    date: { type: 'STRING', nullable: true, description: 'Sample collection date as YYYY-MM-DD, or null' },
    labName: { type: 'STRING', nullable: true, description: 'Name of the laboratory that issued the report, or null' },
    values: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          testName: { type: 'STRING', description: 'Test name exactly as printed on the report' },
          knownTest: {
            type: 'STRING',
            enum: EXTRACTABLE_TESTS,
            nullable: true,
            description: 'The allowed name this test is, or null if it is none of them',
          },
          value: { type: 'NUMBER' },
          unit: { type: 'STRING' },
          referenceMin: { type: 'NUMBER', nullable: true, description: 'Lower bound of the printed reference range, or null' },
          referenceMax: { type: 'NUMBER', nullable: true, description: 'Upper bound of the printed reference range, or null' },
        },
        required: ['testName', 'knownTest', 'value', 'unit', 'referenceMin', 'referenceMax'],
        propertyOrdering: ['testName', 'knownTest', 'value', 'unit', 'referenceMin', 'referenceMax'],
      },
    },
  },
  required: ['date', 'labName', 'values'],
  propertyOrdering: ['date', 'labName', 'values'],
} as const

export const EXTRACTION_INSTRUCTIONS = `Extract every lab test result from this medical lab report (usually an Indian lab; numeric dates are DD/MM/YYYY).
Include every test with a numeric result, on every page, not only the common ones. Skip results that are text only (e.g. "Nil", "Absent", "Positive").
For each test give testName as printed, and knownTest = the allowed name it is (e.g. "Haemoglobin (Hb)" -> "Hemoglobin", "Creatinine, Serum" -> "Creatinine"), or null when it is none of them. Never map a different test onto an allowed name (e.g. "Urine Creatinine" is not "Creatinine").
Use the patient's measured result, never the reference range. Give the printed reference range as referenceMin/referenceMax (one side null for "<200" or ">40"; both null if none).
Use the sample collection date if shown.
For tests with a knownTest, report cell counts (WBC, platelets) per µL (e.g. 7.2 x10^3/µL -> 7200, 2.45 lakhs/cumm -> 245000). For other tests keep the value and unit as printed.
If the document is not a lab report or is unreadable, return an empty values list.`

export interface ExtractionResult {
  values: LabValue[]
  /** YYYY-MM-DD or null */
  date: string | null
  labName: string | null
}

/** "1,234.5" / " 7.2 " / 7.2 → number; anything else → null. */
export function coerceNumber(input: unknown): number | null {
  if (typeof input === 'number') return Number.isFinite(input) ? input : null
  if (typeof input !== 'string') return null
  const s = input.trim().replace(/,/g, '')
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(s)) return null
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : null
}

/** Lab records hold at most this many values (firestore.rules validLabRecord). */
export const MAX_RECORD_VALUES = 200

const KNOWN_BY_LOWER = new Map(Object.keys(REFERENCE_RANGES).map((k) => [k.toLowerCase(), k]))

/** The REFERENCE_RANGES key for a name (exact, or ignoring case), else null. */
export function knownTestName(name: unknown): string | null {
  if (typeof name !== 'string') return null
  if (Object.prototype.hasOwnProperty.call(REFERENCE_RANGES, name)) return name
  return KNOWN_BY_LOWER.get(name.trim().toLowerCase()) ?? null
}

/**
 * Clean a printed test name for the 'other' panel: single spaces, no control
 * characters, at most 80 chars, at least one Latin letter, and never an
 * Object.prototype name (test names are used as map keys). Null if unusable.
 */
export function cleanTestName(name: unknown): string | null {
  if (typeof name !== 'string') return null
  const s = name.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80).trim()
  if (!/[a-z]/i.test(s) || s in Object.prototype) return null
  return s
}

/** A value for a test outside REFERENCE_RANGES, flagged against its printed range. */
export function toOtherLabValue(testName: string, value: number, unit: unknown, min: unknown, max: unknown): LabValue {
  let lo = coerceNumber(min)
  let hi = coerceNumber(max)
  if (lo != null && hi != null && lo > hi) [lo, hi] = [hi, lo]
  const lv: LabValue = {
    testName,
    panel: 'other',
    value,
    unit: typeof unit === 'string' ? unit.trim().slice(0, 30) : '',
    isAbnormal: (lo != null && value < lo) || (hi != null && value > hi),
  }
  if (lo != null) lv.referenceMin = lo
  if (hi != null) lv.referenceMax = hi
  return lv
}

/**
 * Combine two extractions of the same report: every value from `primary`,
 * then values from `extra` for tests `primary` doesn't have (names compared
 * ignoring case), capped at MAX_RECORD_VALUES.
 */
export function mergeLabValues(primary: LabValue[], extra: LabValue[]): LabValue[] {
  const seen = new Set(primary.map((v) => v.testName.toLowerCase()))
  const out = [...primary]
  for (const v of extra) {
    const key = v.testName.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(v)
  }
  return out.slice(0, MAX_RECORD_VALUES)
}

/** Validate a parsed model response (already JSON.parse'd). */
export function validateExtraction(raw: unknown): ExtractionResult {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const values: LabValue[] = []
  const seen = new Set<string>()
  for (const item of Array.isArray(obj.values) ? obj.values : []) {
    if (values.length >= MAX_RECORD_VALUES) break
    if (!item || typeof item !== 'object') continue
    const { testName, knownTest, value, unit, referenceMin, referenceMax } = item as Record<string, unknown>
    const num = coerceNumber(value)
    if (num == null) continue
    const known = knownTestName(knownTest) ?? knownTestName(testName)
    if (known) {
      if (seen.has(known.toLowerCase())) continue
      const lv = toLabValue(known, num, typeof unit === 'string' && unit.trim() ? unit.trim().slice(0, 30) : undefined)
      if (!lv) continue
      values.push(lv)
      seen.add(known.toLowerCase())
      continue
    }
    const name = cleanTestName(testName)
    if (!name || seen.has(name.toLowerCase())) continue
    values.push(toOtherLabValue(name, num, unit, referenceMin, referenceMax))
    seen.add(name.toLowerCase())
  }
  const date = typeof obj.date === 'string' ? parseDateString(obj.date) : null
  const labName =
    typeof obj.labName === 'string' && obj.labName.trim() ? obj.labName.trim().replace(/\s+/g, ' ').slice(0, 120) : null
  return { values, date, labName }
}

/** Parse the model's JSON text; malformed JSON yields an empty result. */
export function parseExtractionText(text: string | undefined | null): ExtractionResult {
  if (!text) return { values: [], date: null, labName: null }
  try {
    return validateExtraction(JSON.parse(text))
  } catch {
    return { values: [], date: null, labName: null }
  }
}

/** Best guess at the issuing lab from report text. */
export function guessLabName(text: string): string | null {
  if (/metropolis/i.test(text)) return 'Metropolis Healthcare'
  if (/dr\.?\s*lal\s*path/i.test(text)) return 'Dr Lal PathLabs'
  if (/thyrocare/i.test(text)) return 'Thyrocare'
  if (/srl\s*diagnostics/i.test(text)) return 'SRL Diagnostics'
  return null
}
