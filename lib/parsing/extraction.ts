import { REFERENCE_RANGES } from '@/lib/constants/reference-ranges'
import type { LabValue } from '@/lib/types/lab-record'
import { parseDateString } from './date'
import { toLabValue } from './metropolis'

/**
 * Model-based lab extraction: the JSON schema sent to Gemini and the
 * validation of whatever comes back. Pure (no SDK import) so it is unit
 * tested; lib/server/gemini.ts wraps it in the actual API call.
 *
 * Never trust the model: names must be exact REFERENCE_RANGES keys, values
 * must coerce to finite numbers, the first occurrence of a test wins.
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
          testName: { type: 'STRING', enum: EXTRACTABLE_TESTS },
          value: { type: 'NUMBER' },
          unit: { type: 'STRING' },
        },
        required: ['testName', 'value', 'unit'],
        propertyOrdering: ['testName', 'value', 'unit'],
      },
    },
  },
  required: ['date', 'labName', 'values'],
  propertyOrdering: ['date', 'labName', 'values'],
} as const

export const EXTRACTION_INSTRUCTIONS = `Extract lab test results from this medical lab report (usually an Indian lab; numeric dates are DD/MM/YYYY).
Only include tests whose name maps to one of the allowed testName values; skip everything else.
Use the patient's measured result, never the reference range. Use the sample collection date if shown.
Report cell counts (WBC, platelets) per µL (e.g. 7.2 x10^3/µL -> 7200, 2.45 lakhs/cumm -> 245000).
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

/** Validate a parsed model response (already JSON.parse'd). */
export function validateExtraction(raw: unknown): ExtractionResult {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const values: LabValue[] = []
  const seen = new Set<string>()
  for (const item of Array.isArray(obj.values) ? obj.values : []) {
    if (!item || typeof item !== 'object') continue
    const { testName, value, unit } = item as Record<string, unknown>
    if (typeof testName !== 'string' || !Object.prototype.hasOwnProperty.call(REFERENCE_RANGES, testName)) continue
    if (seen.has(testName)) continue
    const num = coerceNumber(value)
    if (num == null) continue
    const lv = toLabValue(testName, num, typeof unit === 'string' && unit.trim() ? unit.trim().slice(0, 30) : undefined)
    if (!lv) continue
    values.push(lv)
    seen.add(testName)
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
