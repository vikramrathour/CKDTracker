import { REFERENCE_RANGES } from '@/lib/constants/reference-ranges'
import { cleanTestName, MAX_RECORD_VALUES, toOtherLabValue } from '@/lib/parsing/extraction'
import type { LabValue } from '@/lib/types/lab-record'

/**
 * Per-document extraction cache: patients/{pid}/documents/{docId}.extraction,
 * written only by /api/documents/extract (Admin SDK; firestore.rules stop
 * clients from writing the field). Repeat extractions of the same file return
 * it instead of calling Gemini again. Pure, so it is unit tested.
 *
 * Entries without the current CACHE_VERSION (v1 kept only the known tests)
 * are ignored, so those documents are read again in full.
 */

export const CACHE_VERSION = 2

export type CachedMethod = 'regex' | 'gemini' | 'none'

export interface CachedExtraction {
  version: number
  values: LabValue[]
  date: string | null
  labName: string | null
  method: CachedMethod
  note: string | null
}

const METHODS: readonly CachedMethod[] = ['regex', 'gemini', 'none']

/** Firestore-safe copy of an extraction result (no `undefined` anywhere). */
export function toCachedExtraction(r: {
  values: LabValue[]
  date: string | null
  labName: string | null
  method: CachedMethod
  note?: string | null
}): CachedExtraction {
  return {
    version: CACHE_VERSION,
    values: JSON.parse(JSON.stringify(r.values ?? [])) as LabValue[],
    date: r.date ?? null,
    labName: r.labName ?? null,
    method: METHODS.includes(r.method) ? r.method : 'none',
    note: typeof r.note === 'string' ? r.note.slice(0, 300) : null,
  }
}

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

/**
 * Keep only well-formed values (first occurrence wins): known tests get their
 * REFERENCE_RANGES panel, any other test is re-cleaned into the 'other' panel.
 */
function cleanValues(raw: unknown[]): LabValue[] {
  const out: LabValue[] = []
  const seen = new Set<string>()
  for (const item of raw.slice(0, MAX_RECORD_VALUES)) {
    if (!item || typeof item !== 'object') continue
    const v = item as Record<string, unknown>
    const value = num(v.value)
    if (value === undefined) continue
    const known = typeof v.testName === 'string' && Object.prototype.hasOwnProperty.call(REFERENCE_RANGES, v.testName)
    if (!known) {
      const name = cleanTestName(v.testName)
      if (!name || seen.has(name.toLowerCase())) continue
      seen.add(name.toLowerCase())
      out.push(toOtherLabValue(name, value, v.unit, v.referenceMin, v.referenceMax))
      continue
    }
    const testName = v.testName as string
    const ref = REFERENCE_RANGES[testName]
    if (seen.has(testName.toLowerCase())) continue
    seen.add(testName.toLowerCase())
    const lv: LabValue = {
      testName,
      panel: ref.panel,
      value,
      unit: typeof v.unit === 'string' && v.unit ? v.unit.slice(0, 30) : ref.unit,
      isAbnormal: typeof v.isAbnormal === 'boolean' ? v.isAbnormal : value < ref.min || value > ref.max,
    }
    const min = num(v.referenceMin)
    const max = num(v.referenceMax)
    if (min !== undefined) lv.referenceMin = min
    if (max !== undefined) lv.referenceMax = max
    out.push(lv)
  }
  return out
}

/** Read back a stored cache entry, re-validated; null when absent or malformed. */
export function fromCachedExtraction(raw: unknown): CachedExtraction | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  if (obj.version !== CACHE_VERSION) return null
  if (!Array.isArray(obj.values) || !METHODS.includes(obj.method as CachedMethod)) return null
  const values = cleanValues(obj.values)
  return {
    version: CACHE_VERSION,
    values,
    date: typeof obj.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(obj.date) ? obj.date : null,
    labName: typeof obj.labName === 'string' && obj.labName.trim() ? obj.labName.trim().slice(0, 120) : null,
    method: values.length ? (obj.method as CachedMethod) : 'none',
    note: typeof obj.note === 'string' ? obj.note.slice(0, 300) : null,
  }
}
